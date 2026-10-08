import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  codigoDesdeStatus,
  HttpExceptionFilter,
  normalizarRespuesta,
} from './http-exception.filter';

/** Crea un ArgumentsHost falso que captura status y cuerpo de la respuesta. */
function host() {
  const capturado: { status?: number; body?: unknown } = {};
  const response = {
    status(s: number) {
      capturado.status = s;
      return this;
    },
    json(b: unknown) {
      capturado.body = b;
      return this;
    },
  };
  const argumentsHost = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { argumentsHost, capturado };
}

describe('codigoDesdeStatus', () => {
  it('convierte el status a MAYÚSCULAS_CON_GUIONES', () => {
    expect(codigoDesdeStatus(404)).toBe('NOT_FOUND');
    expect(codigoDesdeStatus(422)).toBe('UNPROCESSABLE_ENTITY');
    expect(codigoDesdeStatus(500)).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('normalizarRespuesta', () => {
  it('respeta code y message si ya vienen', () => {
    expect(
      normalizarRespuesta({ code: 'PROMO_AGOTADA', message: 'Ya no quedan cupos.' }, 409),
    ).toEqual({ code: 'PROMO_AGOTADA', message: 'Ya no quedan cupos.' });
  });

  it('deriva code del status cuando no viene', () => {
    expect(normalizarRespuesta({ message: 'Falta el título.' }, 400)).toEqual({
      code: 'BAD_REQUEST',
      message: 'Falta el título.',
    });
  });

  it('traduce el mensaje por defecto de Nest', () => {
    expect(
      normalizarRespuesta({ statusCode: 404, message: 'Not Found', error: 'Not Found' }, 404),
    ).toEqual({ code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' });
    expect(
      normalizarRespuesta(
        { statusCode: 404, message: 'Cannot GET /nada', error: 'Not Found' },
        404,
      ),
    ).toEqual({ code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' });
  });

  it('une los mensajes del ValidationPipe en uno solo', () => {
    expect(
      normalizarRespuesta({ message: ['a es obligatorio', 'b debe ser número'] }, 400),
    ).toEqual({
      code: 'BAD_REQUEST',
      message: 'a es obligatorio. b debe ser número',
    });
  });
});

describe('HttpExceptionFilter', () => {
  const filtro = new HttpExceptionFilter();

  it('responde HttpException con su status y cuerpo { code, message }', () => {
    const { argumentsHost, capturado } = host();
    filtro.catch(
      new ConflictException({ code: 'SLOT_OCUPADO', message: 'Ese horario ya está reservado.' }),
      argumentsHost,
    );
    expect(capturado.status).toBe(409);
    expect(capturado.body).toEqual({
      code: 'SLOT_OCUPADO',
      message: 'Ese horario ya está reservado.',
    });
  });

  it('usa el nombre del status como code cuando la excepción no trae uno', () => {
    const { argumentsHost, capturado } = host();
    filtro.catch(new NotFoundException(), argumentsHost);
    expect(capturado.status).toBe(404);
    expect(capturado.body).toEqual({
      code: 'NOT_FOUND',
      message: 'El recurso solicitado no existe.',
    });
  });

  it('acepta un string como cuerpo de la excepción', () => {
    const { argumentsHost, capturado } = host();
    filtro.catch(new BadRequestException('La fecha no es válida.'), argumentsHost);
    expect(capturado.body).toEqual({ code: 'BAD_REQUEST', message: 'La fecha no es válida.' });
  });

  it('convierte errores no HTTP en 500 INTERNAL_SERVER_ERROR sin filtrar detalles', () => {
    const { argumentsHost, capturado } = host();
    filtro.catch(new Error('fallo interno con datos sensibles'), argumentsHost);
    expect(capturado.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(capturado.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocurrió un error inesperado en el servicio.',
    });
  });
});
