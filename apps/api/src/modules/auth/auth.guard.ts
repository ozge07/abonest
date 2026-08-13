import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { OturumBostaKaldi } from '../../infra/errors/problem.js';
import { SessionService, type SessionUser } from './session.service.js';
import { TokenService } from './token.service.js';
import { IS_PUBLIC, NEEDS_VERIFIED_EMAIL } from './auth.decorators.js';

export const SESSION_COOKIE = 'oturum';
export const CSRF_COOKIE = 'csrf';
const CSRF_HEADER = 'x-csrf-token';

/** İsteğe eklenen kullanıcı; `@CurrentUser()` bunu okuyor. */
export interface AuthenticatedRequest extends FastifyRequest {
  user?: SessionUser;
  sessionToken?: string;
}

/**
 * Kimlik doğrulama guard'ı — **iki taşıma biçimini de** kabul ediyor.
 *
 * | İstemci  | Taşıma                        | CSRF kontrolü |
 * |----------|-------------------------------|---------------|
 * | Tarayıcı | `oturum` cookie'si            | gerekli       |
 * | Mobil    | `Authorization: Bearer <tok>` | gerekmiyor    |
 *
 * CSRF ayrımının sebebi mekanik: cookie'yi tarayıcı **kendiliğinden**
 * gönderiyor, dolayısıyla başka bir sitedeki form bizim API'mize kullanıcının
 * kimliğiyle istek attırabilir. `Authorization` başlığı kendiliğinden
 * gönderilmiyor; saldırganın onu ekleyebilmesi için zaten token'a sahip olması
 * gerekir — o durumda CSRF'in bir anlamı kalmaz.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieToken = request.cookies?.[SESSION_COOKIE];
    const bearerToken = readBearer(request.headers.authorization);

    const token = bearerToken ?? cookieToken;
    if (token === undefined || token === '') {
      throw new UnauthorizedException('Oturum bulunamadı');
    }

    // Cookie ile gelen istekte CSRF token'ı isteniyor. Bearer'da istenmiyor.
    if (bearerToken === undefined && isStateChanging(request.method)) {
      this.assertCsrf(request);
    }

    const sonuc = await this.sessions.validate(token);
    if (sonuc.kullanici === undefined) {
      /*
       * Mesaj sebebe göre değişiyor.
       *
       * "Oturum geçersiz" gören kullanıcı ne yapacağını bilmiyor; bir süre
       * dokunmadığı için kapandığını bilen kullanıcı ise sadece yeniden
       * giriş yapıyor. Aynı 401'in arkasındaki iki farklı durum.
       */
      if (sonuc.sebep === 'bosta-kaldi') {
        throw new OturumBostaKaldi(
          'Bir süre işlem yapılmadığı için oturumun kapandı',
        );
      }
      throw new UnauthorizedException('Oturum geçersiz ya da süresi dolmuş');
    }
    const user = sonuc.kullanici;

    const needsVerified = this.reflector.getAllAndOverride<boolean>(
      NEEDS_VERIFIED_EMAIL,
      [context.getHandler(), context.getClass()],
    );
    if (needsVerified === true && user.emailVerifiedAt === null) {
      // 401 değil 403: kimlik doğru, yetki eksik. Yeniden giriş yapmak
      // sorunu çözmez, e-postayı doğrulamak çözer.
      throw new ForbiddenException('Önce e-posta adresini doğrulaman gerekiyor');
    }

    request.user = user;
    request.sessionToken = token;
    return true;
  }

  /**
   * Double-submit cookie deseni: aynı değer hem cookie'de hem başlıkta
   * olmalı. Başka bir site cookie'yi gönderebilir ama **okuyamaz**,
   * dolayısıyla başlığa koyamaz.
   *
   * ## Neden ayrı bir CSRF cookie'si
   *
   * Karşılaştırma önceden oturum cookie'sinin kendisiyle yapılıyordu. O
   * cookie `httpOnly` — yani tarayıcıdaki JavaScript onu **okuyamıyor** ve
   * başlığa koyamıyor. Sonuç: web istemcisi hiçbir yazma isteği yapamıyordu.
   * curl'le test ederken görünmedi, çünkü curl iki değeri de elle
   * koyabiliyor.
   *
   * Bu yüzden `csrf` ayrı bir cookie ve `httpOnly` **değil**: JavaScript onu
   * okuyup başlığa koyabiliyor. Oturum token'ı httpOnly kalmaya devam
   * ediyor, yani XSS ile oturum çalınamıyor — CSRF token'ının okunabilir
   * olması bir şey kaybettirmiyor, çünkü tek işi "bu istek bizim
   * sayfamızdan mı geldi" sorusunu cevaplamak.
   */
  private assertCsrf(request: AuthenticatedRequest): void {
    const header = request.headers[CSRF_HEADER];
    const sent = Array.isArray(header) ? header[0] : header;
    const cookie = request.cookies?.[CSRF_COOKIE];

    if (
      sent === undefined ||
      cookie === undefined ||
      !this.tokens.safeEqual(sent, cookie)
    ) {
      throw new ForbiddenException('CSRF doğrulaması başarısız');
    }
  }
}

function readBearer(header: string | undefined): string | undefined {
  if (header === undefined) {
    return undefined;
  }
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value !== undefined
    ? value
    : undefined;
}

function isStateChanging(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
