import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { Throttle } from '../../common/rate-limit.guard.js';
import { EmailSender } from '../../infra/email/email-sender.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public } from './auth.decorators.js';
import {
  type AuthenticatedRequest,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from './auth.guard.js';
import { SessionService, type SessionUser } from './session.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyCodeSchema,
  verifyEmailSchema,
  type LoginInput,
  type RegisterInput,
} from './auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly email: EmailSender,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  @Throttle({ limit: 5, windowMs: 60 * 60 * 1000 })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(@Body() body: RegisterInput): Promise<{ userId: string }> {
    return this.auth.register(body);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  // Hem IP hem hesap bazında: tek IP'den farklı hesapları denemek de,
  // dağıtık IP'lerden tek hesabı denemek de sınırlanıyor.
  @Throttle({ limit: 10, windowMs: 60 * 1000, keyField: 'email' })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ token: string; expiresAt: string; restored: boolean }> {
    const { token, expiresAt, restored } = await this.auth.login(body, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });

    setSessionCookie(reply, token, expiresAt);
    setCsrfCookie(reply, expiresAt);

    // Token gövdede de dönüyor: mobil istemci cookie kullanmıyor, bunu
    // işletim sistemi keychain'ine yazacak. Tarayıcı gövdedeki değeri yok
    // sayıp cookie'yi kullanıyor.
    //
    // `restored`: bu giriş silinmiş bir hesabı geri açtıysa `true`. İstemci
    // bunu kullanıcıya söylüyor — hesabının geri geldiğini sessizce
    // öğrenmesi gereken bir şey değil.
    return { token, expiresAt: expiresAt.toISOString(), restored };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    if (request.sessionToken !== undefined) {
      await this.sessions.revoke(request.sessionToken);
    }
    clearSessionCookie(reply);
  }

  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@Req() request: AuthenticatedRequest): Promise<void> {
    if (request.user !== undefined) {
      // Bu oturum ayakta kalıyor: kullanıcı "diğer cihazları çıkar" dediğinde
      // kendini de atmak beklenmedik olurdu.
      await this.sessions.revokeAll(request.user.id, request.sessionToken);
    }
  }

  /**
   * Doğrulama kodunu yeniden gönderiyor.
   *
   * `@Public()` **değil**: kullanıcı giriş yapmış olmalı. Herkese açık
   * olsaydı, e-posta adresi bilen biri o adrese istediği kadar posta
   * gönderttirebilirdi.
   */
  @Post('resend-verification')
  @HttpCode(202)
  @Throttle({ limit: 3, windowMs: 60 * 60 * 1000 })
  async resendVerification(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ deliveredToInbox: boolean }> {
    if (request.user !== undefined) {
      await this.auth.resendVerification(request.user.id);
    }

    /*
     * Arayüz kullanıcıya doğru şeyi söyleyebilsin diye: e-posta gerçekten
     * gönderildi mi, yoksa günlüğe mi yazıldı?
     *
     * Cevap **göndericinin kendisinden** geliyor, `NODE_ENV`'den değil.
     * Ortam değişkenine bakmak, SMTP'si yapılandırılmış bir geliştirme
     * sunucusunda yanlış cevap verirdi.
     *
     * **Kodun kendisi dönmüyor** — yalnızca teslim edilip edilmediği. Kodu
     * yanıta koymak, yanlış bir yapılandırmayla yayına çıkabilecek bir
     * sızıntı yolu açardı; nerede arayacağını söylemek bunu yapmıyor.
     */
    return { deliveredToInbox: this.email.deliversToInbox };
  }

  /**
   * 6 haneli kodla doğrulama — **oturum gerekiyor**.
   *
   * Bağlantıdaki jetonun aksine bu kod tahmin edilebilir (10^6). Oturum
   * şartı, denemenin hangi kullanıcıya ait olduğunu sabitliyor: rastgele
   * kod deneyen biri "10^6 içinde herhangi bir kullanıcıyı tuttur"
   * oyununu oynayamıyor. Deneme sayısı serviste de sınırlı.
   */
  @Post('verify-email-code')
  @HttpCode(204)
  /*
   * Saatte 30. Asıl koruma serviste: her kod en fazla beş yanlış deneme
   * sonrası yakılıyor, yani 30 istek 10^6'yı taramaya yetmiyor. Buradaki
   * sınır ikinci savunma; daha dar tutmak elle yazarken hata yapan
   * kullanıcıyı cezalandırırdı.
   */
  @Throttle({ limit: 30, windowMs: 60 * 60 * 1000 })
  @UsePipes(new ZodValidationPipe(verifyCodeSchema))
  async verifyEmailCode(
    @CurrentUser() user: SessionUser,
    @Body() body: { code: string },
  ): Promise<void> {
    await this.auth.verifyEmailWithCode(user.id, body.code);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  @Throttle({ limit: 20, windowMs: 60 * 60 * 1000 })
  @UsePipes(new ZodValidationPipe(verifyEmailSchema))
  async verifyEmail(@Body() body: { token: string }): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Public()
  @Post('forgot-password')
  // 202: "isteğini aldım" — e-postanın kayıtlı olup olmadığını söylemiyoruz.
  @HttpCode(202)
  @Throttle({ limit: 3, windowMs: 60 * 60 * 1000, keyField: 'email' })
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: { email: string }): Promise<void> {
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @Throttle({ limit: 5, windowMs: 60 * 60 * 1000 })
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  async resetPassword(
    @Body() body: { token: string; password: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.resetPassword(body.token, body.password);
    // Tüm oturumlar düştü; tarayıcıdaki cookie de temizlenmeli.
    clearSessionCookie(reply);
  }
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  void reply.setCookie(SESSION_COOKIE, token, {
    // JavaScript okuyamıyor: XSS ile token çalınamaz.
    httpOnly: true,
    // Üretimde yalnızca HTTPS. Yerelde http://localhost ile çalışabilmesi
    // için gevşetiliyor.
    secure: process.env['NODE_ENV'] === 'production',
    // Lax: başka siteden gelen POST'larda cookie gönderilmiyor (CSRF'in ilk
    // savunma hattı), ama normal gezinmede çalışıyor.
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * CSRF token'ı — oturum token'ından **bağımsız** rastgele değer.
 *
 * `httpOnly` bilerek verilmiyor: web istemcisinin bunu okuyup
 * `x-csrf-token` başlığına koyması gerekiyor. Başka bir sitedeki sayfa aynı
 * origin olmadığı için bu cookie'yi okuyamıyor, dolayısıyla başlığı
 * dolduramıyor — korumanın dayandığı nokta bu.
 */
function setCsrfCookie(reply: FastifyReply, expiresAt: Date): void {
  void reply.setCookie(CSRF_COOKIE, randomBytes(32).toString('base64url'), {
    httpOnly: false,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  void reply.clearCookie(SESSION_COOKIE, { path: '/' });
  void reply.clearCookie(CSRF_COOKIE, { path: '/' });
}
