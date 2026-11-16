import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';

/**
 * Qué réplica atiende (ESC-04 y ESC-07). En Railway cada réplica trae su
 * RAILWAY_REPLICA_ID; en Docker o en local se usa el hostname del contenedor.
 * Se recorta a 8 caracteres seguros para mostrarlo en headers, logs y el panel.
 */
export function idReplica(env: NodeJS.ProcessEnv = process.env, host: string = hostname()): string {
  const crudo = env.RAILWAY_REPLICA_ID || env.HOSTNAME || host || '';
  return String(crudo).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8) || 'local';
}

/** Nombre corto del servicio: `planazo-booking` → `booking`. */
export const SERVICIO = config.serviceName.replace(/^planazo-/, '');
export const REPLICA = idReplica();
/** Valor del header `x-served-by`: `servicio@réplica`. */
export const SERVIDO_POR = `${SERVICIO}@${REPLICA}`;

/** Ids que se aceptan de quien llama: cortos y sin caracteres raros (evita inyección en logs). */
const ID_VALIDO = /^[A-Za-z0-9._-]{1,64}$/;

/** Ruta sin query string y sin caracteres de control: lo que se escribe en el log. */
export function rutaSegura(url: string): string {
  return (url.split('?')[0] ?? '').replace(/[^\w\-./:@]/g, '').slice(0, 200);
}

type Escribir = (linea: string) => void;
const aStdout: Escribir = (linea) => {
  process.stdout.write(linea + '\n');
};

function nivelDe(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * Responde con `x-served-by: <servicio>@<réplica>` y escribe una línea JSON por
 * petición (réplica, ruta, status, latencia y el x-request-id que puso el gateway).
 * Los healthchecks de la plataforma no se registran para no llenar el log.
 */
export function accessLog(escribir: Escribir = aStdout) {
  return (req: Request, res: Response, next: NextFunction) => {
    const inicio = process.hrtime.bigint();
    const recibido = req.headers['x-request-id'];
    const rid = typeof recibido === 'string' && ID_VALIDO.test(recibido) ? recibido : randomUUID();
    res.setHeader('x-served-by', SERVIDO_POR);
    res.on('finish', () => {
      const ruta = rutaSegura(req.originalUrl || req.url || '');
      if (ruta === '/health' && req.headers['user-agent']?.startsWith('RailwayHealthCheck')) return;
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      escribir(
        JSON.stringify({
          t: new Date().toISOString(),
          nivel: nivelDe(res.statusCode),
          svc: SERVICIO,
          replica: REPLICA,
          rid,
          metodo: req.method,
          ruta,
          status: res.statusCode,
          ms: Math.round(ms * 10) / 10,
        }),
      );
    });
    next();
  };
}
