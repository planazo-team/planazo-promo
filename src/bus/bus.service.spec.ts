const publicar = jest.fn().mockResolvedValue(1);
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ publish: publicar, on: jest.fn(), quit: jest.fn() })));

import { BusService, type EventEnvelope } from './bus.service';

describe('BusService', () => {
  beforeEach(() => publicar.mockClear());

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
});
