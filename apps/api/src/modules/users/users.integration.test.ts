/**
 * Hesap yönetimi ve kimlik akışlarının kalan yolları.
 *
 * Kapsam ölçümü `users.service`'i %50, `auth.service`'i %56'da gösterdi.
 * Eksik kalanlar profil güncelleme, oturum yönetimi, şifre sıfırlama ve
 * e-posta doğrulama akışlarıydı — hepsi kimlik güvenliğine dokunuyor ve
 * hiçbirinin otomatik testi yoktu.
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import {
  EmailSender,
  type EmailMessage,
} from '../../infra/email/email-sender.js';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { TokenService } from '../auth/token.service.js';
import { AuthService } from '../auth/auth.service.js';

const KOK = '/api/v1';
const SIFRE = 'CokGuclu!Parola123';

let app: NestFastifyApplication;
let prisma: PrismaService;
let passwords: PasswordService;
let sessions: SessionService;
let tokens: TokenService;
let auth: AuthService;

const gidenler: EmailMessage[] = [];

class TestEmailSender extends EmailSender {
  async send(message: EmailMessage): Promise<void> {
    gidenler.push(message);
    return Promise.resolve();
  }
}

const olusturulanKullanicilar: string[] = [];

async function kullaniciOlustur(dogrulanmis = true) {
  const eposta = `hesap-${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: eposta,
      passwordHash: await passwords.hash(SIFRE),
      name: 'Test',
      currency: 'TRY',
      ...(dogrulanmis ? { emailVerifiedAt: new Date() } : {}),
    },
  });
  olusturulanKullanicilar.push(user.id);
  return { id: user.id, email: eposta };
}

/**
 * Oturum açıyor — **giriş ucundan geçmeden**.
 *
 * Giriş ucu dakikada on istekle sınırlı ve bu dosyada onlarca oturum
 * gerekiyor; hepsini uçtan geçirmek testleri hız sınırına çarptırıyordu.
 * Buradaki testlerin çoğu girişin kendisini değil, oturumu olan bir
 * kullanıcının davranışını sınıyor. Giriş ucunun kendisi
 * `csrf.integration.test.ts` ve aşağıdaki `httpGiris` ile sınanıyor.
 */
async function girisYap(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const { token } = await sessions.create(user.id, {});
  return token;
}

/** Gerçekten giriş ucundan geçiyor; şifre doğrulamasının sınandığı yerlerde. */
async function httpGiris(email: string, sifre: string) {
  return app.inject({
    method: 'POST',
    url: `${KOK}/auth/login`,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ email, password: sifre }),
  });
}

async function istek(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  jeton?: string,
  govde?: unknown,
) {
  const yanit = await app.inject({
    method,
    url: `${KOK}${url}`,
    headers: {
      ...(jeton !== undefined ? { authorization: `Bearer ${jeton}` } : {}),
      ...(govde !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(govde !== undefined ? { payload: JSON.stringify(govde) } : {}),
  });
  return {
    kod: yanit.statusCode,
    govde: yanit.body === '' ? null : (JSON.parse(yanit.body) as never),
  };
}

/**
 * Sıfırlama kodu isteyip e-postadan okuyor — **uçtan geçmeden**.
 *
 * `POST /auth/forgot-password` saatte üç istekle sınırlı ve bu dosyada
 * dörtten fazla akış var; hepsini uçtan geçirmek sınıra çarpıyordu. Ucun
 * kendi davranışı (kayıtlı/kayıtsız adres ayrımının sızmaması) aşağıda
 * ayrıca sınanıyor; buradaki testler sıfırlama **akışını** sınıyor.
 */
async function sifirlamaKoduIste(email: string): Promise<string> {
  await auth.requestPasswordReset(email);
  return sonKod(email);
}

/**
 * Gönderilen e-postadaki kodu ayıklıyor.
 *
 * Metne değil **biçime** bakıyor: token 32 baytlık base64url, yani en az 43
 * karakter. Cümleye göre eşleştiren bir desen, e-posta metni her
 * değiştiğinde kırılıyordu — bir kez kırıldı da.
 */
function sonKod(alici: string): string {
  const mesaj = [...gidenler].reverse().find((m) => m.to === alici);
  // Uzun jeton artık yalnızca bağlantının içinde: elle yazılacak değer
  // 6 haneli koda döndü, jeton düz metinde geçmiyor.
  const eslesme = mesaj?.text.match(/[?&]token=([A-Za-z0-9_%-]+)/);
  if (eslesme?.[1] === undefined) {
    throw new Error(`${alici} için kod bulunamadı`);
  }
  return decodeURIComponent(eslesme[1]);
}

beforeAll(async () => {
  const modul = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EmailSender)
    .useClass(TestEmailSender)
    .compile();

  app = modul.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  );
  await configureApp(app, pino({ level: 'silent' }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);
  passwords = app.get(PasswordService);
  sessions = app.get(SessionService);
  tokens = app.get(TokenService);
  auth = app.get(AuthService);
}, 60_000);

afterAll(async () => {
  if (olusturulanKullanicilar.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: olusturulanKullanicilar } },
    });
  }
  await app?.close();
});

