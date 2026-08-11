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
      email: `bildirim-${randomUUID()}@example.com`,
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

async function bildirimYaz(userId: string, baslik: string, okundu = false) {
  return prisma.notification.create({
    data: {
      userId,
      type: 'PAYMENT_REMINDER',
      title: baslik,
      body: 'gövde',
      // occurrenceId boş bırakılıyor; tekillik kısıtı NULL'da devrede değil,
      // testte de kasıtlı olarak birden fazla kayıt yazıyoruz.
      ...(okundu ? { readAt: new Date() } : {}),
    },
  });
}

async function istek(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  kullanici?: Kullanici,
) {
  const yanit = await app.inject({
    method,
    url: `${KOK}${url}`,
    headers: kullanici?.basliklar ?? {},
  });
  return {
    kod: yanit.statusCode,
    govde: yanit.body === '' ? null : (JSON.parse(yanit.body) as never),
  };
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

describe('bildirim uçları', () => {
  it('yalnızca kendi bildirimlerini listeliyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    await bildirimYaz(ayse.id, 'Ayşe için');
    await bildirimYaz(bora.id, 'Bora için');

    const { govde } = await istek('GET', '/notifications', ayse);
    const liste = (govde as { data: { title: string }[] }).data;

    expect(liste).toHaveLength(1);
    expect(liste[0]?.title).toBe('Ayşe için');
  });

  it('okunmamış sayısı yalnızca okunmamışları sayıyor', async () => {
    const ayse = await kullaniciOlustur();
    await bildirimYaz(ayse.id, 'okunmamış 1');
    await bildirimYaz(ayse.id, 'okunmamış 2');
    await bildirimYaz(ayse.id, 'okunmuş', true);

    const { govde } = await istek('GET', '/notifications/unread-count', ayse);
    expect((govde as { count: number }).count).toBe(2);
  });

  it('unreadOnly=false bütün bildirimleri döndürüyor', async () => {
    // Sorgu dizesinden gelen "false" bir metin ve truthy; naif bir
    // dönüştürme bunu true sayıp yalnızca okunmamışları döndürürdü.
    const ayse = await kullaniciOlustur();
    await bildirimYaz(ayse.id, 'okunmamış');
    await bildirimYaz(ayse.id, 'okunmuş', true);

    const hepsi = await istek('GET', '/notifications?unreadOnly=false', ayse);
    expect((hepsi.govde as { data: unknown[] }).data).toHaveLength(2);

    const sadeceOkunmamis = await istek(
      'GET',
      '/notifications?unreadOnly=true',
      ayse,
    );
    expect((sadeceOkunmamis.govde as { data: unknown[] }).data).toHaveLength(1);
  });

  it('okundu işaretliyor', async () => {
    const ayse = await kullaniciOlustur();
    const bildirim = await bildirimYaz(ayse.id, 'oku beni');

    const yanit = await istek('PATCH', `/notifications/${bildirim.id}/read`, ayse);
    expect(yanit.kod).toBe(204);

    const sayi = await istek('GET', '/notifications/unread-count', ayse);
    expect((sayi.govde as { count: number }).count).toBe(0);
  });

  it('aynı bildirimi ikinci kez okundu işaretlemek hata vermiyor', async () => {
    // Çift tıklayan kullanıcı hata görmemeli.
    const ayse = await kullaniciOlustur();
    const bildirim = await bildirimYaz(ayse.id, 'oku beni');

    await istek('PATCH', `/notifications/${bildirim.id}/read`, ayse);
    const ikinci = await istek('PATCH', `/notifications/${bildirim.id}/read`, ayse);
    expect(ikinci.kod).toBe(204);
  });

  it('hepsini okundu işaretliyor', async () => {
    const ayse = await kullaniciOlustur();
    await bildirimYaz(ayse.id, 'bir');
    await bildirimYaz(ayse.id, 'iki');

    expect((await istek('POST', '/notifications/read-all', ayse)).kod).toBe(204);

    const sayi = await istek('GET', '/notifications/unread-count', ayse);
    expect((sayi.govde as { count: number }).count).toBe(0);
  });

  it('başkasının bildirimini okundu işaretleyemiyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    const bildirim = await bildirimYaz(ayse.id, 'Ayşe için');

    const yanit = await istek('PATCH', `/notifications/${bildirim.id}/read`, bora);
    expect(yanit.kod).toBe(404);

    // Ayşe'nin bildirimi hâlâ okunmamış.
    const guncel = await prisma.notification.findUnique({
      where: { id: bildirim.id },
    });
    expect(guncel?.readAt).toBeNull();
  });

  it('başkasının read-all çağrısı bize dokunmuyor', async () => {
    const ayse = await kullaniciOlustur();
    const bora = await kullaniciOlustur();
    await bildirimYaz(ayse.id, 'Ayşe için');

    await istek('POST', '/notifications/read-all', bora);

    const sayi = await istek('GET', '/notifications/unread-count', ayse);
    expect((sayi.govde as { count: number }).count).toBe(1);
  });

  it('oturumsuz erişim reddediliyor', async () => {
    expect((await istek('GET', '/notifications')).kod).toBe(401);
    expect((await istek('GET', '/notifications/unread-count')).kod).toBe(401);
  });
});
