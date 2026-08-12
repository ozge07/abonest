/**
 * Katalog uçları.
 *
 * Kapsam ölçümü bu dosyanın eksikliğini gösterdi: `catalog.service` %44'te
 * duruyordu ve belgelenmiş iki davranışın — sistem kategorisi değiştirilemez,
 * kullanımdaki kategori silinemez — hiç testi yoktu. İkisi de "yazıldı ama
 * çalıştığı doğrulanmadı" durumundaydı.
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
      email: `katalog-${randomUUID()}@example.com`,
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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

async function kategoriOlustur(kullanici: Kullanici, ad: string) {
  const { kod, govde } = await istek('POST', '/categories', kullanici, {
    name: ad,
  });
  expect(kod).toBe(201);
  return govde as { id: string; name: string; slug: string; isSystem: boolean };
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

describe('kategori oluşturma', () => {
  it('kullanıcının kendi kategorisini açıyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await kategoriOlustur(ayse, 'Kahve Aboneliği');

    expect(kategori.isSystem).toBe(false);
    expect(kategori.slug).toBe('kahve-aboneligi');
  });

  it('Türkçe karakterleri slug\'a doğru çeviriyor', async () => {
    // "Iğdır Şeyleri" → ASCII karşılıkları. Naif bir `toLowerCase()`
    // Türkçe İ/ı çiftinde yanlış sonuç verir.
    const ayse = await kullaniciOlustur();
    const kategori = await kategoriOlustur(ayse, 'Iğdır Şeyleri Çöğüş');

    expect(kategori.slug).toMatch(/^[a-z0-9-]+$/);
    expect(kategori.slug).toBe('igdir-seyleri-cogus');
  });

  it('aynı adı ikinci kez kabul etmiyor', async () => {
    const ayse = await kullaniciOlustur();
    await kategoriOlustur(ayse, 'Tekrar');

    const ikinci = await istek('POST', '/categories', ayse, { name: 'Tekrar' });
    expect(ikinci.kod).toBe(409);
  });

  it('farklı kullanıcılar aynı adı kullanabiliyor', async () => {
    // Tekillik kullanıcı başına; Ayşe'nin kategorisi Bora'yı engellememeli.
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();

    await kategoriOlustur(ayse, 'Ortak Ad');
    const boraninki = await istek('POST', '/categories', bora, {
      name: 'Ortak Ad',
    });
    expect(boraninki.kod).toBe(201);
  });

  it('boş adı reddediyor', async () => {
    const ayse = await kullaniciOlustur();
    const yanit = await istek('POST', '/categories', ayse, { name: '' });
    expect(yanit.kod).toBe(422);
  });
});

describe('kategori listeleme', () => {
  it('sistem kategorileri ile kendi kategorilerini birlikte veriyor', async () => {
    const ayse = await kullaniciOlustur();
    await kategoriOlustur(ayse, 'Ayşe Kategorisi');

    const { govde } = await istek('GET', '/categories', ayse);
    const liste = govde as { name: string; isSystem: boolean }[];

    expect(liste.some((k) => k.isSystem)).toBe(true);
    expect(liste.some((k) => k.name === 'Ayşe Kategorisi')).toBe(true);
  });

  it('başkasının kategorisini göstermiyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    await kategoriOlustur(ayse, 'Ayşenin Gizlisi');

    const { govde } = await istek('GET', '/categories', bora);
    const liste = govde as { name: string }[];

    expect(liste.some((k) => k.name === 'Ayşenin Gizlisi')).toBe(false);
  });
});

describe('kategori değiştirme ve silme', () => {
  it('kendi kategorisini güncelliyor ve slug\'ı yeniliyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await kategoriOlustur(ayse, 'Eski Ad');

    const { kod, govde } = await istek(
      'PATCH',
      `/categories/${kategori.id}`,
      ayse,
      { name: 'Yeni Ad' },
    );

    expect(kod).toBe(200);
    expect((govde as { name: string; slug: string }).slug).toBe('yeni-ad');
  });

  it('sistem kategorisi değiştirilemiyor', async () => {
    // Belgede yazıyordu, testi yoktu.
    const ayse = await kullaniciOlustur();
    const sistem = await prisma.category.findFirstOrThrow({
      where: { userId: null },
    });

    const yanit = await istek('PATCH', `/categories/${sistem.id}`, ayse, {
      name: 'Ele geçirildi',
    });
    expect(yanit.kod).toBe(403);
  });

  it('sistem kategorisi silinemiyor', async () => {
    const ayse = await kullaniciOlustur();
    const sistem = await prisma.category.findFirstOrThrow({
      where: { userId: null },
    });

    expect((await istek('DELETE', `/categories/${sistem.id}`, ayse)).kod).toBe(403);
  });

  it('başkasının kategorisi 404 alıyor', async () => {
    // 403 değil 404: "bu kimlik var ama senin değil" bilgisi de sızmamalı.
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const kategori = await kategoriOlustur(ayse, 'Ayşenin');

    expect(
      (await istek('PATCH', `/categories/${kategori.id}`, bora, { name: 'X' })).kod,
    ).toBe(404);
    expect((await istek('DELETE', `/categories/${kategori.id}`, bora)).kod).toBe(404);

    // Ayşe'ninki bozulmadı.
    const guncel = await prisma.category.findUnique({
      where: { id: kategori.id },
    });
    expect(guncel?.name).toBe('Ayşenin');
  });

  it('kullanılmayan kategoriyi siliyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await kategoriOlustur(ayse, 'Silinecek');

    expect((await istek('DELETE', `/categories/${kategori.id}`, ayse)).kod).toBe(204);
    expect(
      await prisma.category.findUnique({ where: { id: kategori.id } }),
    ).toBeNull();
  });

  it('kullanımdaki kategoriyi silmiyor ve kaç abonelikte olduğunu söylüyor', async () => {
    const ayse = await kullaniciOlustur();
    const kategori = await kategoriOlustur(ayse, 'Dolu Kategori');

    await prisma.subscription.create({
      data: {
        userId: ayse.id,
        categoryId: kategori.id,
        name: 'Bağlı abonelik',
        priceMinor: BigInt(1000),
        currency: 'TRY',
        billingCycle: 'MONTHLY',
        startDate: new Date(Date.UTC(2026, 0, 10)),
      },
    });

    const yanit = await istek('DELETE', `/categories/${kategori.id}`, ayse);
    expect(yanit.kod).toBe(409);
    // Mesaj ne yapılacağını söylüyor, sadece "olmaz" demiyor.
    expect((yanit.govde as { title: string }).title).toContain('1 abonelikte');

    // Kategori duruyor: abonelik sahipsiz kalmadı.
    expect(
      await prisma.category.findUnique({ where: { id: kategori.id } }),
    ).not.toBeNull();
  });
});

describe('sağlayıcı kataloğu', () => {
  it('salt okunur ve arama yapılabiliyor', async () => {
    const ayse = await kullaniciOlustur();

    const hepsi = await istek('GET', '/providers', ayse);
    expect((hepsi.govde as unknown[]).length).toBeGreaterThan(10);

    const arama = await istek('GET', '/providers?q=netfl', ayse);
    const sonuc = arama.govde as { name: string }[];
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]?.name).toBe('Netflix');
  });

  it('arama büyük/küçük harf duyarsız', async () => {
    const ayse = await kullaniciOlustur();
    const arama = await istek('GET', '/providers?q=NETFLIX', ayse);
    expect((arama.govde as unknown[]).length).toBe(1);
  });

  it('eşleşme yoksa boş liste dönüyor', async () => {
    const ayse = await kullaniciOlustur();
    const arama = await istek('GET', '/providers?q=boyleBirSaglayiciYok', ayse);
    expect(arama.govde).toEqual([]);
  });
});
