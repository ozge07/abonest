/**
 * Günlük işin canlı doğrulaması.
 *
 * Buradaki en önemli iddia **idempotentlik**: iş aynı gün iki kez koşarsa
 * kullanıcı aynı hatırlatmayı iki kez almamalı. Bu, mock'lanmış bir depoyla
 * sınanamaz — korumayı sağlayan şey veritabanı kısıtının kendisi.
 *
 * `DATABASE_URL` gerektiriyor.
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { EmailSender, type EmailMessage } from '../../infra/email/email-sender.js';
import { SessionService } from '../auth/session.service.js';
import { DailyJobService } from './daily.service.js';

const KOK = '/api/v1';

let app: NestFastifyApplication;
let prisma: PrismaService;
let sessions: SessionService;
let daily: DailyJobService;

/** Gönderilen e-postalar; testler bunu okuyor. */
const gidenler: EmailMessage[] = [];

/** Bir sonraki gönderim patlasın mı — e-posta hatası senaryosu için. */
let epostaPatlasin = false;

class TestEmailSender extends EmailSender {
  async send(message: EmailMessage): Promise<void> {
    if (epostaPatlasin) {
      throw new Error('SMTP çöktü');
    }
    gidenler.push(message);
    return Promise.resolve();
  }
}

const olusturulanKullanicilar: string[] = [];

async function kullaniciOlustur() {
  const user = await prisma.user.create({
    data: {
      email: `job-${randomUUID()}@example.com`,
      passwordHash: 'test-icin-kullanilmiyor',
      name: 'Test',
      currency: 'TRY',
      emailVerifiedAt: new Date(),
    },
  });
  olusturulanKullanicilar.push(user.id);
  const { token } = await sessions.create(user.id, {});
  return { id: user.id, email: user.email, token };
}

async function sistemKategorisiId(): Promise<string> {
  const kategori = await prisma.category.findFirst({ where: { userId: null } });
  if (kategori === null) {
    throw new Error('Sistem kategorisi yok — önce `npm run seed` çalıştır.');
  }
  return kategori.id;
}

/** Doğrudan veritabanına abonelik yazıyor; tarihleri testin kontrolünde. */
async function abonelikYaz(
  userId: string,
  ozellikler: {
    name?: string;
    startDate: Date;
    reminderDaysBefore?: number;
    reminderEnabled?: boolean;
    endDate?: Date;
    priceMinor?: number;
  },
) {
  return prisma.subscription.create({
    data: {
      userId,
      categoryId: await sistemKategorisiId(),
      name: ozellikler.name ?? 'Netflix',
      priceMinor: BigInt(ozellikler.priceMinor ?? 22_999),
      currency: 'TRY',
      billingCycle: 'MONTHLY',
      startDate: ozellikler.startDate,
      reminderEnabled: ozellikler.reminderEnabled ?? true,
      reminderDaysBefore: ozellikler.reminderDaysBefore ?? 3,
      ...(ozellikler.endDate !== undefined ? { endDate: ozellikler.endDate } : {}),
    },
  });
}

const gun = (yil: number, ay: number, gunu: number) =>
  new Date(Date.UTC(yil, ay - 1, gunu));

beforeAll(async () => {
  const modul = await Test.createTestingModule({ imports: [AppModule] })
    // Gerçek gönderici log'a yazıyor; testte gönderilenleri saymak ve hata
    // senaryosunu üretmek gerekiyor.
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
  sessions = app.get(SessionService);
  daily = app.get(DailyJobService);
}, 60_000);

beforeEach(() => {
  gidenler.length = 0;
  epostaPatlasin = false;
});

afterAll(async () => {
  if (olusturulanKullanicilar.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: olusturulanKullanicilar } },
    });
  }
  await app?.close();
});

