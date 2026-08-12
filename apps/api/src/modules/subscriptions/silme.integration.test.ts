/**
 * Silmenin geri alınabilirliği.
 *
 * Önce silme kalıcıydı: satır ve ödeme kayıtları cascade ile gidiyordu,
 * geri getirmenin hiçbir yolu yoktu ve **silindiğine dair denetim kaydı
 * bile tutulmuyordu**. Kazayla silen kullanıcıya söylenecek tek şey
 * "yedeğiniz var mı" oluyordu.
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
import { DailyJobService } from '../jobs/daily.service.js';

const KOK = '/api/v1';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sessions: SessionService;
let daily: DailyJobService;

const olusturulanKullanicilar: string[] = [];

interface Kullanici {
  id: string;
  basliklar: Record<string, string>;
}

async function kullaniciOlustur(): Promise<Kullanici> {
  const user = await prisma.user.create({
    data: {
      email: `silme-${randomUUID()}@example.com`,
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
  method: 'GET' | 'POST' | 'DELETE',
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

async function abonelikEkle(kullanici: Kullanici): Promise<string> {
  const kategori = await prisma.category.findFirstOrThrow({
    where: { userId: null },
  });
  const { kod, govde } = await istek('POST', '/subscriptions', kullanici, {
    name: 'Silinecek',
    categoryId: kategori.id,
    priceMinor: 10_000,
    currency: 'TRY',
    billingCycle: 'MONTHLY',
    startDate: '2026-08-10',
  });
  expect(kod).toBe(201);
  return (govde as { id: string }).id;
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
  daily = app.get(DailyJobService);
}, 60_000);

afterAll(async () => {
  if (olusturulanKullanicilar.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: olusturulanKullanicilar } },
    });
  }
  await app?.close();
});

describe('silme geri alınabilir', () => {
  it('silinen abonelik listeden çıkıyor ama veritabanında duruyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);

    expect((await istek('DELETE', `/subscriptions/${id}`, ayse)).kod).toBe(204);

    const liste = await istek('GET', '/subscriptions', ayse);
    expect((liste.govde as { data: unknown[] }).data).toHaveLength(0);

    // Kayıt yerinde: geri getirilebilmesinin tek yolu bu.
    const satir = await prisma.subscription.findUnique({ where: { id } });
    expect(satir).not.toBeNull();
    expect(satir?.deletedAt).not.toBeNull();
  });

  it('silinen abonelik tekil sorguda da görünmüyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    expect((await istek('GET', `/subscriptions/${id}`, ayse)).kod).toBe(404);
  });

  it('çöp kutusunda listeleniyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    const cop = await istek('GET', '/subscriptions/deleted', ayse);
    const liste = cop.govde as { id: string; deletedAt: string }[];

    expect(liste).toHaveLength(1);
    expect(liste[0]?.id).toBe(id);
    expect(liste[0]?.deletedAt).not.toBeNull();
  });

  it('geri getirilince listeye dönüyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    expect((await istek('POST', `/subscriptions/${id}/restore`, ayse)).kod).toBe(200);

    const liste = await istek('GET', '/subscriptions', ayse);
    expect((liste.govde as { data: unknown[] }).data).toHaveLength(1);

    // Ödemeleri de geri geliyor: silinirken kaldırılmıştı.
    const odeme = await prisma.subscriptionOccurrence.count({
      where: { subscriptionId: id },
    });
    expect(odeme).toBeGreaterThan(0);
  });

  it('geri getirilen abonelikte sıradaki ödeme tarihi yerine dönüyor', async () => {
    /*
     * Silme `nextPaymentDate`'i boşaltıyor ama geri getirme onu geri
     * koymuyordu: abonelik listeye dönüyor, "sıradaki ödeme" sütunu boş
     * kalıyordu. Kullanıcı bunu "bildirimler yanlış" olarak görüyor.
     */
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);

    const oncesi = await istek('GET', `/subscriptions/${id}`, ayse);
    const beklenen = (oncesi.govde as { nextPaymentDate: string })
      .nextPaymentDate;
    expect(beklenen).not.toBeNull();

    await istek('DELETE', `/subscriptions/${id}`, ayse);
    await istek('POST', `/subscriptions/${id}/restore`, ayse);

    const sonrasi = await istek('GET', `/subscriptions/${id}`, ayse);
    expect((sonrasi.govde as { nextPaymentDate: string }).nextPaymentDate).toBe(
      beklenen,
    );
  });

  it('silinmemiş aboneliği geri getirmeye çalışmak 404', async () => {
    // Sessizce başarılı görünmemeli.
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);

    expect((await istek('POST', `/subscriptions/${id}/restore`, ayse)).kod).toBe(404);
  });

  it('başkasının silinmiş aboneliğine erişilemiyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    expect((await istek('POST', `/subscriptions/${id}/restore`, bora)).kod).toBe(404);
    expect((await istek('GET', '/subscriptions/deleted', bora)).govde).toEqual([]);

    // Ayşe'ninki hâlâ geri getirilebilir.
    expect((await istek('POST', `/subscriptions/${id}/restore`, ayse)).kod).toBe(200);
  });

  it('silme denetim kaydına yazılıyor', async () => {
    // Bu olay listede tanımlıydı ama hiçbir yerden çağrılmıyordu.
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    const kayit = await prisma.auditLog.findFirst({
      where: { userId: ayse.id, action: 'subscription.deleted' },
    });
    expect(kayit).not.toBeNull();
    expect(kayit?.entityId).toBe(id);
    // Abonelik adı yazılmıyor: denetim kaydı sızarsa kullanıcının nelere
    // abone olduğunu vermemeli.
    expect(JSON.stringify(kayit)).not.toContain('Silinecek');
  });
});

