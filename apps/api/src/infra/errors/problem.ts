import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';

/**
 * RFC 9457 — Problem Details for HTTP APIs.
 *
 * Kendi hata biçimimizi uydurmuyoruz; standart var ve istemci kütüphaneleri
 * onu tanıyor.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: { field: string; message: string }[];
}

const TYPE_BASE = 'https://abonelik-takip.app/errors';

/** Alan doğrulama hatası — istemciye hangi alanın neden reddedildiği gider. */
export class ValidationProblem extends HttpException {
  constructor(readonly fields: { field: string; message: string }[]) {
    super('Doğrulama başarısız', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const requestId = request.id;

    const problem = this.toProblem(exception, request.url, requestId);

    // 5xx beklenmeyen hata: tam ayrıntıyı logla. 4xx istemci hatası: gürültü
    // yapmasın diye yalnızca uyarı.
    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId }, 'beklenmeyen hata');
    } else {
      this.logger.warn(
        { requestId, status: problem.status, url: request.url },
        problem.title,
      );
    }

    void reply
      .status(problem.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  }

  private toProblem(
    exception: unknown,
    url: string,
    requestId: string,
  ): Problem {
    if (exception instanceof ValidationProblem) {
      return {
        type: `${TYPE_BASE}/validation-failed`,
        title: 'Doğrulama başarısız',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: 'Gönderilen alanlardan bazıları geçersiz.',
        instance: url,
        requestId,
        errors: exception.fields,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: `${TYPE_BASE}/${slug(status)}`,
        title: exception.message,
        status,
        instance: url,
        requestId,
      };
    }

    // Beklenmeyen hata: istemciye **hiçbir iç ayrıntı gitmiyor**. Yığın izi,
    // SQL, dosya yolu sızdırmak saldırgana harita vermek demek. Kullanıcının
    // elinde requestId var, log'da tam kayıt duruyor.
    return {
      type: `${TYPE_BASE}/internal`,
      title: 'Beklenmeyen bir hata oluştu',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Sorun kaydedildi. Destek isteğinde requestId değerini paylaş.',
      instance: url,
      requestId,
    };
  }
}

function slug(status: number): string {
  const map: Record<number, string> = {
    400: 'bad-request',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not-found',
    409: 'conflict',
    410: 'gone',
    429: 'too-many-requests',
  };
  return map[status] ?? `status-${status}`;
}
