import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import type { SessionUser } from './session.service.js';

export const IS_PUBLIC = 'auth:public';
export const NEEDS_VERIFIED_EMAIL = 'auth:verified';

/**
 * Kimlik doğrulama gerektirmeyen uçlar.
 *
 * Guard varsayılan olarak **her şeyi koruyor**; açmak bilinçli bir işaret
 * gerektiriyor. Tersi olsaydı (varsayılan açık, korumak için işaret) unutulan
 * bir dekoratör ucu sessizce herkese açardı.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC, true);

/** E-postası doğrulanmamış kullanıcı bu ucu kullanamaz. */
export const VerifiedEmail = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NEEDS_VERIFIED_EMAIL, true);

/** Oturum sahibini denetleyiciye geçiriyor. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user === undefined) {
      // Guard çalışmadan bu dekoratör kullanılmışsa programlama hatası var.
      throw new Error('CurrentUser, AuthGuard olmadan kullanılamaz.');
    }
    return request.user;
  },
);
