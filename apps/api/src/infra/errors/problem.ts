import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';

/**
 * Oturum, uzun süre işlem yapılmadığı için kapandı.
 *
 * Kendi sınıfı var çünkü istemcinin bunu diğer 401'lerden ayırması
 * gerekiyor; ayrım yanıttaki `type` alanından okunuyor.
 */
export class OturumBostaKaldi extends UnauthorizedException {}

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
  /**
   * @param webRoot Derlenmiş arayüz sunuluyorsa dolu. Eşleşmeyen sayfa
   *   istekleri `index.html`'e düşüyor (SPA geri dönüşü).
   */
  constructor(
    private readonly logger: Logger,
    private readonly webRoot?: string | undefined,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const requestId = request.id;

    if (this.webRoot !== undefined && sayfaIstegi(request, exception)) {
      // Arayüz istemci tarafında yönlendiriyor: `/abonelikler` sunucuda bir
      // dosyaya karşılık gelmiyor. Bu geri dönüş Nest'in yönlendiricisinden
      // sonra devreye giriyor, yani gerçek bir uç varsa buraya hiç gelmiyor.
      void (reply as FastifyReply & { sendFile: (d: string) => unknown }).sendFile(
        'index.html',
      );
      return;
    }

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

    /*
     * Boşta kalma, sıradan bir 401'den ayrı bir `type` alıyor.
     *
     * İstemci giriş ekranında "bir süre işlem yapılmadı" notunu yalnızca bu
     * durumda gösteriyor; hiç giriş yapmamış ziyaretçiye göstermek gürültü
     * olurdu. Ayrımı **metne bakarak** yapmak, cümle her değiştiğinde
     * sessizce bozulan bir bağ kurardı.
     */
    if (exception instanceof OturumBostaKaldi) {
      return {
        type: `${TYPE_BASE}/session-idle`,
        title: exception.message,
        status: HttpStatus.UNAUTHORIZED,
        instance: url,
        requestId,
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

/**
 * Bu istek arayüz sayfası mı?
 *
 * Üç koşul birlikte: 404 olmalı, tarayıcı gezintisi olmalı (GET + HTML
 * kabul eden) ve API yolu **olmamalı**. Sonuncusu şart — yoksa hatalı bir
 * API çağrısı JSON yerine HTML alır ve istemci anlaşılmaz bir hata verir.
 */
function sayfaIstegi(request: FastifyRequest, exception: unknown): boolean {
  if (request.method !== 'GET') {
    return false;
  }

  const durum =
    exception instanceof HttpException ? exception.getStatus() : 500;
  if (durum !== HttpStatus.NOT_FOUND) {
    return false;
  }

  const yol = request.url.split('?')[0] ?? '';
  if (yol.startsWith('/api') || yol === '/health' || yol === '/ready') {
    return false;
  }

  const kabul = request.headers.accept ?? '';
  return kabul.includes('text/html') || kabul === '' || kabul.includes('*/*');
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
