/**
 * Dashboard ucunun canlı doğrulaması.
 *
 * Ekranın gördüğü sayılar burada sınanıyor: yanlış bir toplam, kullanıcının
 * bütçe kararını yanlış yerden verdirir. Özellikle iki şey önemli — farklı
 * para birimleri asla toplanmıyor ve paylar aynı para birimi içinde
 * hesaplanıyor.
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
      email: `dash-${randomUUID()}@example.com`,
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

async function istek(
  method: 'GET' | 'POST',
  url: string,
  kullanici?: Kullanici,
  govde?: unknown,
) {
  const yanit = await app.inject({
    method,
    url: `${KOK}${url}`,
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

interface Ozet {
  activeCount: number;
  totals: Array<{
    currency: string;
    monthlyMinor: number;
    yearlyMinor: number;
  }>;
  upcoming: Array<{ name: string; dueDate: string; daysUntil: number }>;
  byCategory: Array<{
    categoryId: string;
    name: string;
    currency: string;
    monthlyMinor: number;
    share: number;
  }>;
  cancelledThisMonth: number;
}

async function ozet(kullanici: Kullanici): Promise<Ozet> {
  const { kod, govde } = await istek('GET', '/dashboard', kullanici);
  expect(kod).toBe(200);
  return govde as Ozet;
}

/** Dün başlamış abonelik: sonraki ödemesi bu ay içinde düşüyor. */
function dunBasla(): string {
  const dun = new Date(Date.now() - 86_400_000);
  return dun.toISOString().slice(0, 10);
}

async function abonelikEkle(
  kullanici: Kullanici,
  kategoriId: string,
  fazlasi: Record<string, unknown> = {},
): Promise<string> {
  const { kod, govde } = await istek('POST', '/subscriptions', kullanici, {
    name: 'Abonelik',
    categoryId: kategoriId,
    priceMinor: 10_000,
    currency: 'TRY',
    billingCycle: 'MONTHLY',
    startDate: dunBasla(),
    ...fazlasi,
  });
  expect(kod).toBe(201);
  return (govde as { id: string }).id;
}

async function kategoriler(kullanici: Kullanici) {
  const { govde } = await istek('GET', '/categories', kullanici);
  return govde as Array<{ id: string; name: string; isSystem: boolean }>;
}

