import { SetMetadata } from '@nestjs/common';

/** Clave de metadata que marca una ruta como pública (exenta del guard de gateway). */
export const IS_PUBLIC_KEY = 'planazo:esPublica';

/**
 * Marca un handler o controlador como público: el GatewayKeyGuard lo deja pasar
 * aunque GATEWAY_KEY esté definida. Úsalo solo en rutas de infraestructura
 * como GET /health.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
