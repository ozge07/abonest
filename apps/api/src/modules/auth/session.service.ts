import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { TokenService } from './token.service.js';

/** Oturumun ömrü. Yenilenmediği sürece bu süre sonunda geçersiz. */
const SESSION_TTL_DAYS = 30;

/**
 * Hiç istek gelmezse oturum bu süre sonunda kapanıyor.
 *
 * Mutlak ömürden (30 gün) ayrı bir sınır: kullanıcı bilgisayarın başından
 * kalkıp sekmeyi açık unutabiliyor. Beş dakika, "başka sekmeye geçtim"
 * ile "masadan kalktım" arasındaki farkı yakalayacak kadar kısa; geri
 * dönen kullanıcı giriş ekranından devam ediyor.
 */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * `lastSeenAt` her istekte değil, en fazla bu sıklıkta yazılıyor.
 *
 * Her istekte güncellemek, salt okunur bir sayfa gezintisini bile yazma
 * işlemine çevirirdi.
 *
 * **Bu süre boşta kalma sınırından belirgin şekilde küçük olmak zorunda.**
 * İkisi de beş dakika olsaydı, kesintisiz çalışan bir kullanıcının kaydı
 * beş dakika bayatlayabilir ve tam da sınırda "boşta" sayılıp atılabilirdi.
 * Bir dakikalık çözünürlükle en kötü ihtimalde dört dakikalık gerçek
 * boşluk gerekiyor.
 */
const LAST_SEEN_REFRESH_MS = 60 * 1000;

/**
 * Oturum doğrulamasının sonucu.
 *
 * Başarısızlıkta sebep de dönüyor; guard bunu kullanıcının okuyacağı
 * cümleye çeviriyor.
 */
export type OturumSonucu =
  | { kullanici: SessionUser; sebep?: undefined }
  | { kullanici?: undefined; sebep: 'yok' | 'suresi-doldu' | 'bosta-kaldi' };

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
   * Token'ı doğrular; geçerliyse kullanıcıyı, değilse **sebebini** döner.
   *
   * Sebep, kullanıcıya doğru cümleyi söyleyebilmek için: "oturumun bir süre
   * işlem yapılmadığı için kapandı" ile "böyle bir oturum yok" farklı
   * şeyler ve ikincisini görünce kullanıcı ne yapacağını bilmiyor. Sadece
   * `null` dönseydi istemci tahmin etmek zorunda kalırdı.
   *
   * Silinmiş hesabın oturumu da geçersiz sayılıyor: hesap silme işaretlendiği
   * anda oturumlar da düşüyor, temizlik işini beklemiyoruz.
   */
  async validate(token: string): Promise<OturumSonucu> {
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
      return { sebep: 'yok' };
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      // Süresi dolmuş oturumu hemen siliyoruz; temizlik işini beklemek
      // tabloyu şişiriyor.
      await this.prisma.session.delete({ where: { id: session.id } });
      return { sebep: 'suresi-doldu' };
    }

    // Boşta kalma sınırı: mutlak ömür dolmamış olsa da, uzun süre
    // kullanılmayan oturum kapanıyor.
    if (Date.now() - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
      await this.prisma.session.delete({ where: { id: session.id } });
      return { sebep: 'bosta-kaldi' };
    }

    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return {
      kullanici: {
        id: session.user.id,
        email: session.user.email,
        emailVerifiedAt: session.user.emailVerifiedAt,
      },
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

  /**
   * Kullanıcının açık oturumları.
   *
   * `current` işareti şart: kullanıcı listede hangi satırın kendi kullandığı
   * cihaz olduğunu göremezse, "şüpheli oturumu kapat" derken kendini
   * atabiliyor. Ham token karşılaştırılmıyor, özeti karşılaştırılıyor —
   * veritabanında zaten yalnızca özet var.
   */
  async list(
    userId: string,
    mevcutToken?: string,
  ): Promise<
    {
      id: string;
      userAgent: string | null;
      lastSeenAt: Date;
      createdAt: Date;
      current: boolean;
    }[]
  > {
    const mevcutOzet =
      mevcutToken === undefined ? null : this.tokens.hash(mevcutToken);

    const oturumlar = await this.prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        lastSeenAt: true,
        createdAt: true,
        tokenHash: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return oturumlar.map(({ tokenHash, ...oturum }) => ({
      ...oturum,
      current: mevcutOzet !== null && tokenHash === mevcutOzet,
    }));
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