describe('profil', () => {
  it('kendi profilini veriyor ve şifre özetini sızdırmıyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const { kod, govde } = await istek('GET', '/me', jeton);
    expect(kod).toBe(200);

    const profil = govde as Record<string, unknown>;
    expect(profil['email']).toBe(kullanici.email);
    expect(profil['passwordHash']).toBeUndefined();
    expect(JSON.stringify(profil)).not.toContain('$argon2');
  });

  it('ad ve para birimini güncelliyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const { kod, govde } = await istek('PATCH', '/me', jeton, {
      name: 'Yeni Ad',
      currency: 'EUR',
    });

    expect(kod).toBe(200);
    expect((govde as { name: string; currency: string }).name).toBe('Yeni Ad');
    expect((govde as { currency: string }).currency).toBe('EUR');
  });

  it('e-postayı değiştirmeye izin vermiyor', async () => {
    // E-posta kimliğin kendisi; değiştirmek doğrulama akışı gerektirir ve
    // profil güncellemesinin parçası olmamalı.
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    await istek('PATCH', '/me', jeton, { email: 'baska@example.com' });

    const { govde } = await istek('GET', '/me', jeton);
    expect((govde as { email: string }).email).toBe(kullanici.email);
  });

  it('üç harften kısa adı reddediyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    expect((await istek('PATCH', '/me', jeton, { name: 'Al' })).kod).toBe(422);
    expect((await istek('PATCH', '/me', jeton, { name: 'Ali' })).kod).toBe(200);
  });

  it('geçersiz para birimini reddediyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const yanit = await istek('PATCH', '/me', jeton, { currency: 'XYZ' });
    expect(yanit.kod).toBe(422);
  });
});

