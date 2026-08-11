import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { TokenService } from './token.service.js';

/** Oturumun ömrü. Yenilenmediği sürece bu süre sonunda geçersiz. */
const SESSION_TTL_DAYS = 30;

/**
 * `lastSeenAt` her istekte değil, en fazla bu sıklıkta yazılıyor.
 *
 * Her istekte güncellemek, salt okunur bir sayfa gezintisini bile yazma
 * işlemine çevirirdi. Beş dakikalık çözünürlük "bu oturum ne zaman
 * kullanıldı" sorusunu cevaplamak için fazlasıyla yeterli.
 */
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  /** Yeni oturum açar ve **ham** token'ı döner — bu değer bir daha okunamaz. */
  async create(
    userId: string,
    context: { userAgent?: string | undefined; ip?: string | undefined },
  ): Promise<{ token: string; expiresAt: Date }> {
    const { token, hash } = this.tokens.generate();
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt,
        // IP ham hâlde saklanmıyor: kişisel veri ve tutmaya ihtiyacımız yok.
        // Özet, "bu oturum başka bir yerden mi kullanılıyor" sorusuna yeter.
        ...(context.ip !== undefined ? { ipHash: hashIp(context.ip) } : {}),
        ...(context.userAgent !== undefined
          ? { userAgent: context.userAgent.slice(0, 255) }
          : {}),
      },
    });

    return { token, expiresAt };
  }

  /**
   * Token'ı doğrular ve kullanıcıyı döner; geçersizse `null`.
   *
   * Silinmiş hesabın oturumu da geçersiz sayılıyor: hesap silme işaretlendiği
   * anda oturumlar da düşüyor, temizlik işini beklemiyoruz.
   */
  async validate(token: string): Promise<SessionUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.tokens.hash(token) },
      select: {
        id: true,
        expiresAt: true,
        lastSeenAt: true,
        user: {
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            deletedAt: true,
          },
        },
      },
    });

    if (session === null || session.user.deletedAt !== null) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      // Süresi dolmuş oturumu hemen siliyoruz; temizlik işini beklemek
      // tabloyu şişiriyor.
      await this.prisma.session.delete({ where: { id: session.id } });
      return null;
    }

    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      id: session.user.id,
      email: session.user.email,
      emailVerifiedAt: session.user.emailVerifiedAt,
    };
  }

  async revoke(token: string): Promise<void> {
    // `deleteMany`, kayıt yoksa hata vermiyor — çıkış isteği her durumda
    // başarılı sayılmalı.
    await this.prisma.session.deleteMany({
      where: { tokenHash: this.tokens.hash(token) },
    });
  }

  /**
   * Kullanıcının bütün oturumlarını kapatır.
   *
   * Şifre değişiminde ve hesap silmede çağrılıyor: şifresi çalınmış bir
   * kullanıcının şifresini değiştirmesi, saldırganın açık oturumunu da
   * düşürmeli — yoksa değiştirmenin bir anlamı kalmaz.
   */
  async revokeAll(userId: string, exceptToken?: string): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        userId,
        ...(exceptToken !== undefined
          ? { NOT: { tokenHash: this.tokens.hash(exceptToken) } }
          : {}),
      },
    });
    return result.count;
  }

  async list(userId: string): Promise<
    {
      id: string;
      userAgent: string | null;
      lastSeenAt: Date;
      createdAt: Date;
    }[]
  > {
    return this.prisma.session.findMany({
      where: { userId },
      select: { id: true, userAgent: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /** Tek bir oturumu kapatır — yalnızca sahibi kapatabilir. */
  async revokeById(userId: string, sessionId: string): Promise<boolean> {
    // `userId` koşulu şart: başka kullanıcının oturumunu kapatmak IDOR olurdu.
    const result = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    return result.count > 0;
  }
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('base64url').slice(0, 32);
}
