import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { accessLog, idReplica, rutaSegura, SERVICIO, SERVIDO_POR } from './access-log';

function resFalsa() {
  const headers: Record<string, string> = {};
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v),
  });
  return { res: res as unknown as Response & EventEmitter, headers };
}

describe('access log y réplica', () => {
  it('idReplica usa RAILWAY_REPLICA_ID, luego HOSTNAME, y lo deja seguro y corto', () => {
    expect(idReplica({ RAILWAY_REPLICA_ID: 'a1b2c3d4-e5f6' }, 'h')).toBe('a1b2c3d4');
    expect(idReplica({ HOSTNAME: 'cont_01' }, 'h')).toBe('cont01');
    expect(idReplica({}, '')).toBe('local');
  });

  it('el nombre corto quita el prefijo planazo-', () => {
    expect(SERVICIO.startsWith('planazo-')).toBe(false);
    expect(SERVIDO_POR).toBe(`${SERVICIO}@${idReplica()}`);
  });

  it('la ruta del log no lleva query string ni caracteres de control', () => {
    expect(rutaSegura('/places?zone=zona-t')).toBe('/places');
    expect(rutaSegura('/x\r\nFALSO')).toBe('/xFALSO');
  });

  it('pone x-served-by y escribe una línea JSON con el x-request-id del gateway', () => {
    const lineas: string[] = [];
    const { res, headers } = resFalsa();
    const req = { method: 'POST', originalUrl: '/reservations', headers: { 'x-request-id': 'rid-1' } } as unknown as Request;
    accessLog((l) => lineas.push(l))(req, res, jest.fn());
    expect(headers['x-served-by']).toBe(SERVIDO_POR);
    res.statusCode = 409;
    res.emit('finish');
    expect(JSON.parse(lineas[0])).toMatchObject({ svc: SERVICIO, rid: 'rid-1', ruta: '/reservations', status: 409, nivel: 'warn' });
  });

  it('no registra los healthchecks de la plataforma y genera id si el recibido no es válido', () => {
    const lineas: string[] = [];
    const a = resFalsa();
    accessLog((l) => lineas.push(l))(
      { method: 'GET', url: '/health', headers: { 'user-agent': 'RailwayHealthCheck/1.0' } } as unknown as Request,
      a.res,
      jest.fn(),
    );
    a.res.emit('finish');
    expect(lineas).toHaveLength(0);

    const b = resFalsa();
    accessLog((l) => lineas.push(l))(
      { method: 'GET', url: '/places', headers: { 'x-request-id': 'mal\nid' } } as unknown as Request,
      b.res,
      jest.fn(),
    );
    b.res.statusCode = 500;
    b.res.emit('finish');
    const linea = JSON.parse(lineas[0]);
    expect(linea.rid).toMatch(/^[0-9a-f-]{36}$/);
    expect(linea.nivel).toBe('error');
  });
});
