import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { EmailSender } from '../../infra/email/email-sender.js';
import { ConsoleEmailSender } from '../../infra/email/console-email-sender.js';
import { RateLimitGuard } from '../../common/rate-limit.guard.js';
import { LOGGER } from '../../infra/logger/logger.token.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

/**
 * Kimlik doğrulama modülü.
 *
 * `AuthGuard` **global** olarak kaydediliyor: her uç varsayılan olarak
 * korunuyor, açmak için `@Public()` gerekiyor. Tersi olsaydı (varsayılan
 * açık) unutulan tek bir dekoratör ucu herkese açardı — güvenlik açığının
 * varsayılan davranış olması kabul edilemez.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    PrismaService,
    AuthService,
    SessionService,
    PasswordService,
    TokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    {
      provide: EmailSender,
      useFactory: (logger) => new ConsoleEmailSender(logger),
      inject: [LOGGER],
    },
  ],
  exports: [SessionService, PasswordService, TokenService, PrismaService],
})
export class AuthModule {}
