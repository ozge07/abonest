import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Logger } from 'pino';
import { PrismaService } from '../database/prisma.service.js';
import { LOGGER } from '../logger/logger.token.js';

/**
 * Denetim kaydı — "bu hesapta ne oldu" sorusunun cevabı.
 *
 * ## Ne kaydediliyor
 *
 * Yalnızca **güvenlik açısından anlamlı** olaylar: giriş, çıkış, şifre
 * değişikliği, hesap silme, aboneliğin kalıcı silinmesi. Her okumayı
 * kaydetmek gürültü üretir ve gürültünün içinde gerçek olay kaybolur.
 *
 * ## Ne kaydedilmiyor
 *
 * Şifre, token, tam e-posta adresi, tutar. Denetim kaydı bir olay günlüğü,
 * veri kopyası değil. Sızdığında saldırgana yeni bir şey vermemeli — bu
 * yüzden IP de ham değil, özet olarak yazılıyor.
 *
 * ## Neden hata fırlatmıyor
 *
 * Kayıt yazılamadı diye kullanıcının işlemi düşmemeli: şifresini değiştiren
 * biri, denetim tablosu doluysa şifresini değiştiremez hâle gelmemeli.
 * Başarısızlık loglanıyor ve devam ediliyor.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async record(olay: {
    action: AuditAction;
    userId?: string | undefined;
    entityType?: string | undefined;
    entityId?: string | undefined;
    ip?: string | undefined;
    metadata?: Prisma.InputJsonValue | undefined;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: olay.action,
          ...(olay.userId !== undefined ? { userId: olay.userId } : {}),
          ...(olay.entityType !== undefined
            ? { entityType: olay.entityType }
            : {}),
          ...(olay.entityId !== undefined ? { entityId: olay.entityId } : {}),
          ...(olay.ip !== undefined ? { ipHash: hashIp(olay.ip) } : {}),
          ...(olay.metadata !== undefined ? { metadata: olay.metadata } : {}),
        },
      });
    } catch (hata) {
      this.logger.error(
        { hata, action: olay.action },
        'Denetim kaydı yazılamadı',
      );
    }
  }
}

/**
 * İzin verilen olaylar.
 *
 * Serbest metin yerine birleşim tipi: yazım hatası derleme anında yakalanıyor
 * ve "hangi olaylar kaydediliyor" sorusunun cevabı tek yerde duruyor.
 */
export type AuditAction =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.password_changed'
  | 'auth.password_reset'
  | 'auth.email_verified'
  | 'account.deleted'
  | 'account.purged'
  | 'subscription.deleted';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('base64url').slice(0, 32);
}