describe('günlük iş — hatırlatmalar', () => {
  it('pencereye giren ödeme için bildirim ve e-posta üretiyor', async () => {
    const kullanici = await kullaniciOlustur();
    // Ayın 10'unda başlayan abonelik; "bugün" 8'i, yani 2 gün kaldı.
    await abonelikYaz(kullanici.id, {
      startDate: gun(2026, 9, 10),
      reminderDaysBefore: 3,
    });

    await daily.run(gun(2026, 9, 8));

    const bildirimler = await prisma.notification.findMany({
      where: { userId: kullanici.id },
    });
    expect(bildirimler).toHaveLength(1);
    expect(bildirimler[0]?.type).toBe('PAYMENT_REMINDER');
    expect(bildirimler[0]?.title).toContain('2 gün sonra');

    const eposta = gidenler.filter((m) => m.to === kullanici.email);
    expect(eposta).toHaveLength(1);
  });

  it('iş iki kez koşarsa ikinci bildirim oluşmuyor', async () => {
    const kullanici = await kullaniciOlustur();
    await abonelikYaz(kullanici.id, { startDate: gun(2026, 9, 10) });

    await daily.run(gun(2026, 9, 8));
    await daily.run(gun(2026, 9, 8));

    const sayi = await prisma.notification.count({
      where: { userId: kullanici.id },
    });
    expect(sayi).toBe(1);
    // E-posta da bir kez gitti.
    expect(gidenler.filter((m) => m.to === kullanici.email)).toHaveLength(1);
  });

  it('ödeme günü ayrı türde bildirim üretiyor', async () => {
    const kullanici = await kullaniciOlustur();
    await abonelikYaz(kullanici.id, { startDate: gun(2026, 9, 10) });

    await daily.run(gun(2026, 9, 10));

    const bildirim = await prisma.notification.findFirst({
      where: { userId: kullanici.id },
    });
    expect(bildirim?.type).toBe('PAYMENT_TODAY');
    expect(bildirim?.title).toContain('bugün');
  });

  it('pencere dışındaki ödemeye dokunmuyor', async () => {
    const kullanici = await kullaniciOlustur();
    // 3 gün önceden uyarı isteniyor ama ödemeye 10 gün var.
    await abonelikYaz(kullanici.id, {
      startDate: gun(2026, 9, 18),
      reminderDaysBefore: 3,
    });

    await daily.run(gun(2026, 9, 8));

    const sayi = await prisma.notification.count({
      where: { userId: kullanici.id },
    });
    expect(sayi).toBe(0);
  });

  it('hatırlatması kapalı abonelik için bildirim üretmiyor', async () => {
    const kullanici = await kullaniciOlustur();
    await abonelikYaz(kullanici.id, {
      startDate: gun(2026, 9, 10),
      reminderEnabled: false,
    });

    await daily.run(gun(2026, 9, 8));

    expect(
      await prisma.notification.count({ where: { userId: kullanici.id } }),
    ).toBe(0);
  });

  it('e-posta gönderilemezse ertesi gün tekrar deniyor', async () => {
    const kullanici = await kullaniciOlustur();
    await abonelikYaz(kullanici.id, {
      startDate: gun(2026, 9, 10),
      reminderDaysBefore: 5,
    });

    epostaPatlasin = true;
    await daily.run(gun(2026, 9, 7));
    // Sayaçlar bütün kullanıcıları kapsıyor; iddiaları bu kullanıcıya
    // daraltıyoruz ki test başka dosyaların verisine bağlı olmasın.
    expect(gidenler.filter((m) => m.to === kullanici.email)).toHaveLength(0);

    // Uygulama içi bildirim yine de yazıldı: kullanıcı arayüzde görüyor.
    expect(
      await prisma.notification.count({ where: { userId: kullanici.id } }),
    ).toBe(1);

    // Ertesi gün gönderim çalışıyor. Bildirim zaten var, ama e-posta
    // gönderimi bildirimin varlığına değil `reminderSentAt`e bağlı.
    epostaPatlasin = false;
    await daily.run(gun(2026, 9, 8));
    expect(gidenler.filter((m) => m.to === kullanici.email)).toHaveLength(1);

    // Gönderim işareti artık dolu: üçüncü tur aynı e-postayı tekrar atmıyor.
    // Hatırlatma en yakın ödeme için gitti; sıralamayı belirtmezsek
    // findFirst rastgele bir satır döndürüyor.
    const odeme = await prisma.subscriptionOccurrence.findFirst({
      where: { subscription: { userId: kullanici.id } },
      orderBy: { dueDate: 'asc' },
    });
    expect(odeme?.reminderSentAt).not.toBeNull();
  });
});

