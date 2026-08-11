/**
 * Abonelik uçlarının canlı doğrulaması.
 *
 * Bu bir birim testi değil: gerçek Nest uygulaması ayağa kalkıyor, gerçek
 * Postgres'e yazıyor, istekler HTTP katmanından geçiyor. Sebebi şu — bu
 * dosyadaki en önemli iddia "B, A'nın verisine erişemiyor" ve o iddia ancak
 * guard, denetleyici, servis ve veritabanı birlikte çalışırken anlam taşıyor.
 * Servisi mock'lanmış bir depoya karşı test etseydik, tam da kaçırmak
 * istemediğimiz katman testin dışında kalırdı.
 *
 * `DATABASE_URL` gerektiriyor.
 */

// Uygulama gerçekten ayağa kalkıyor, dolayısıyla ortam değişkenleri şart.
// `dotenv` ilk sırada: AppModule içe aktarılmadan önce yüklenmesi gerekiyor.
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
import { SessionService } from '../auth/session.service.js';

const KOK = '/api/v1';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sessions: SessionService;

/** Test kullanıcısı: doğrudan veritabanına yazılıyor. */
interface Kullanici {
  id: string;
  basliklar: Record<string, string>;
}

const olusturulanKullanicilar: string[] = [];

async function kullaniciOlustur(): Promise<Kullanici> {
  const user = await prisma.user.create({
    data: {
      email: `test-${randomUUID()}@example.com`,
      // Şifreyle giriş yapmıyoruz; oturumu doğrudan açıyoruz. Bu, kayıt
      // ucundaki kaba kuvvet sınırının testleri boğmasını da engelliyor.
      passwordHash: 'test-icin-kullanilmiyor',
      name: 'Test',
      currency: 'TRY',
      emailVerifiedAt: new Date(),
    },
  });
  olusturulanKullanicilar.push(user.id);

  const { token } = await sessions.create(user.id, {});
  return {
    id: user.id,
    basliklar: { authorization: `Bearer ${token}` },
  };
}

async function istek(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  kullanici?: Kullanici,
  govde?: unknown,
) {
  const yanit = await app.inject({
    method,
    url: `${KOK}${url}`,
    // `content-type` yalnızca gövde varken gönderiliyor: Fastify, gövdesiz
    // ama JSON etiketli isteği 400 ile reddediyor.
    headers: {
      ...(kullanici?.basliklar ?? {}),
      ...(govde !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(govde !== undefined ? { payload: JSON.stringify(govde) } : {}),
  });

  return {
    kod: yanit.statusCode,
    govde: yanit.body === '' ? null : (JSON.parse(yanit.body) as never),
  };
}

function abonelik(categoryId: string, fazlasi: Record<string, unknown> = {}) {
  return {
    name: 'Netflix',
    categoryId,
    priceMinor: 22_999,
    currency: 'TRY',
    billingCycle: 'MONTHLY',
    // Ayın 31'i: çapadan hesabın kanıtı buradan geçiyor.
    startDate: '2026-01-31',
    ...fazlasi,
  };
}

beforeAll(async () => {
  const modul = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = modul.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  );
  // Üretimdeki HTTP kurulumunun aynısı; hata yanıtları da aynı biçimde.
  await configureApp(app, pino({ level: 'silent' }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
}, 60_000);

afterAll(async () => {
  if (olusturulanKullanicilar.length > 0) {
    // Abonelikler, oturumlar ve ödemeler ilişki üzerinden düşüyor.
    await prisma.user.deleteMany({
      where: { id: { in: olusturulanKullanicilar } },
    });
  }
  await app?.close();
});

async function sistemKategorisi(kullanici: Kullanici): Promise<string> {
  const { govde } = await istek('GET', '/categories', kullanici);
  const liste = govde as Array<{ id: string; isSystem: boolean }>;
  const sistem = liste.find((k) => k.isSystem);
  if (sistem === undefined) {
    throw new Error('Sistem kategorisi yok — önce `npm run seed` çalıştır.');
  }
  return sistem.id;
}

describe('abonelik CRUD', () => {
  it('oluşturuyor ve türetilmiş değerleri hesaplıyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);

    const { kod, govde } = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori),
    );

    expect(kod).toBe(201);
    const d = govde as {
      id: string;
      monthlyEquivalentMinor: number;
      yearlyMinor: number;
      status: string;
    };
    expect(d.status).toBe('ACTIVE');
    // Aylık abonelikte aylık karşılık fiyatın kendisi, yıllık 12 katı.
    expect(d.monthlyEquivalentMinor).toBe(22_999);
    expect(d.yearlyMinor).toBe(22_999 * 12);
  });

  it('ayın 31\'inde başlayan abonelikte ödemeler çapadan hesaplanıyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);
    const { govde } = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori),
    );
    const { id } = govde as { id: string };

    const odemeler = await istek('GET', `/subscriptions/${id}/occurrences`, ayse);
    const tarihler = (odemeler.govde as Array<{ dueDate: string }>).map(
      (o) => o.dueDate,
    );

    expect(tarihler.length).toBeGreaterThan(0);
    // 30 çeken aylarda 30'una kırpılıyor, 31 çekenlerde 31'ine dönüyor —
    // kırpma kalıcı hâle gelmiyor.
    for (const tarih of tarihler) {
      const gun = Number(tarih.slice(8, 10));
      expect([30, 31]).toContain(gun);
    }
  });

  it('duraklat ve devam ettir sonraki ödemeyi kaldırıp geri getiriyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);
    const { govde } = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori),
    );
    const { id } = govde as { id: string };

    const durakladi = await istek('POST', `/subscriptions/${id}/pause`, ayse);
    expect(durakladi.kod).toBe(200);
    expect((durakladi.govde as { nextPaymentDate: null }).nextPaymentDate).toBeNull();

    const devam = await istek('POST', `/subscriptions/${id}/resume`, ayse);
    expect(devam.kod).toBe(200);
    expect(
      (devam.govde as { nextPaymentDate: string | null }).nextPaymentDate,
    ).not.toBeNull();
  });

  it('iptal kaydı silmiyor, geçmişi koruyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);
    const { govde } = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori),
    );
    const { id } = govde as { id: string };

    expect((await istek('POST', `/subscriptions/${id}/cancel`, ayse)).kod).toBe(200);

    const sonra = await istek('GET', `/subscriptions/${id}`, ayse);
    expect(sonra.kod).toBe(200);
    expect((sonra.govde as { status: string }).status).toBe('CANCELLED');
  });
});

