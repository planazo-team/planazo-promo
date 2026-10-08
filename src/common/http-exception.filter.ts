import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** Forma única de todos los errores que devuelve un servicio de Planazo. */
export interface ErrorBody {
  code: string;
  message: string;
}

/**
 * Convierte el status HTTP a su nombre en MAYÚSCULAS_CON_GUIONES.
 * Ej.: 404 -> NOT_FOUND, 422 -> UNPROCESSABLE_ENTITY, 500 -> INTERNAL_SERVER_ERROR.
 */
export function codigoDesdeStatus(status: number): string {
  const nombre = HttpStatus[status];
  return typeof nombre === 'string' ? nombre : 'ERROR';
}

/**
 * Filtro global: normaliza cualquier excepción a `{ code, message }`.
 * - Si la HttpException ya trae `code` y/o `message`, se respetan.
 * - Si no, `code` se deriva del status y `message` del texto de la excepción.
 * - Las excepciones no HTTP se responden como 500 INTERNAL_SERVER_ERROR y se
 *   registran en el log con su stack.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: codigoDesdeStatus(status),
      message: 'Ocurrió un error inesperado en el servicio.',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      body = normalizarRespuesta(exception.getResponse(), status);
    } else {
      const detalle =
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      this.logger.error(detalle);
    }

    response.status(status).json(body);
  }
}

/** Mensajes en español para las excepciones de Nest que no traen mensaje propio. */
const MENSAJES_POR_DEFECTO: Record<number, string> = {
  400: 'La petición no es válida.',
  401: 'No estás autenticado.',
  403: 'No tienes permiso para esta operación.',
  404: 'El recurso solicitado no existe.',
  405: 'Método no permitido.',
  409: 'La operación entra en conflicto con el estado actual.',
  422: 'No se pudo procesar la petición.',
  429: 'Demasiadas peticiones, espera un momento.',
  500: 'Ocurrió un error inesperado en el servicio.',
  503: 'El servicio no está disponible en este momento.',
};

/**
 * Nest genera mensajes en inglés cuando la excepción no trae uno propio:
 * `{ statusCode: 404, message: 'Not Found' }` o, para rutas inexistentes,
 * `message: 'Cannot GET /ruta'`. Se detectan para traducirlos.
 */
function esMensajePorDefectoDeNest(r: Record<string, unknown>, status: number): boolean {
  if (typeof r.message !== 'string') return false;
  const soloLetras = (texto: string) => texto.toLowerCase().replace(/[^a-z]/g, '');
  return (
    r.message === r.error ||
    soloLetras(r.message) === soloLetras(codigoDesdeStatus(status)) ||
    /^Cannot [A-Z]+ /.test(r.message)
  );
}

function mensajePorDefecto(status: number): string {
  return MENSAJES_POR_DEFECTO[status] ?? 'Error en la petición.';
}

/** Convierte lo que traiga la HttpException en un cuerpo `{ code, message }`. */
export function normalizarRespuesta(respuesta: string | object, status: number): ErrorBody {
  const porDefecto = codigoDesdeStatus(status);

  if (typeof respuesta === 'string') {
    return { code: porDefecto, message: respuesta };
  }

  const r = respuesta as Record<string, unknown>;
  const code = typeof r.code === 'string' && r.code ? r.code : porDefecto;

  let message: string;
  if (typeof r.message === 'string' && r.message && !esMensajePorDefectoDeNest(r, status)) {
    message = r.message;
  } else if (esMensajePorDefectoDeNest(r, status)) {
    message = mensajePorDefecto(status);
  } else if (Array.isArray(r.message)) {
    // El ValidationPipe de Nest devuelve `message` como arreglo de strings.
    message = r.message.map(String).join('. ');
  } else if (typeof r.error === 'string') {
    message = r.error;
  } else {
    message = mensajePorDefecto(status);
  }

  return { code, message };
}