beforeAll(async () => {
  const modul = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

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

describe('dashboard özeti', () => {
  it('aboneliği olmayan kullanıcıda boş ama geçerli bir özet dönüyor', async () => {
    // Yeni kullanıcının gördüğü ilk ekran bu. `null` ya da eksik alan dönerse
    // arayüz çöker; boş liste dönmesi şart.
    const yeni = await kullaniciOlustur();
    const d = await ozet(yeni);

    expect(d.activeCount).toBe(0);
    expect(d.totals).toEqual([]);
    expect(d.upcoming).toEqual([]);
    expect(d.byCategory).toEqual([]);
    expect(d.cancelledThisMonth).toBe(0);
  });

  it('farklı para birimlerini toplamıyor, ayrı satırlarda veriyor', async () => {
    const ayse = await kullaniciOlustur();
    const [kategori] = await kategoriler(ayse);

    await abonelikEkle(ayse, kategori!.id, { priceMinor: 20_000, currency: 'TRY' });
    await abonelikEkle(ayse, kategori!.id, { priceMinor: 1_299, currency: 'USD' });

    const d = await ozet(ayse);

    expect(d.activeCount).toBe(2);
    expect(d.totals).toHaveLength(2);

    const try_ = d.totals.find((t) => t.currency === 'TRY');
    const usd = d.totals.find((t) => t.currency === 'USD');
    expect(try_?.monthlyMinor).toBe(20_000);
    expect(try_?.yearlyMinor).toBe(240_000);
    expect(usd?.monthlyMinor).toBe(1_299);
  });

  it('yıllık aboneliği aylığa çevirip topluyor', async () => {
    const ayse = await kullaniciOlustur();
    const [kategori] = await kategoriler(ayse);

    // 120 TL/ay + 1200 TL/yıl (=100 TL/ay) = 220 TL/ay.
    await abonelikEkle(ayse, kategori!.id, { priceMinor: 12_000 });
    await abonelikEkle(ayse, kategori!.id, {
      priceMinor: 120_000,
      billingCycle: 'YEARLY',
    });

    const d = await ozet(ayse);
    const toplam = d.totals.find((t) => t.currency === 'TRY');

    expect(toplam?.yearlyMinor).toBe(12_000 * 12 + 120_000);
    expect(toplam?.monthlyMinor).toBe(22_000);
  });

  it('kategori payları aynı para birimi içinde hesaplanıyor', async () => {
    const ayse = await kullaniciOlustur();
    const liste = await kategoriler(ayse);
    const [birinci, ikinci] = liste;

    await abonelikEkle(ayse, birinci!.id, { priceMinor: 30_000 });
    await abonelikEkle(ayse, ikinci!.id, { priceMinor: 10_000 });
    // Farklı para birimindeki abonelik TRY paylarını bozmamalı.
    await abonelikEkle(ayse, ikinci!.id, { priceMinor: 50_000, currency: 'EUR' });

    const d = await ozet(ayse);
    const tryPaylari = d.byCategory.filter((k) => k.currency === 'TRY');

    expect(tryPaylari).toHaveLength(2);
    expect(tryPaylari[0]?.share).toBeCloseTo(0.75, 4);
    expect(tryPaylari[1]?.share).toBeCloseTo(0.25, 4);
    // Paylar para birimi içinde 1'e tamamlanıyor.
    const toplamPay = tryPaylari.reduce((t, k) => t + k.share, 0);
    expect(toplamPay).toBeCloseTo(1, 4);
  });

  it('yaklaşan ödemeler tarihe göre sıralı ve gün sayısı doğru', async () => {
    const ayse = await kullaniciOlustur();
    const [kategori] = await kategoriler(ayse);

    await abonelikEkle(ayse, kategori!.id, { name: 'Haftalık', billingCycle: 'WEEKLY' });

    const d = await ozet(ayse);

    expect(d.upcoming.length).toBeGreaterThan(1);
    // Sıralı.
    const gunler = d.upcoming.map((o) => o.daysUntil);
    expect([...gunler].sort((a, b) => a - b)).toEqual(gunler);
    // Hepsi pencerenin içinde.
    for (const gun of gunler) {
      expect(gun).toBeGreaterThanOrEqual(0);
      expect(gun).toBeLessThanOrEqual(30);
    }
  });

  it('iptal edilen abonelik toplamlardan düşüyor ama sayaca giriyor', async () => {
    const ayse = await kullaniciOlustur();
    const [kategori] = await kategoriler(ayse);

    const id = await abonelikEkle(ayse, kategori!.id, { priceMinor: 25_000 });
    await abonelikEkle(ayse, kategori!.id, { priceMinor: 5_000 });

    await istek('POST', `/subscriptions/${id}/cancel`, ayse);

    const d = await ozet(ayse);

    expect(d.activeCount).toBe(1);
    expect(d.totals.find((t) => t.currency === 'TRY')?.monthlyMinor).toBe(5_000);
    expect(d.cancelledThisMonth).toBe(1);
    // İptal edilenin yaklaşan ödemesi de kalmıyor: iki abonelikten biri
    // iptal edildi, geriye tek ödeme kalmalı.
    expect(d.upcoming).toHaveLength(1);
  });

  it('başka kullanıcının verisi özete karışmıyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const [kategori] = await kategoriler(ayse);

    await abonelikEkle(ayse, kategori!.id, { priceMinor: 99_999 });

    const boraninOzeti = await ozet(bora);
    expect(boraninOzeti.activeCount).toBe(0);
    expect(boraninOzeti.totals).toEqual([]);
  });

  it('oturumsuz erişim reddediliyor', async () => {
    const yanit = await istek('GET', '/dashboard');
    expect(yanit.kod).toBe(401);
  });
});
