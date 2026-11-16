import http from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import { REPLICA, SERVICIO } from './access-log';

/**
 * Métricas para Prometheus (Feature 10.4, Observabilidad). Se publican en un
 * puerto aparte (METRICS_PORT, 9464 por defecto) que solo alcanza la red
 * privada de Railway: el dominio público nunca sirve /metrics.
 * Cada serie lleva `service` e `instance`, así el tablero distingue réplicas.
 */
export const registro = new Registry();
registro.setDefaultLabels({ service: SERVICIO, instance: REPLICA });
collectDefaultMetrics({ register: registro });

const duracion = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las peticiones HTTP atendidas',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registro],
});

export const cupones = new Counter({
  name: 'planazo_cupones_reclamados_total',
  help: 'Cupones entregados, por zona',
  labelNames: ['zona'] as const,
  registers: [registro],
});

export const rechazosCupon = new Counter({
  name: 'planazo_cupones_rechazados_total',
  help: 'Reclamos rechazados (CC-1): agotada, vencida, ya reclamada, solo ganadores…',
  labelNames: ['motivo'] as const,
  registers: [registro],
});

export const promosLanzadas = new Counter({
  name: 'planazo_promos_lanzadas_total',
  help: 'Promociones lanzadas, por zona',
  labelNames: ['zona'] as const,
  registers: [registro],
});

/** La ruta como plantilla (`/api/places/:id`), nunca con ids reales: así no explota la cardinalidad. */
export function rutaDe(req: Request): string {
  const plantilla = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof plantilla === 'string') return `${req.baseUrl ?? ''}${plantilla}`.replace(/\*splat/g, '*');
  return 'sin_ruta';
}

export function medirHttp() {
  return (req: Request, res: Response, next: NextFunction) => {
    const fin = duracion.startTimer();
    res.on('finish', () => {
      fin({ method: req.method, route: rutaDe(req), status: String(res.statusCode) });
    });
    next();
  };
}

/** Servidor de métricas en la red privada. Devuelve el servidor para poder cerrarlo. */
export function servidorDeMetricas(puerto = Number(process.env.METRICS_PORT ?? 9464)): http.Server {
  const srv = http.createServer((req, res) => {
    if (req.method !== 'GET' || (req.url ?? '').split('?')[0] !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    registro
      .metrics()
      .then((cuerpo) => res.writeHead(200, { 'content-type': registro.contentType }).end(cuerpo))
      .catch(() => res.writeHead(500).end());
  });
  srv.listen(puerto, '::');
  return srv;
}
