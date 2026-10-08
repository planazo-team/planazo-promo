// Configuración del servicio leída desde variables de entorno.
// Todas tienen un valor por defecto pensado para desarrollo local, salvo las
// que deben quedar indefinidas para que el servicio funcione sin la
// infraestructura correspondiente (GATEWAY_KEY, BUS_URL, DATABASE_URL...).

function leerEntero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

export const config = {
  /** Nombre del servicio; aparece en /health y en los logs. */
  serviceName: process.env.SERVICE_NAME ?? 'planazo-promo',
  /** Puerto HTTP en el que escucha el servicio. */
  port: leerEntero(process.env.PORT, 3002),
  /** Clave compartida con el API Gateway. Si no está definida, no se exige. */
  gatewayKey: process.env.GATEWAY_KEY,
  /** URL de Redis para el bus de eventos (pub/sub). Sin ella, publicar es no-op. */
  busUrl: process.env.BUS_URL,
  /** Canal de Redis al que se publican los eventos. */
  busChannel: process.env.BUS_CHANNEL ?? 'planazo.events',
  /** Cadena de conexión a la base de datos del servicio (si aplica). */
  databaseUrl: process.env.DATABASE_URL,
  /** URL de Redis para uso propio del servicio (stock, cachés, etc.). */
  redisUrl: process.env.REDIS_URL,
  /** Secreto JWT. Los servicios NO validan JWT; solo lo usa el gateway. */
  jwtSecret: process.env.JWT_SECRET,
  /** Nivel de log: debug | log | warn | error. */
  logLevel: process.env.LOG_LEVEL ?? 'log',
} as const;

export type Config = typeof config;
