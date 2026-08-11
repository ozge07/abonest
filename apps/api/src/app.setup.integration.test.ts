/**
 * Sertleştirme ayarlarının testi.
 *
 * Bu dosyanın tamamı **gerileme koruması**: buradaki her iddia, canlı
 * yoklamada eksik ya da kırık bulunmuş bir şeye karşılık geliyor. Ayarlar
 * sessizce kaybolabilecek türden — bir başlık kaldırılınca hiçbir test
 * kırılmazsa kimse fark etmez.
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
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig } from './infra/config/config.js';
import { PrismaService } from './infra/database/prisma.service.js';

const KOK = '/api/v1';

let app: NestFastifyApplication;

/** Hız sınırı testi gerçek kullanıcı yaratıyor; sonunda temizleniyor. */
const olusturulanEpostalar: string[] = [];

beforeAll(async () => {
  const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modul.createNestApplication<NestFastifyApplication>(
    // Yoklamada eksik çıkan başlıklar üretim modunda ekleniyor; testte de
    // aynı yolu kullanıyoruz.
    new FastifyAdapter(),
    { logger: false },
  );
  await configureApp(app, pino({ level: 'silent' }), { production: true });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 60_000);

afterAll(async () => {
  if (olusturulanEpostalar.length > 0) {
    const prisma = app.get(PrismaService);
    await prisma.user.deleteMany({
      where: { email: { in: olusturulanEpostalar } },
    });
  }
  await app?.close();
});

describe('güvenlik başlıkları', () => {
  it('her yanıtta gönderiliyor', async () => {
    const yanit = await app.inject({ method: 'GET', url: `${KOK}/subscriptions` });

    expect(yanit.headers['x-content-type-options']).toBe('nosniff');
    expect(yanit.headers['x-frame-options']).toBe('DENY');
    expect(yanit.headers['referrer-policy']).toBe('no-referrer');
    expect(yanit.headers['content-security-policy']).toContain("default-src 'none'");
    expect(yanit.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('hata yanıtlarında da gönderiliyor', async () => {
    // 401 de bir yanıt; başlıkların yalnızca mutlu yolda eklenmesi
    // yeterli olmazdı.
    const yanit = await app.inject({ method: 'GET', url: `${KOK}/subscriptions` });
    expect(yanit.statusCode).toBe(401);
    expect(yanit.headers['x-content-type-options']).toBe('nosniff');
  });

  it('üretimde HSTS ekleniyor', async () => {
    const yanit = await app.inject({ method: 'GET', url: '/health' });
    expect(yanit.headers['strict-transport-security']).toContain('max-age=');
  });

  it('sunucu teknolojisini duyurmuyor', async () => {
    const yanit = await app.inject({ method: 'GET', url: '/health' });
    expect(yanit.headers['x-powered-by']).toBeUndefined();
  });
});

describe('vekil güveni', () => {
  it('varsayılan olarak kapalı', () => {
    // Açık olduğunda istemci `X-Forwarded-For` ile kendi IP'sini
    // uydurabiliyor ve IP tabanlı hız sınırı işlevsiz kalıyor. Canlı
    // yoklamada tam olarak bu oldu: sahte başlıkla arka arkaya dokuz hesap
    // açılabildi.
    const config = loadConfig({
      DATABASE_URL: 'postgresql://a:b@localhost:5432/c',
      SESSION_SECRET: 'x'.repeat(32),
      CRON_SECRET: 'y'.repeat(32),
    } as NodeJS.ProcessEnv);

    expect(config.TRUST_PROXY).toBe(false);
  });

  it('vekil sayısı olarak ayarlanabiliyor', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://a:b@localhost:5432/c',
      SESSION_SECRET: 'x'.repeat(32),
      CRON_SECRET: 'y'.repeat(32),
      TRUST_PROXY: '1',
    } as NodeJS.ProcessEnv);

    expect(config.TRUST_PROXY).toBe(1);
  });

  it('sahte X-Forwarded-For istemcinin IP kovasını değiştirmiyor', async () => {
    // Kayıt ucu saatte 5 ile sınırlı ve yalnızca IP bazında sayıyor —
    // e-posta bazlı ikinci bir kova yok, dolayısıyla IP sahteciliği burada
    // en çok işe yarardı.
    const kodlar: number[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const eposta = `sahte-${randomUUID()}@example.com`;
      olusturulanEpostalar.push(eposta);
      const yanit = await app.inject({
        method: 'POST',
        url: `${KOK}/auth/register`,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${i}`,
        },
        payload: JSON.stringify({
          email: eposta,
          password: 'CokGuclu!Parola123',
          name: 'Sahte',
        }),
      });
      kodlar.push(yanit.statusCode);
    }

    expect(kodlar).toContain(429);
  });
});
