import 'reflect-metadata';
import { Logger, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';

/** Traduce LOG_LEVEL al conjunto de niveles que Nest debe mostrar. */
function nivelesDeLog(nivel: string): LogLevel[] {
  const orden: LogLevel[] = ['debug', 'log', 'warn', 'error'];
  const desde = orden.indexOf(nivel as LogLevel);
  return desde === -1 ? orden.slice(1) : orden.slice(desde);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: nivelesDeLog(config.logLevel) });

  // El guard de gateway key y el filtro de errores se registran como providers
  // globales en AppModule (APP_GUARD / APP_FILTER) para que puedan inyectar
  // dependencias; aquí solo queda el ciclo de vida.
  app.enableShutdownHooks();

  await app.listen(config.port);
  Logger.log(`${config.serviceName} escuchando en :${config.port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err), 'Bootstrap');
  process.exit(1);
});
