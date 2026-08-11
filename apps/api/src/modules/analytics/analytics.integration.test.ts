/**
 * Harcama analizinin canlı doğrulaması.
 *
 * En önemli iddia: **geçmiş, saklanan ödeme kayıtlarından değil fatura
 * döngüsünden hesaplanıyor.** Kayıtlar aboneliğin eklendiği günden ileriye
 * üretildiği için, geçmişi onlara dayandırmak kullanıcıya makul görünen ama
 * yanlış bir sayı gösterirdi — en kötü hata türü.
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
import { SessionService } from '../auth/session.service.js';

const KOK = '/api/v1';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sessions: SessionService;

const olusturulanKullanicilar: string[] = [];

interface Kullanici {
  id: string;
  basliklar: Record<string, string>;
}

async function kullaniciOlustur(): Promise<Kullanici> {
  const user = await prisma.user.create({
    data: {
      email: `analiz-${randomUUID()}@example.com`,
      passwordHash: 'test-icin-kullanilmiyor',
      name: 'Test',
      currency: 'TRY',
      emailVerifiedAt: new Date(),
    },
  });
  olusturulanKullanicilar.push(user.id);
  const { token } = await sessions.create(user.id, {});
  return { id: user.id, basliklar: { authorization: `Bearer ${token}` } };
}

async function kategoriId(sira = 0): Promise<string> {
  const kategoriler = await prisma.category.findMany({
    where: { userId: null },
    orderBy: { slug: 'asc' },
  });
  const kategori = kategoriler[sira];
  if (kategori === undefined) {
    throw new Error('Sistem kategorisi yok — önce `npm run seed` çalıştır.');
  }
  return kategori.id;
}

const gun = (yil: number, ay: number, gunu: number) =>
  new Date(Date.UTC(yil, ay - 1, gunu));

async function abonelikYaz(
  userId: string,
  ozellikler: {
    name?: string;
    startDate: Date;
    priceMinor?: number;
    currency?: string;
    billingCycle?: 'MONTHLY' | 'YEARLY' | 'WEEKLY';
    status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
    cancelledAt?: Date;
    pausedAt?: Date;
    endDate?: Date;
    lastUsedAt?: Date;
    createdAt?: Date;
    kategoriSira?: number;
  },
) {
  return prisma.subscription.create({
    data: {
      userId,
      categoryId: await kategoriId(ozellikler.kategoriSira ?? 0),
      name: ozellikler.name ?? 'Netflix',
      priceMinor: BigInt(ozellikler.priceMinor ?? 10_000),
      currency: ozellikler.currency ?? 'TRY',
      billingCycle: ozellikler.billingCycle ?? 'MONTHLY',
      startDate: ozellikler.startDate,
      status: ozellikler.status ?? 'ACTIVE',
      ...(ozellikler.cancelledAt !== undefined
        ? { cancelledAt: ozellikler.cancelledAt }
        : {}),
      ...(ozellikler.pausedAt !== undefined ? { pausedAt: ozellikler.pausedAt } : {}),
      ...(ozellikler.endDate !== undefined ? { endDate: ozellikler.endDate } : {}),
      ...(ozellikler.lastUsedAt !== undefined
        ? { lastUsedAt: ozellikler.lastUsedAt }
        : {}),
      ...(ozellikler.createdAt !== undefined
        ? { createdAt: ozellikler.createdAt }
        : {}),
    },
  });
}

async function istek(url: string, kullanici?: Kullanici) {
  const yanit = await app.inject({
    method: 'GET',
    url: `${KOK}${url}`,
    headers: kullanici?.basliklar ?? {},
  });
  return {
    kod: yanit.statusCode,
    govde: yanit.body === '' ? null : (JSON.parse(yanit.body) as never),
  };
}

interface Harcama {
  totals: { currency: string; totalMinor: number }[];
  buckets: {
    period?: string;
    categoryId?: string;
    name?: string;
    currency: string;
    totalMinor: number;
    count: number;
  }[];
}

beforeAll(async () => {
  const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modul.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  );
  await configureApp(app, pino({ level: 'silent' }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
}, 60_000);

afterAll(async () => {
  if (olusturulanKullanicilar.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: olusturulanKullanicilar } },
    });
  }
  await app?.close();
});

describe('harcama analizi', () => {
  it('geçmişi ödeme kaydı olmadan da hesaplıyor', async () => {
    const ayse = await kullaniciOlustur();
    // Ocak'ta başlamış aylık abonelik. Hiç occurrence kaydı yazmıyoruz —
    // gerçekte de olmazdı, çünkü kayıtlar bugünden ileriye üretiliyor.
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 1, 15),
      priceMinor: 10_000,
    });

    expect(
      await prisma.subscriptionOccurrence.count({
        where: { subscription: { userId: ayse.id } },
      }),
    ).toBe(0);

    const { kod, govde } = await istek(
      '/analytics/spending?from=2026-01-01&to=2026-06-30&groupBy=month',
      ayse,
    );
    expect(kod).toBe(200);

    const d = govde as Harcama;
    // Ocak–Haziran: 6 ödeme × 100 TL.
    expect(d.totals).toEqual([{ currency: 'TRY', totalMinor: 60_000 }]);
    expect(d.buckets).toHaveLength(6);
    expect(d.buckets[0]?.period).toBe('2026-01');
    expect(d.buckets.at(-1)?.period).toBe('2026-06');
  });

  it('kayıt varsa tutarı kayıttan okuyor', async () => {
    const ayse = await kullaniciOlustur();
    const abonelik = await abonelikYaz(ayse.id, {
      startDate: gun(2026, 3, 10),
      priceMinor: 20_000, // bugünkü fiyat
    });

    // Mart ödemesi eski fiyatla kaydedilmiş.
    await prisma.subscriptionOccurrence.create({
      data: {
        subscriptionId: abonelik.id,
        dueDate: gun(2026, 3, 10),
        amountMinor: BigInt(12_000),
        currency: 'TRY',
      },
    });

    const { govde } = await istek(
      '/analytics/spending?from=2026-03-01&to=2026-04-30&groupBy=month',
      ayse,
    );
    const d = govde as Harcama;

    const mart = d.buckets.find((b) => b.period === '2026-03');
    const nisan = d.buckets.find((b) => b.period === '2026-04');
    // Mart kayıttaki eski fiyat, Nisan bugünkü fiyat.
    expect(mart?.totalMinor).toBe(12_000);
    expect(nisan?.totalMinor).toBe(20_000);
  });

  it('iptal edilen abonelik iptal tarihinden sonra sayılmıyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 1, 10),
      status: 'CANCELLED',
      cancelledAt: gun(2026, 3, 20),
    });

    const { govde } = await istek(
      '/analytics/spending?from=2026-01-01&to=2026-06-30&groupBy=month',
      ayse,
    );
    const d = govde as Harcama;

    // Ocak, Şubat, Mart ödendi; Nisan'dan sonrası yok.
    expect(d.buckets.map((b) => b.period)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('duraklatılan abonelik duraklatma tarihinden sonra sayılmıyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 1, 10),
      status: 'PAUSED',
      pausedAt: gun(2026, 2, 15),
    });

    const { govde } = await istek(
      '/analytics/spending?from=2026-01-01&to=2026-06-30&groupBy=month',
      ayse,
    );
    expect((govde as Harcama).buckets.map((b) => b.period)).toEqual([
      '2026-01',
      '2026-02',
    ]);
  });

  it('para birimlerini toplamıyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, { startDate: gun(2026, 2, 5), priceMinor: 10_000 });
    await abonelikYaz(ayse.id, {
      name: 'ChatGPT',
      startDate: gun(2026, 2, 5),
      priceMinor: 2_000,
      currency: 'USD',
    });

    const { govde } = await istek(
      '/analytics/spending?from=2026-02-01&to=2026-02-28&groupBy=month',
      ayse,
    );
    const d = govde as Harcama;

    expect(d.totals).toHaveLength(2);
    expect(d.totals.find((t) => t.currency === 'TRY')?.totalMinor).toBe(10_000);
    expect(d.totals.find((t) => t.currency === 'USD')?.totalMinor).toBe(2_000);
    // Aynı ay iki para biriminde iki kova.
    expect(d.buckets).toHaveLength(2);
  });

  it('kategoriye göre gruplayabiliyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 1, 5),
      priceMinor: 30_000,
      kategoriSira: 0,
    });
    await abonelikYaz(ayse.id, {
      name: 'İkinci',
      startDate: gun(2026, 1, 5),
      priceMinor: 10_000,
      kategoriSira: 1,
    });

    const { govde } = await istek(
      '/analytics/spending?from=2026-01-01&to=2026-01-31&groupBy=category',
      ayse,
    );
    const d = govde as Harcama;

    expect(d.buckets).toHaveLength(2);
    // Büyükten küçüğe sıralı.
    expect(d.buckets[0]?.totalMinor).toBe(30_000);
    expect(d.buckets[1]?.totalMinor).toBe(10_000);
  });

  it('yıllık abonelikte yalnızca ödeme ayına yazıyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 3, 20),
      priceMinor: 120_000,
      billingCycle: 'YEARLY',
    });

    const { govde } = await istek(
      '/analytics/spending?from=2026-01-01&to=2026-12-31&groupBy=month',
      ayse,
    );
    const d = govde as Harcama;

    expect(d.buckets).toHaveLength(1);
    expect(d.buckets[0]?.period).toBe('2026-03');
    expect(d.buckets[0]?.totalMinor).toBe(120_000);
  });

  it('ters aralığı reddediyor', async () => {
    const ayse = await kullaniciOlustur();
    const yanit = await istek(
      '/analytics/spending?from=2026-06-01&to=2026-01-01',
      ayse,
    );
    expect(yanit.kod).toBe(422);
  });

  it('başkasının verisi karışmıyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    await abonelikYaz(ayse.id, { startDate: gun(2026, 1, 5), priceMinor: 99_000 });

    const { govde } = await istek(
      '/analytics/spending?from=2026-01-01&to=2026-06-30',
      bora,
    );
    expect((govde as Harcama).totals).toEqual([]);
  });
});

describe('kullanılmayan abonelikler', () => {
  const eskiTarih = new Date(Date.now() - 200 * 86_400_000);

  it('uzun süredir kullanılmayanı listeliyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      name: 'Unutulmuş',
      startDate: gun(2026, 1, 5),
      priceMinor: 50_000,
      lastUsedAt: eskiTarih,
    });

    const { kod, govde } = await istek('/analytics/unused?thresholdDays=30', ayse);
    expect(kod).toBe(200);

    const liste = govde as { name: string; idleDays: number; wastedPerYearMinor: number }[];
    expect(liste).toHaveLength(1);
    expect(liste[0]?.name).toBe('Unutulmuş');
    expect(liste[0]?.idleDays).toBeGreaterThan(190);
    expect(liste[0]?.wastedPerYearMinor).toBe(50_000 * 12);
  });

  it('yakın zamanda kullanılanı listelemiyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 1, 5),
      lastUsedAt: new Date(Date.now() - 3 * 86_400_000),
    });

    const { govde } = await istek('/analytics/unused?thresholdDays=30', ayse);
    expect(govde as unknown[]).toHaveLength(0);
  });

  it('yeni eklenmiş ama hiç işaretlenmemiş aboneliği listelemiyor', async () => {
    // Dün eklenen abonelik "kullanılmıyor" değil, "daha yeni".
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, { startDate: gun(2026, 8, 1) });

    const { govde } = await istek('/analytics/unused?thresholdDays=30', ayse);
    expect(govde as unknown[]).toHaveLength(0);
  });

  it('eski ve hiç işaretlenmemiş aboneliği listeliyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      name: 'Hiç işaretlenmemiş',
      startDate: gun(2026, 1, 5),
      createdAt: eskiTarih,
    });

    const { govde } = await istek('/analytics/unused?thresholdDays=30', ayse);
    const liste = govde as { name: string; lastUsedAt: string | null }[];

    expect(liste).toHaveLength(1);
    // "Bilmiyoruz" ile "kullanılmıyor" ayrımı istemciye bırakılıyor.
    expect(liste[0]?.lastUsedAt).toBeNull();
  });

  it('iptal edilmiş abonelik listeye girmiyor', async () => {
    const ayse = await kullaniciOlustur();
    await abonelikYaz(ayse.id, {
      startDate: gun(2026, 1, 5),
      status: 'CANCELLED',
      cancelledAt: eskiTarih,
      lastUsedAt: eskiTarih,
    });

    const { govde } = await istek('/analytics/unused', ayse);
    expect(govde as unknown[]).toHaveLength(0);
  });

  it('oturumsuz erişim reddediliyor', async () => {
    expect((await istek('/analytics/unused')).kod).toBe(401);
    expect(
      (await istek('/analytics/spending?from=2026-01-01&to=2026-06-30')).kod,
    ).toBe(401);
  });
});
