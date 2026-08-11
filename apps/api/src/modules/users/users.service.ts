import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { PasswordService } from '../auth/password.service.js';

/** Hesap silme kararının geri alınabileceği süre. */
const PURGE_AFTER_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
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
    return new Date(now.getTime() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  }
}
