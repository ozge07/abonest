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

/**
 * Oturum hâlâ kullanılabilir mi?
 *
 * `kapali` bir oturumla istek gelirse [validate] onu siliyor; yani kapalı
 * satır artık bir erişim değil, yalnızca "şu saatte buradan girilmişti"
 * bilgisi.
 */
export type OturumDurumu = 'acik' | 'kapali';

export interface OturumOzeti {
  id: string;
  /**
   * Kullanıcının okuyacağı cihaz adı: "Chrome · Mac".
   *
   * Ham `user-agent` yerine bu dönüyor. İki sebep var: metnin kendisi
   * kullanıcıya hiçbir şey söylemiyor, ve "aynı cihaz mı" kararı da bu
   * etikete dayanıyor — karar ölçütüyle ekranda yazan aynı şey olmalı.
   */
  cihaz: string;
  lastSeenAt: Date;
  createdAt: Date;
  current: boolean;
  durum: OturumDurumu;
  /**
   * Bu satırın temsil ettiği giriş sayısı.
   *
   * Kapalı oturumlar aynı yer için tek satıra indiriliyor; sayı kaç kez
   * girildiğini kaybetmeden gösteriyor. Açık oturumlarda hep 1: her açık
   * oturum tek tek kapatılabildiği için birleştirilemez.
   */
  girisSayisi: number;
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
   * Kullanıcının oturumları: açık olanların hepsi, kapalı olanların yalnızca
   * anlatacak bir şeyi olanlar.
   *
   * ## Neden ayıklama gerekiyor
   *
   * Kapalı oturum satırları kendiliğinden kaybolmuyor. Boşta kalan oturum
   * ancak o token'la **bir istek geldiğinde** siliniyor ([validate]); oysa
   * kapanan oturumun token'ı bir daha kullanılmıyor. Sonuç: her giriş kalıcı
   * bir satır bırakıyordu ve beş dakikalık boşta kalma sınırıyla birlikte
   * liste "aynı tarayıcıdan girdiğim her sefer" hâline geliyordu — hepsi de
   * "açık oturum" başlığı altında, ki hiçbiri açık değildi.
   *
   * ## Hangi satır kalıyor
   *
   * - Açık oturumların hepsi, teker teker. Her biri kapatılabilir bir
   *   erişim; birleştirmek kullanıcının hangi satırı kapattığını belirsiz
   *   yapardı, gizlemek ise kapatılamaz hâle getirirdi.
   * - Kapalı oturum, **çağıranın kullandığı cihazdansa** gösterilmiyor.
   *   Kullanıcı zaten o cihazın başında; kendi geçmiş girişlerini listelemek
   *   ona bir şey söylemiyor.
   * - Kapalı oturum **başka bir cihazdansa** gösteriliyor, saatiyle.
   *   Kapanmış olması onu önemsiz yapmıyor; "tanımadığım bir cihazdan
   *   girilmiş" bilgisi tam da kullanıcının görmesi gereken şey.
   * - Aynı cihazın birden çok kapalı oturumu tek satıra iniyor, en yenisi
   *   temsil ediyor ve kaç giriş olduğu `girisSayisi` ile yazılıyor.
   *
   * ## "Aynı cihaz" ne demek
   *
   * Ölçüt [cihazAdi]'nın ürettiği etiket — yani kullanıcının ekranda
   * **okuduğu** metin ("Chrome · Mac"). İki ayrı ölçüt olsaydı liste
   * kendi kendisiyle çelişirdi: aynı görünen iki satırdan biri gizlenip
   * diğeri kalırdı.
   *
   * Ham `user-agent` metni ölçüt değil, bilerek: tarayıcı kendini her
   * güncellediğinde o metin değişiyor (`Chrome/140` -> `Chrome/141`) ve
   * oturumlar 30 gün yaşadığı için aynı bilgisayar bir ay sonra "başka
   * cihaz" gibi görünürdü.
   *
   * IP de ölçüt değil. Bir önceki sürümde IP özeti de ölçüte katılıyordu ve
   * hata buydu: ev interneti ya da mobil veri IP'yi kendiliğinden
   * değiştirdiği için aynı bilgisayardan yapılan girişler ayrı ayrı
   * listeleniyordu. Bedeli şu: başkası aynı tarayıcı ve işletim sistemiyle
   * girerse **kapanmış** oturumu gizlenir. Açık oturumu gizlenmediği,
   * yani hâlâ görülüp kapatılabildiği için kabul edilebilir bir bedel.
   *
   * Süresi tümüyle dolmuş satırlar hiç okunmuyor: onlar artık geçmiş bile
   * değil, çöp.
   *
   * `current` işareti şart: kullanıcı listede hangi satırın kendi kullandığı
   * cihaz olduğunu göremezse, "şüpheli oturumu kapat" derken kendini
   * atabiliyor. Ham token karşılaştırılmıyor, özeti karşılaştırılıyor —
   * veritabanında zaten yalnızca özet var.
   */
  async list(userId: string, mevcutToken?: string): Promise<OturumOzeti[]> {
    const mevcutOzet =
      mevcutToken === undefined ? null : this.tokens.hash(mevcutToken);
    const simdi = Date.now();

    const satirlar = await this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date(simdi) } },
      select: {
        id: true,
        userAgent: true,
        lastSeenAt: true,
        createdAt: true,
        tokenHash: true,
      },
      // En yeni giriş önce: kapalı oturumları birleştirirken ilk gördüğümüz
      // satır temsilci oluyor.
      orderBy: { createdAt: 'desc' },
    });

    const oturumlar = satirlar.map(({ tokenHash, userAgent, ...satir }) => ({
      ...satir,
      // Ham user-agent istemciye çıkmıyor: tek işi bu etiketi üretmekti.
      cihaz: cihazAdi(userAgent),
      current: mevcutOzet !== null && tokenHash === mevcutOzet,
      durum: durumBul(satir.lastSeenAt, simdi),
    }));

    const mevcutCihaz =
      oturumlar.find((oturum) => oturum.current)?.cihaz ?? null;

    const gosterilecek: OturumOzeti[] = [];
    const kapaliTemsilci = new Map<string, OturumOzeti>();

    for (const oturum of oturumlar) {
      if (oturum.durum === 'acik') {
        gosterilecek.push({ ...oturum, girisSayisi: 1 });
        continue;
      }

      // Kullanıcı zaten bu cihazın başında; kendi geçmiş girişleri gürültü.
      if (oturum.cihaz === mevcutCihaz) {
        continue;
      }

      const temsilci = kapaliTemsilci.get(oturum.cihaz);
      if (temsilci !== undefined) {
        temsilci.girisSayisi += 1;
        continue;
      }

      const yeni: OturumOzeti = { ...oturum, girisSayisi: 1 };
      kapaliTemsilci.set(oturum.cihaz, yeni);
      gosterilecek.push(yeni);
    }

    // Açık oturumlar önce; kullanıcının karar vereceği satırlar onlar.
    return gosterilecek.sort((a, b) => {
      if (a.durum !== b.durum) {
        return a.durum === 'acik' ? -1 : 1;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
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

/**
 * Oturum boşta kalma sınırını aştıysa kapalı.
 *
 * `validate` ile aynı sınır kullanılıyor: liste "açık" derken o oturumla
 * istek yapılabildiğini söylüyor olmalı, yoksa kullanıcıya yalan söylenir.
 */
function durumBul(lastSeenAt: Date, simdi: number): OturumDurumu {
  return simdi - lastSeenAt.getTime() <= IDLE_TIMEOUT_MS ? 'acik' : 'kapali';
}

/**
 * Tarayıcı kimliğinden okunabilir bir cihaz adı: "Chrome · Mac".
 *
 * Ham `user-agent` metni kullanıcıya hiçbir şey söylemiyor. Buradaki kaba
 * eşleme "hangi cihazdı" sorusuna yetiyor; tam doğruluk gerekmiyor, çünkü
 * verilecek karar zaten "bunu ben mi açtım" sorusuna dayanıyor.
 *
 * Sürüm numarası bilerek düşüyor: etiket aynı zamanda "aynı cihaz mı"
 * ölçütü ve tarayıcı her güncellendiğinde değişen bir ölçüt işe yaramaz.
 *
 * Sıra önemli: Edge ve Chrome ikisi de `Safari/` içeriyor, Edge ayrıca
 * `Chrome/` içeriyor — daha özel olan önce sınanıyor.
 */
export function cihazAdi(userAgent: string | null): string {
  if (userAgent === null || userAgent === '') {
    return 'Bilinmeyen cihaz';
  }

  const tarayici = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Tarayıcı';

  const sistem = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'Mac'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';

  return sistem === '' ? tarayici : `${tarayici} · ${sistem}`;
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('base64url').slice(0, 32);
}
