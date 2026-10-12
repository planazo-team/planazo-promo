import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { config } from '../config';

/**
 * Sobre que viaja por el bus de eventos de Planazo (canal Redis `planazo.events`).
 * NUNCA incluye `seq`: lo asigna el servicio realtime al recibirlo.
 */
export interface EventEnvelope<TPayload = unknown> {
  /** UUID v4 único del evento. */
  id: string;
  /** Tipo de evento en formato DOMINIO.ACCION, p. ej. `PROMO.PUSH`. */
  type: string;
  /** Temas a los que va dirigido, p. ej. `zone:zona-g`, `user:u1`, `place:b1`. */
  topics: string[];
  /** Cuerpo del evento, específico de cada tipo. */
  payload: TPayload;
  /** Momento de emisión en epoch milisegundos. */
  at: number;
}

/** Tokens de inyección para sobreescribir la URL y el canal del bus (útil en tests). */
export const BUS_URL_TOKEN = 'planazo:busUrl';
export const BUS_CHANNEL_TOKEN = 'planazo:busChannel';

/**
 * Publica eventos en Redis pub/sub. La conexión se abre de forma perezosa en la
 * primera publicación. Si `BUS_URL` no está definida, `publish` solo deja un
 * warn en el log y no hace nada, para que el servicio funcione sin Redis.
 */
@Injectable()
export class BusService implements OnModuleDestroy {
  private readonly logger = new Logger(BusService.name);
  private cliente?: Redis;
  private suscriptor?: Redis;
  private avisoSinBus = false;
  private readonly busUrl: string | undefined;
  private readonly canal: string;

  constructor(
    @Optional() @Inject(BUS_URL_TOKEN) busUrl?: string,
    @Optional() @Inject(BUS_CHANNEL_TOKEN) canal?: string,
  ) {
    // Si nadie inyecta valores explícitos, se usan los de la configuración.
    this.busUrl = busUrl === undefined ? config.busUrl : busUrl;
    this.canal = canal ?? config.busChannel;
  }

  /** Construye el sobre y lo publica en el canal del bus. */
  async publish(type: string, payload: unknown, topics: string[]): Promise<void> {
    const sobre: EventEnvelope = {
      id: randomUUID(),
      type,
      topics,
      payload,
      at: Date.now(),
    };

    if (!this.busUrl) {
      if (!this.avisoSinBus) {
        this.logger.warn('BUS_URL no está definida: los eventos no se publican (modo sin bus).');
        this.avisoSinBus = true;
      }
      this.logger.debug(`Evento descartado ${type} -> ${topics.join(',')}`);
      return;
    }

    const redis = this.obtenerCliente(this.busUrl);
    await redis.publish(this.canal, JSON.stringify(sobre));
    this.logger.debug(`Publicado ${type} (${sobre.id}) -> ${topics.join(',')}`);
  }

  private obtenerCliente(url: string): Redis {
    if (!this.cliente) {
      this.cliente = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
      });
      this.cliente.on('error', (err: Error) => {
        this.logger.error(`Error en la conexión con el bus: ${err.message}`);
      });
    }
    return this.cliente;
  }

  /**
   * Escucha el canal del bus. Promo reacciona a eventos de otros servicios
   * (partidas terminadas, lugares nuevos) sin llamarlos directamente.
   * Sin BUS_URL no hace nada.
   */
  onEvent(callback: (sobre: EventEnvelope) => void | Promise<void>): void {
    if (!this.busUrl) {
      this.logger.warn('BUS_URL no está definida: promo no escuchará eventos de otros servicios.');
      return;
    }
    if (this.suscriptor) return;
    this.suscriptor = new Redis(this.busUrl, { maxRetriesPerRequest: null });
    this.suscriptor.on('error', (err: Error) => this.logger.error(`Error en la suscripción al bus: ${err.message}`));
    this.suscriptor.on('message', (canal: string, mensaje: string) => {
      if (canal !== this.canal) return;
      let sobre: EventEnvelope;
      try {
        sobre = JSON.parse(mensaje) as EventEnvelope;
      } catch {
        this.logger.warn('Evento del bus que no es JSON: se ignora.');
        return;
      }
      Promise.resolve(callback(sobre)).catch((err: unknown) =>
        this.logger.error(`Error procesando ${sobre.type}: ${err instanceof Error ? err.message : String(err)}`),
      );
    });
    void this.suscriptor.subscribe(this.canal).then(() => this.logger.log(`Escuchando el bus en ${this.canal}.`));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.suscriptor) {
      this.suscriptor.disconnect();
      this.suscriptor = undefined;
    }
    if (this.cliente) {
      try {
        await this.cliente.quit();
      } catch {
        this.cliente.disconnect();
      }
      this.cliente = undefined;
    }
  }
}