describe('günlük iş — süresi dolan abonelikler', () => {
  it('bitiş tarihi geçen aboneliği kapatıp bir kez bildiriyor', async () => {
    const kullanici = await kullaniciOlustur();
    const abonelik = await abonelikYaz(kullanici.id, {
      name: 'Dergi',
      startDate: gun(2026, 1, 10),
      endDate: gun(2026, 6, 30),
    });

    await daily.run(gun(2026, 9, 8));

    const guncel = await prisma.subscription.findUnique({
      where: { id: abonelik.id },
    });
    expect(guncel?.status).toBe('EXPIRED');
    expect(guncel?.nextPaymentDate).toBeNull();

    const bildirimler = await prisma.notification.findMany({
      where: { userId: kullanici.id, type: 'SUBSCRIPTION_EXPIRED' },
    });
    expect(bildirimler).toHaveLength(1);

    // İkinci tur ne durumu ne de bildirimi tekrarlıyor.
    await daily.run(gun(2026, 9, 9));
    expect(
      await prisma.notification.count({
        where: { userId: kullanici.id, type: 'SUBSCRIPTION_EXPIRED' },
      }),
    ).toBe(1);
  });
});

describe('günlük iş — ödeme üretimi', () => {
  it('eksik ödemeleri tamamlıyor', async () => {
    const kullanici = await kullaniciOlustur();
    const abonelik = await abonelikYaz(kullanici.id, {
      startDate: gun(2026, 9, 10),
    });

    // Doğrudan yazdığımız için henüz hiç ödeme kaydı yok.
    expect(
      await prisma.subscriptionOccurrence.count({
        where: { subscriptionId: abonelik.id },
      }),
    ).toBe(0);

    await daily.run(gun(2026, 9, 8));

    const sayi = await prisma.subscriptionOccurrence.count({
      where: { subscriptionId: abonelik.id },
    });
    // 60 günlük ufuk 8 Eylül'den 7 Kasım'a kadar: 10 Eylül ve 10 Ekim
    // giriyor, 10 Kasım girmiyor.
    expect(sayi).toBe(2);
  });
});

describe('tetikleyici ucu', () => {
  async function tetikle(sir?: string) {
    return app.inject({
      method: 'POST',
      url: `${KOK}/internal/jobs/daily`,
      headers: sir !== undefined ? { 'x-cron-secret': sir } : {},
    });
  }

  it('sır olmadan reddediyor', async () => {
    expect((await tetikle()).statusCode).toBe(403);
  });

  it('yanlış sırla reddediyor', async () => {
    expect((await tetikle('yanlis-sir')).statusCode).toBe(403);
  });

  it('doğru sırla çalışıyor ve özet dönüyor', async () => {
    const yanit = await tetikle(process.env['CRON_SECRET']);
    expect(yanit.statusCode).toBe(200);
    expect(JSON.parse(yanit.body)).toMatchObject({ tamamlandi: true });
  });

  it('kullanıcı oturumu bu ucu açmıyor', async () => {
    const kullanici = await kullaniciOlustur();
    const yanit = await app.inject({
      method: 'POST',
      url: `${KOK}/internal/jobs/daily`,
      headers: { authorization: `Bearer ${kullanici.token}` },
    });
    // Oturum var ama cron sırrı yok: yine 403.
    expect(yanit.statusCode).toBe(403);
  });
});
