import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';
import { AuditService } from '../../infra/audit/audit.service.js';
import { PURGE_AFTER_DAYS } from './purge.js';

// Sabit `purge.ts` içinde: giriş ucu da aynı süreyi kullanıyor ve bu
// servise bağlanmadan okuyabilmeli.
export { PURGE_AFTER_DAYS } from './purge.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findFirst({
      // `deletedAt: null` koşulu her okumada var: silinmiş hesap yok sayılıyor.
      where: { id: userId, deletedAt: null },
      select: {
        id: true, email: true, name: true, currency: true, timezone: true,
        locale: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true,
      },
    });
    if (user === null) {
      throw new NotFoundException('Kullanıcı bulunamadı');
    }
    return user;
  }

  async update(
    userId: string,
    data: { name?: string; currency?: string; timezone?: string; locale?: string },
  ) {
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.profile(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });

    // Mevcut şifre soruluyor: oturumu ele geçiren biri şifreyi bilmeden
    // değiştirip hesabı tamamen devralmasın.
    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new UnauthorizedException('Mevcut şifre hatalı');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword) },
    });

    await this.audit.record({ action: 'auth.password_changed', userId });
  }

  /**
   * Hesabı silinmiş olarak işaretler.
   *
   * Kalıcı silme 30 gün sonra, temizlik işiyle. Aradaki pencere kazayla
   * silmeyi geri alınabilir kılıyor; kullanıcı verisini anında yok etmek
   * geri dönüşü olmayan bir işlem.
   */
  async softDelete(userId: string): Promise<Date> {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: now },
    });

    await this.audit.record({ action: 'account.deleted', userId });
    return new Date(now.getTime() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  }
}
