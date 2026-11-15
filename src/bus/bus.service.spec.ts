const publicar = jest.fn().mockResolvedValue(1);
const suscribir = jest.fn().mockResolvedValue('OK');
const disconnect = jest.fn();
const quit = jest.fn().mockResolvedValue('OK');
const eventHandlers: Record<string, (...args: unknown[]) => void> = {};

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    publish: publicar,
    subscribe: suscribir,
    disconnect,
    quit,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers[event] = handler;
    }),
  })),
);

import { BusService, type EventEnvelope } from './bus.service';

describe('BusService', () => {
  beforeEach(() => {
    publicar.mockClear();
    suscribir.mockClear();
    disconnect.mockClear();
    quit.mockClear();
  });

  it('ESC-06: el sobre lleva emittedAt (epoch ms) puesto al publicar, igual a at', async () => {
    const bus = new BusService('redis://falso:6379', 'planazo.events');
    const antes = Date.now();
    await bus.publish('PLACE.UPDATE', { placeId: 'p7', freeSeats: 3 }, ['zone:zona-t']);
    const despues = Date.now();

    expect(publicar).toHaveBeenCalledTimes(1);
    const [canal, json] = publicar.mock.calls[0] as [string, string];
    const sobre = JSON.parse(json) as EventEnvelope;
    expect(canal).toBe('planazo.events');
    expect(sobre).toMatchObject({ type: 'PLACE.UPDATE', topics: ['zone:zona-t'] });
    expect(sobre.emittedAt).toBe(sobre.at);
    expect(sobre.emittedAt).toBeGreaterThanOrEqual(antes);
    expect(sobre.emittedAt).toBeLessThanOrEqual(despues);
  });

  it('sin BUS_URL no publica nada', async () => {
    await new BusService('', 'planazo.events').publish('PROMO.PUSH', {}, ['zone:zona-t']);
    expect(publicar).not.toHaveBeenCalled();
  });

  it('onEvent sin BUS_URL no realiza suscripción', () => {
    const bus = new BusService('', 'planazo.events');
    const cb = jest.fn();
    bus.onEvent(cb);
    expect(suscribir).not.toHaveBeenCalled();
  });

  it('onEvent con BUS_URL suscribe al canal y despacha mensajes válidos', async () => {
    const bus = new BusService('redis://falso:6379', 'planazo.events');
    const cb = jest.fn().mockResolvedValue(undefined);
    bus.onEvent(cb);
    expect(suscribir).toHaveBeenCalledWith('planazo.events');

    // Mensaje de otro canal (debe ignorarse)
    eventHandlers['message']?.('otro.canal', JSON.stringify({ type: 'TEST' }));
    expect(cb).not.toHaveBeenCalled();

    // Mensaje con JSON inválido (no explota)
    eventHandlers['message']?.('planazo.events', 'no-es-json');
    expect(cb).not.toHaveBeenCalled();

    // Mensaje válido en el canal correcto
    const sobreValido: EventEnvelope = {
      id: 'e1',
      type: 'GAME.PODIUM',
      payload: { salaId: 's1' },
      topics: ['game'],
      at: Date.now(),
      emittedAt: Date.now(),
    };
    eventHandlers['message']?.('planazo.events', JSON.stringify(sobreValido));
    expect(cb).toHaveBeenCalledWith(sobreValido);
  });

  it('onModuleDestroy cierra cliente y suscriptor', async () => {
    const bus = new BusService('redis://falso:6379', 'planazo.events');
    await bus.publish('TEST', {}, []);
    bus.onEvent(jest.fn());

    await bus.onModuleDestroy();
    expect(disconnect).toHaveBeenCalled();
    expect(quit).toHaveBeenCalled();
  });
});