describe('oturum yönetimi', () => {
  it('açık oturumları listeliyor', async () => {
    const kullanici = await kullaniciOlustur();
    await girisYap(kullanici.email);
    const ikinci = await girisYap(kullanici.email);

    const { govde } = await istek('GET', '/me/sessions', ikinci);
    expect((govde as unknown[]).length).toBe(2);
  });

  it('oturum listesinde token bulunmuyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const { govde } = await istek('GET', '/me/sessions', jeton);
    // Ham token hiçbir yerde saklanmıyor; listede de görünmemeli.
    expect(JSON.stringify(govde)).not.toContain(jeton);
    expect(JSON.stringify(govde)).not.toMatch(/tokenHash/);
  });

  it('hangi oturumun çağıranın kendisi olduğunu söylüyor', async () => {
    /*
     * Bu işaret olmadan liste kullanılamıyordu: satırlar birbirinin aynı
     * görünüyor ve "şüpheli oturumu kapat" diyen kullanıcı kendini
     * atabiliyordu. İşaret, hesabına başkasının girdiğini düşünen birinin
     * doğru satırı seçmesi için gerekli.
     */
    const kullanici = await kullaniciOlustur();
    const eski = await girisYap(kullanici.email);
    const guncel = await girisYap(kullanici.email);

    const liste = await istek('GET', '/me/sessions', guncel);
    const oturumlar = liste.govde as { id: string; current: boolean }[];

    expect(oturumlar.filter((o) => o.current)).toHaveLength(1);

    // Aynı liste diğer oturumdan istendiğinde işaret yer değiştiriyor:
    // "current" sabit bir satır değil, çağıranın kendisi.
    const digerListe = await istek('GET', '/me/sessions', eski);
    const digerOturumlar = digerListe.govde as { id: string; current: boolean }[];

    const guncelId = oturumlar.find((o) => o.current)?.id;
    const eskiId = digerOturumlar.find((o) => o.current)?.id;
    expect(guncelId).toBeDefined();
    expect(eskiId).toBeDefined();
    expect(eskiId).not.toBe(guncelId);
  });

  it('başka bir oturumu kapatabiliyor', async () => {
    const kullanici = await kullaniciOlustur();
    const eski = await girisYap(kullanici.email);
    const yeni = await girisYap(kullanici.email);

    const liste = await istek('GET', '/me/sessions', yeni);
    const oturumlar = liste.govde as { id: string }[];

    // İkisinden birini kapatıp diğerinin ayakta kaldığını görüyoruz.
    for (const oturum of oturumlar) {
      const silme = await istek('DELETE', `/me/sessions/${oturum.id}`, yeni);
      expect(silme.kod).toBe(204);
      break;
    }

    // En az biri düştü.
    const kalanEski = await istek('GET', '/me', eski);
    const kalanYeni = await istek('GET', '/me', yeni);
    expect([kalanEski.kod, kalanYeni.kod]).toContain(401);
  });

  /**
   * Belirli bir "yer"den oturum açıyor; istenirse kapanmış hâline getiriyor.
   *
   * Kapatma için `lastSeenAt` boşta kalma sınırının ötesine çekiliyor —
   * gerçekte de oturum böyle kapanıyor: kullanıcı beş dakika işlem yapmıyor
   * ve o token'la gelen ilk istek reddediliyor.
   */
  async function oturumAc(
    userId: string,
    yer: { ip?: string; userAgent?: string },
    { kapali = false }: { kapali?: boolean } = {},
  ): Promise<string> {
    const { token } = await sessions.create(userId, yer);
    if (kapali) {
      await prisma.session.update({
        where: { tokenHash: tokens.hash(token) },
        data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
    }
    return token;
  }

  interface ListeSatiri {
    id: string;
    durum: 'acik' | 'kapali';
    girisSayisi: number;
    createdAt: string;
    current: boolean;
  }

  it('aynı yerden kapanmış oturumları listeye yazmıyor', async () => {
    /*
     * Şikâyetin kendisi buydu: oturum beş dakikada kapanıyor ama satırı
     * duruyor, çünkü kapanan oturumun token'ıyla bir daha istek gelmiyor ve
     * silinmesi o isteğe bağlı. Aynı tarayıcıdan her giriş listeye kalıcı
     * bir satır bırakıyordu — hepsi de "açık oturumlar" başlığı altında.
     */
    const kullanici = await kullaniciOlustur();
    const yer = { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 Chrome/120' };

    await oturumAc(kullanici.id, yer, { kapali: true });
    await oturumAc(kullanici.id, yer, { kapali: true });
    const acik = await oturumAc(kullanici.id, yer);

    const { govde } = await istek('GET', '/me/sessions', acik);
    const liste = govde as ListeSatiri[];

    expect(liste).toHaveLength(1);
    expect(liste[0]?.durum).toBe('acik');
    expect(liste[0]?.current).toBe(true);
  });

  it('başka yerden kapanmış oturumu kapalı olarak gösteriyor', async () => {
    // Kapanmış olması onu önemsiz yapmıyor: tanımadığı bir yerden girildiğini
    // kullanıcının görmesi gereken tek yer bu liste.
    const kullanici = await kullaniciOlustur();
    const evde = { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 Chrome/120' };
    const baskaYer = { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 Safari/17' };

    await oturumAc(kullanici.id, baskaYer, { kapali: true });
    const acik = await oturumAc(kullanici.id, evde);

    const { govde } = await istek('GET', '/me/sessions', acik);
    const liste = govde as ListeSatiri[];

    expect(liste).toHaveLength(2);
    // Açık oturum önce: kullanıcının karar vereceği satır o.
    expect(liste[0]?.durum).toBe('acik');
    expect(liste[1]?.durum).toBe('kapali');
  });

  it('aynı yerin birden çok kapalı oturumunu tek satırda topluyor', async () => {
    const kullanici = await kullaniciOlustur();
    const evde = { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 Chrome/120' };
    const baskaYer = { ip: '203.0.113.9', userAgent: 'Mozilla/5.0 Safari/17' };

    for (let i = 0; i < 3; i++) {
      await oturumAc(kullanici.id, baskaYer, { kapali: true });
    }
    const acik = await oturumAc(kullanici.id, evde);

    const { govde } = await istek('GET', '/me/sessions', acik);
    const liste = govde as ListeSatiri[];

    expect(liste).toHaveLength(2);
    const kapali = liste.find((satir) => satir.durum === 'kapali');
    // Satır tek ama kaç giriş olduğu kaybolmuyor.
    expect(kapali?.girisSayisi).toBe(3);
  });

  it('her satırda girişin saati var ve IP özeti sızmıyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await oturumAc(kullanici.id, {
      ip: '198.51.100.7',
      userAgent: 'Mozilla/5.0 Chrome/120',
    });

    const { govde } = await istek('GET', '/me/sessions', jeton);
    const liste = govde as ListeSatiri[];

    // Saat ve dakika arayüzde bundan yazılıyor.
    expect(Number.isNaN(Date.parse(liste[0]?.createdAt ?? ''))).toBe(false);
    // IP kişisel veri; özeti bile istemciye gitmemeli.
    expect(JSON.stringify(liste)).not.toMatch(/ipHash/);
  });

  it('başkasının oturumunu kapatamıyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const ayseninJeton = await girisYap(ayse.email);
    const boraninJeton = await girisYap(bora.email);

    const liste = await istek('GET', '/me/sessions', ayseninJeton);
    const ayseninOturum = (liste.govde as { id: string }[])[0]!;

    // Yanıt 204: "bu oturum var ama senin değil" bilgisi de sızmasın diye
    // bulunamayan ve başkasına ait oturum aynı cevabı alıyor. Asıl iddia
    // koddan değil sonuçtan okunuyor — Ayşe'nin oturumu ayakta mı?
    const yanit = await istek(
      'DELETE',
      `/me/sessions/${ayseninOturum.id}`,
      boraninJeton,
    );
    expect(yanit.kod).toBe(204);

    // Ayşe hâlâ girişte: Bora'nın isteği hiçbir şey silmedi.
    expect((await istek('GET', '/me', ayseninJeton)).kod).toBe(200);
  });

  it('logout-all diğer oturumları kapatıyor, mevcut oturumu bırakıyor', async () => {
    const kullanici = await kullaniciOlustur();
    const eski = await girisYap(kullanici.email);
    const guncel = await girisYap(kullanici.email);

    expect((await istek('POST', '/auth/logout-all', guncel)).kod).toBe(204);

    expect((await istek('GET', '/me', eski)).kod).toBe(401);
    expect((await istek('GET', '/me', guncel)).kod).toBe(200);
  });
});

describe('şifre değiştirme', () => {
  it('yanlış mevcut şifreyle değiştirmiyor', async () => {
    // Oturumu ele geçiren biri şifreyi bilmeden hesabı devralmamalı.
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const yanit = await istek('PATCH', '/me/password', jeton, {
      currentPassword: 'YanlisSifre123!',
      newPassword: 'YepyeniGuclu!Parola789',
    });
    expect(yanit.kod).toBe(401);
  });

  it('altı karakterlik şifreyi kabul ediyor', async () => {
    // Alt sınır ürün kararıyla 12'den 6'ya indirildi; kuralın gerçekten
    // gevşediğini eski testler göstermiyordu çünkü hepsi uzun şifre
    // kullanıyor.
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const yanit = await istek('PATCH', '/me/password', jeton, {
      currentPassword: SIFRE,
      newPassword: 'abc123',
    });
    expect(yanit.kod).toBe(204);
  });

  it('beş karakterlik şifreyi reddediyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const yanit = await istek('PATCH', '/me/password', jeton, {
      currentPassword: SIFRE,
      newPassword: 'abc12',
    });
    expect(yanit.kod).toBe(422);
  });

  it('zayıf yeni şifreyi reddediyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    const yanit = await istek('PATCH', '/me/password', jeton, {
      currentPassword: SIFRE,
      newPassword: '123',
    });
    expect(yanit.kod).toBe(422);
  });
});