describe('yetkilendirme — başkasının verisi', () => {
  it('B, A\'nın aboneliğine hiçbir yoldan erişemiyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);

    const { govde } = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori),
    );
    const { id } = govde as { id: string };

    // Hepsi 404: "var ama senin değil" bilgisi bile sızmıyor.
    expect((await istek('GET', `/subscriptions/${id}`, bora)).kod).toBe(404);
    expect(
      (await istek('PATCH', `/subscriptions/${id}`, bora, { name: 'Ele geçti' })).kod,
    ).toBe(404);
    expect((await istek('DELETE', `/subscriptions/${id}`, bora)).kod).toBe(404);
    expect((await istek('POST', `/subscriptions/${id}/cancel`, bora)).kod).toBe(404);
    expect((await istek('POST', `/subscriptions/${id}/pause`, bora)).kod).toBe(404);
    expect((await istek('POST', `/subscriptions/${id}/resume`, bora)).kod).toBe(404);

    // Ödeme listesi de boş dönüyor.
    const odemeler = await istek('GET', `/subscriptions/${id}/occurrences`, bora);
    expect(odemeler.govde).toEqual([]);

    // A'nın kaydı olduğu gibi duruyor.
    const asil = await istek('GET', `/subscriptions/${id}`, ayse);
    expect((asil.govde as { name: string; status: string }).name).toBe('Netflix');
    expect((asil.govde as { status: string }).status).toBe('ACTIVE');
  });

  it('liste yalnızca kendi kayıtlarını gösteriyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);

    await istek('POST', '/subscriptions', ayse, abonelik(kategori));

    const boraninListesi = await istek('GET', '/subscriptions', bora);
    expect((boraninListesi.govde as { data: unknown[] }).data).toEqual([]);
  });

  it('başkasının özel kategorisine abonelik bağlanamıyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();

    const boraninKategorisi = await istek('POST', '/categories', bora, {
      name: 'Boranın Gizli Kategorisi',
    });
    const { id: kategoriId } = boraninKategorisi.govde as { id: string };

    const sonuc = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategoriId),
    );
    expect(sonuc.kod).toBe(404);
  });

  it('oturumsuz istek reddediliyor', async () => {
    const yanit = await istek('GET', '/subscriptions');
    expect(yanit.kod).toBe(401);
  });
});

describe('sağlık uçları', () => {
  it('oturum açmadan erişilebiliyor', async () => {
    // Altyapı bunları kimliksiz çağırıyor. 401 dönerse yük dengeleyici ayakta
    // olan uygulamayı ölü sayar — bir kez tam olarak bu oldu.
    const saglik = await app.inject({ method: 'GET', url: '/health' });
    expect(saglik.statusCode).toBe(200);

    const hazir = await app.inject({ method: 'GET', url: '/ready' });
    expect(hazir.statusCode).toBe(200);
    expect(JSON.parse(hazir.body)).toMatchObject({ database: 'ok' });
  });
});

describe('girdi doğrulama', () => {
  it('negatif fiyatı reddediyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);

    const yanit = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori, { priceMinor: -5 }),
    );
    expect(yanit.kod).toBe(422);
  });

  it('CUSTOM döngüde gün aralığı istiyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);

    const yanit = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori, { billingCycle: 'CUSTOM' }),
    );
    expect(yanit.kod).toBe(422);
    expect((yanit.govde as { errors: Array<{ field: string }> }).errors[0]?.field).toBe(
      'customIntervalDays',
    );
  });

  it('oturum nesnesini gövde sanıp doğrulamaya çalışmıyor', async () => {
    // Bu testin sebebi gerçek bir hata: `@UsePipes()` metot seviyesinde
    // yazıldığında pipe `@CurrentUser()` parametresine de uygulanıyor ve
    // gövde kusursuzken istek "bütün alanlar eksik" diye reddediliyordu.
    const ayse = await kullaniciOlustur();
    const kategori = await sistemKategorisi(ayse);

    const yanit = await istek(
      'POST',
      '/subscriptions',
      ayse,
      abonelik(kategori),
    );
    expect(yanit.kod).toBe(201);
  });
});