describe('silinmiş abonelik hiçbir yere sızmıyor', () => {
  it('özete ve analize girmiyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);

    const oncesi = await istek('GET', '/dashboard', ayse);
    expect((oncesi.govde as { activeCount: number }).activeCount).toBe(1);

    await istek('DELETE', `/subscriptions/${id}`, ayse);

    const sonrasi = await istek('GET', '/dashboard', ayse);
    expect((sonrasi.govde as { activeCount: number }).activeCount).toBe(0);

    const analiz = await istek(
      'GET',
      '/analytics/spending?from=2026-08-01&to=2026-08-31',
      ayse,
    );
    expect((analiz.govde as { totals: unknown[] }).totals).toEqual([]);
  });

  it('hatırlatma üretilmiyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    await daily.run();

    const bildirim = await prisma.notification.count({
      where: { userId: ayse.id },
    });
    expect(bildirim).toBe(0);
  });

  it('kategori silmede sebebi ve çıkış yolunu söylüyor', async () => {
    // Görünmeyen bir abonelik yüzünden "N abonelikte kullanılıyor" demek,
    // kullanıcıyı olmayan bir kaydı aramaya gönderirdi.
    const ayse = await kullaniciOlustur();
    const kategori = await istek('POST', '/categories', ayse, {
      name: `Geçici ${randomUUID().slice(0, 8)}`,
    });
    const kategoriId = (kategori.govde as { id: string }).id;

    const { govde } = await istek('POST', '/subscriptions', ayse, {
      name: 'Bağlı',
      categoryId: kategoriId,
      priceMinor: 1000,
      currency: 'TRY',
      billingCycle: 'MONTHLY',
      startDate: '2026-08-10',
    });
    const id = (govde as { id: string }).id;

    // Silmeden önce kategori kilitli.
    expect((await istek('DELETE', `/categories/${kategoriId}`, ayse)).kod).toBe(409);

    await istek('DELETE', `/subscriptions/${id}`, ayse);

    // Silinmiş kayıt hâlâ kategoriye bağlı; yabancı anahtar tutuyor.
    // Kullanıcı sebebi ve çıkış yolunu görüyor.
    const engel = await istek('DELETE', `/categories/${kategoriId}`, ayse);
    expect(engel.kod).toBe(409);
    expect((engel.govde as { title: string }).title).toContain('Çöp kutusunda');

    // Kalıcı silince kategori kaldırılabiliyor.
    expect((await istek('DELETE', `/subscriptions/${id}/purge`, ayse)).kod).toBe(204);
    expect((await istek('DELETE', `/categories/${kategoriId}`, ayse)).kod).toBe(204);
  });
});

describe('kalıcı temizlik', () => {
  it('bekleme süresi dolan kayıt gerçekten siliniyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    await prisma.subscription.update({
      where: { id },
      data: { deletedAt: new Date(Date.now() - 31 * 86_400_000) },
    });

    const sonuc = await daily.run();
    expect(sonuc.temizlenenAbonelik).toBeGreaterThanOrEqual(1);
    expect(await prisma.subscription.findUnique({ where: { id } })).toBeNull();
  });

  it('süresi dolmamış kayda dokunmuyor', async () => {
    const ayse = await kullaniciOlustur();
    const id = await abonelikEkle(ayse);
    await istek('DELETE', `/subscriptions/${id}`, ayse);

    await daily.run();

    expect(await prisma.subscription.findUnique({ where: { id } })).not.toBeNull();
  });
});