describe('şifre sıfırlama akışı', () => {
  it('sıfırlama sonrası eski şifre çalışmıyor, oturumlar düşüyor', async () => {
    const kullanici = await kullaniciOlustur();
    const eskiOturum = await girisYap(kullanici.email);

    const kod = await sifirlamaKoduIste(kullanici.email);
    const yeniSifre = 'BambaskaGuclu!Parola456';
    expect(
      (await istek('POST', '/auth/reset-password', undefined, {
        token: kod,
        password: yeniSifre,
      })).kod,
    ).toBe(204);

    // Eski oturum düştü: şifre sıfırlanmışsa hesap ele geçirilmiş olabilir.
    expect((await istek('GET', '/me', eskiOturum)).kod).toBe(401);

    // Eski şifre artık çalışmıyor, yenisi çalışıyor.
    expect((await httpGiris(kullanici.email, SIFRE)).statusCode).toBe(401);
    expect((await httpGiris(kullanici.email, yeniSifre)).statusCode).toBe(200);
  });

  it('aynı sıfırlama kodu ikinci kez kullanılamıyor', async () => {
    const kullanici = await kullaniciOlustur();
    const kod = await sifirlamaKoduIste(kullanici.email);

    await istek('POST', '/auth/reset-password', undefined, {
      token: kod,
      password: 'IlkYeniSifre!12345',
    });
    const ikinci = await istek('POST', '/auth/reset-password', undefined, {
      token: kod,
      password: 'IkinciYeniSifre!12345',
    });

    expect(ikinci.kod).toBe(410);
  });

  it('süresi dolmuş kod kabul edilmiyor', async () => {
    const kullanici = await kullaniciOlustur();
    const kod = await sifirlamaKoduIste(kullanici.email);

    // Kaydı geçmişe çekiyoruz; beklemeden süre aşımı üretmenin yolu bu.
    await prisma.passwordResetToken.updateMany({
      where: { userId: kullanici.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const yanit = await istek('POST', '/auth/reset-password', undefined, {
      token: kod,
      password: 'YeniSifre!1234567',
    });
    expect(yanit.kod).toBe(410);
  });

  it('kayıtlı olan ve olmayan adres aynı yanıtı alıyor', async () => {
    // Farklı yanıt vermek hangi adreslerin kayıtlı olduğunu söylerdi.
    // `forgot-password` saatte üç istekle sınırlı; ikisini burada
    // harcıyoruz ve karşılaştırma tek testte yapılıyor.
    const kullanici = await kullaniciOlustur();

    const kayitli = await istek('POST', '/auth/forgot-password', undefined, {
      email: kullanici.email,
    });
    const kayitsiz = await istek('POST', '/auth/forgot-password', undefined, {
      email: `hicyok-${randomUUID()}@example.com`,
    });

    expect(kayitli.kod).toBe(202);
    expect(kayitsiz.kod).toBe(kayitli.kod);
    expect(kayitsiz.govde).toEqual(kayitli.govde);
  });

  it('uydurma kod reddediliyor', async () => {
    const yanit = await istek('POST', '/auth/reset-password', undefined, {
      token: 'uydurma-kod-degeri',
      password: 'YeniSifre!1234567',
    });
    expect(yanit.kod).toBe(410);
  });
});

describe('e-posta doğrulama akışı', () => {
  it('doğrulama kodu hesabı etkinleştiriyor', async () => {
    const kullanici = await kullaniciOlustur(false);
    const jeton = await girisYap(kullanici.email);

    // Doğrulanmamışken veri uçları kapalı.
    expect((await istek('GET', '/subscriptions', jeton)).kod).toBe(403);

    expect(
      (await istek('POST', '/auth/resend-verification', jeton)).kod,
    ).toBe(202);
    const kod = sonKod(kullanici.email);

    expect(
      (await istek('POST', '/auth/verify-email', undefined, { token: kod })).kod,
    ).toBe(204);

    // Artık açık.
    expect((await istek('GET', '/subscriptions', jeton)).kod).toBe(200);
  });

  it('aynı doğrulama kodu ikinci kez kullanılamıyor', async () => {
    const kullanici = await kullaniciOlustur(false);
    const jeton = await girisYap(kullanici.email);
    await istek('POST', '/auth/resend-verification', jeton);
    const kod = sonKod(kullanici.email);

    await istek('POST', '/auth/verify-email', undefined, { token: kod });
    const ikinci = await istek('POST', '/auth/verify-email', undefined, {
      token: kod,
    });
    expect(ikinci.kod).toBe(410);
  });
});

describe('6 haneli doğrulama kodu', () => {
  it('doğru kod hesabı doğruluyor', async () => {
    const kullanici = await kullaniciOlustur(false);
    const jeton = await girisYap(kullanici.email);
    gidenler.length = 0;
    await auth.sendVerification(kullanici.id, kullanici.email);

    const kod = /\b(\d{6})\b/.exec(gidenler[0]?.text ?? '')?.[1];
    expect(kod).toBeDefined();

    const { kod: durum } = await istek('POST', '/auth/verify-email-code', jeton, {
      code: kod,
    });
    expect(durum).toBe(204);

    const profil = await istek('GET', '/me', jeton);
    expect((profil.govde as { emailVerifiedAt: string }).emailVerifiedAt).not.toBeNull();
  });

  it('başkasının kodu işe yaramıyor', async () => {
    /*
     * En önemli iddia. Kod 10^6 ihtimal taşıyor; yalnızca koda bakan bir
     * tasarımda rastgele deneyen biri **herhangi** bir kullanıcının kodunu
     * tutturabilirdi. Arama `userId` ile sınırlı olduğu için tutmuyor.
     */
    const ayse = await kullaniciOlustur(false);
    const bora = await kullaniciOlustur(false);
    const boraninJeton = await girisYap(bora.email);

    gidenler.length = 0;
    await auth.sendVerification(ayse.id, ayse.email);
    const ayseninKod = /\b(\d{6})\b/.exec(gidenler[0]?.text ?? '')?.[1];

    const { kod: durum } = await istek(
      'POST',
      '/auth/verify-email-code',
      boraninJeton,
      { code: ayseninKod },
    );
    expect(durum).toBe(410);

    // Ayşe'nin hesabı hâlâ doğrulanmamış.
    const ayseninJeton = await girisYap(ayse.email);
    const profil = await istek('GET', '/me', ayseninJeton);
    expect((profil.govde as { emailVerifiedAt: string | null }).emailVerifiedAt).toBeNull();
  });

  it('beş yanlış denemeden sonra kod yakılıyor', async () => {
    // Sınır olmadan kaba kuvvet 10^6'yı tarardı.
    const kullanici = await kullaniciOlustur(false);
    const jeton = await girisYap(kullanici.email);
    gidenler.length = 0;
    await auth.sendVerification(kullanici.id, kullanici.email);
    const dogruKod = /\b(\d{6})\b/.exec(gidenler[0]?.text ?? '')?.[1] ?? '';

    for (let i = 0; i < 5; i += 1) {
      const yanlis = String((Number(dogruKod) + i + 1) % 1_000_000).padStart(6, '0');
      await istek('POST', '/auth/verify-email-code', jeton, { code: yanlis });
    }

    // Doğru kod bile artık kabul edilmiyor.
    const { kod: durum } = await istek('POST', '/auth/verify-email-code', jeton, {
      code: dogruKod,
    });
    expect(durum).toBe(410);
  });

  it('altı haneden farklı girdi reddediliyor', async () => {
    const kullanici = await kullaniciOlustur(false);
    const jeton = await girisYap(kullanici.email);

    for (const gecersiz of ['12345', '1234567', 'abcdef', '']) {
      const { kod } = await istek('POST', '/auth/verify-email-code', jeton, {
        code: gecersiz,
      });
      expect(kod).toBe(422);
    }
  });
});

describe('boşta kalma zaman aşımı', () => {
  it('beş dakika işlem yapılmayan oturum kapanıyor', async () => {
    /*
     * Kullanıcı sekmeyi açık unutup masadan kalkabiliyor. Mutlak ömür
     * (30 gün) bu durumu yakalamıyor; boşta kalma sınırı yakalıyor.
     */
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    expect((await istek('GET', '/me', jeton)).kod).toBe(200);

    // Oturumu altı dakika dokunulmamış gibi gösteriyoruz.
    await prisma.session.updateMany({
      where: { userId: kullanici.id },
      data: { lastSeenAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    expect((await istek('GET', '/me', jeton)).kod).toBe(401);
  });

  it('sınırın altındaki oturum açık kalıyor', async () => {
    // Dört dakika önce kullanılmış oturum atılmamalı; aksi hâlde okuma
    // yapan kullanıcı durup dururken dışarı atılır.
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    await prisma.session.updateMany({
      where: { userId: kullanici.id },
      data: { lastSeenAt: new Date(Date.now() - 4 * 60 * 1000) },
    });

    expect((await istek('GET', '/me', jeton)).kod).toBe(200);
  });

  it('her istek sayacı tazeliyor', async () => {
    // Aksi hâlde kesintisiz çalışan kullanıcı da beş dakikada atılırdı.
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    await prisma.session.updateMany({
      where: { userId: kullanici.id },
      data: { lastSeenAt: new Date(Date.now() - 4 * 60 * 1000) },
    });

    // Bu istek `lastSeenAt`i tazeliyor…
    expect((await istek('GET', '/me', jeton)).kod).toBe(200);

    // …dolayısıyla iki dakika sonrası hâlâ geçerli sayılıyor.
    await prisma.session.updateMany({
      where: { userId: kullanici.id },
      data: { lastSeenAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    expect((await istek('GET', '/me', jeton)).kod).toBe(200);
  });

  it('kullanıcıya neden kapandığını söylüyor', async () => {
    /*
     * "Oturum geçersiz" gören kullanıcı ne yapacağını bilmiyor; bir süre
     * dokunmadığı için kapandığını bilen ise sadece yeniden giriş yapıyor.
     * Aynı 401'in arkasındaki iki farklı durum.
     */
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    await prisma.session.updateMany({
      where: { userId: kullanici.id },
      data: { lastSeenAt: new Date(Date.now() - 6 * 60 * 1000) },
    });

    const { govde } = await istek('GET', '/me', jeton);
    expect((govde as { title: string }).title).toContain('işlem yapılmadığı');
  });

  it('hiç olmayan oturumda farklı mesaj veriyor', async () => {
    // Boşta kalma mesajını her 401'e yapıştırmak yanlış bilgi olurdu.
    const { govde } = await istek('GET', '/me', 'boyle-bir-jeton-yok');
    expect((govde as { title: string }).title).not.toContain(
      'işlem yapılmadığı',
    );
  });

  it('kapanan oturum veritabanından siliniyor', async () => {
    // Sadece reddetmek yetmez; kayıt kalırsa tablo şişer ve "açık
    // oturumlar" listesi ölü satır gösterir.
    const kullanici = await kullaniciOlustur();
    const jeton = await girisYap(kullanici.email);

    await prisma.session.updateMany({
      where: { userId: kullanici.id },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    await istek('GET', '/me', jeton);

    expect(
      await prisma.session.count({ where: { userId: kullanici.id } }),
    ).toBe(0);
  });
});
