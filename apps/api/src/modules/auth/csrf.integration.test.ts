/**
 * Tarayıcı akışının CSRF doğrulaması.
 *
 * Bu dosyanın varlık sebebi somut bir hata: CSRF karşılaştırması oturum
 * cookie'sinin kendisiyle yapılıyordu ve o cookie `httpOnly` — tarayıcıdaki
 * JavaScript onu okuyup başlığa koyamıyor. Yani web istemcisi hiçbir yazma
 * isteği yapamıyordu. curl ile test ederken görünmedi, çünkü curl iki değeri
 * de elle koyabiliyor; hata ancak arayüz yazılırken ortaya çıktı.
 *
 * Buradaki testler tarayıcının **yapabildiği** şeyle sınırlı davranıyor:
 * yalnızca `httpOnly` olmayan cookie'yi okuyup başlığa koyuyorlar.
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
import { PasswordService } from './password.service.js';

const KOK = '/api/v1';
const SIFRE = 'CokGuclu!Parola123';

let app: NestFastifyApplication;
let prisma: PrismaService;

const olusturulanKullanicilar: string[] = [];

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
}, 60_000);

afterAll(async () => {
  if (olusturulanKullanicilar.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: olusturulanKullanicilar } },
    });
  }
  await app?.close();
});

/**
 * Tarayıcı taklidi: giriş yapıp cookie'leri saklıyor.
 *
 * `okunabilirCookieler` yalnızca `httpOnly` olmayanları içeriyor — tarayıcıda
 * `document.cookie` ne görüyorsa o.
 */
async function tarayiciGirisi(): Promise<{
  tumCookieler: Record<string, string>;
  okunabilirCookieler: Record<string, string>;
}> {
  const passwords = app.get(PasswordService);
  const user = await prisma.user.create({
    data: {
      email: `csrf-${randomUUID()}@example.com`,
      passwordHash: await passwords.hash(SIFRE),
      name: 'Test',
      currency: 'TRY',
      emailVerifiedAt: new Date(),
    },
  });
  olusturulanKullanicilar.push(user.id);

  const yanit = await app.inject({
    method: 'POST',
    url: `${KOK}/auth/login`,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ email: user.email, password: SIFRE }),
  });
  expect(yanit.statusCode).toBe(200);

  const tumCookieler: Record<string, string> = {};
  const okunabilirCookieler: Record<string, string> = {};
  for (const cookie of yanit.cookies) {
    tumCookieler[cookie.name] = cookie.value;
    if (cookie.httpOnly !== true) {
      okunabilirCookieler[cookie.name] = cookie.value;
    }
  }

  return { tumCookieler, okunabilirCookieler };
}

function cookieBasligi(cookieler: Record<string, string>): string {
  return Object.entries(cookieler)
    .map(([ad, deger]) => `${ad}=${deger}`)
    .join('; ');
}

describe('tarayıcı CSRF akışı', () => {
  it('oturum cookie\'si httpOnly, CSRF cookie\'si okunabilir', async () => {
    const { tumCookieler, okunabilirCookieler } = await tarayiciGirisi();

    expect(tumCookieler['oturum']).toBeDefined();
    // Oturum token'ı JavaScript'e kapalı: XSS ile çalınamaz.
    expect(okunabilirCookieler['oturum']).toBeUndefined();
    // CSRF token'ı okunabilir olmak zorunda; istemci onu başlığa koyacak.
    expect(okunabilirCookieler['csrf']).toBeDefined();
    // İki değer birbirinden bağımsız.
    expect(okunabilirCookieler['csrf']).not.toBe(tumCookieler['oturum']);
  });

  it('istemci yalnızca okuyabildiği değerle yazma isteği yapabiliyor', async () => {
    const { tumCookieler, okunabilirCookieler } = await tarayiciGirisi();

    const yanit = await app.inject({
      method: 'POST',
      url: `${KOK}/auth/logout`,
      headers: {
        cookie: cookieBasligi(tumCookieler),
        // Tarayıcının erişebildiği tek değer bu.
        'x-csrf-token': okunabilirCookieler['csrf']!,
      },
    });

    expect(yanit.statusCode).toBe(204);
  });

  it('CSRF başlığı olmadan yazma isteği reddediliyor', async () => {
    const { tumCookieler } = await tarayiciGirisi();

    const yanit = await app.inject({
      method: 'POST',
      url: `${KOK}/auth/logout`,
      headers: { cookie: cookieBasligi(tumCookieler) },
    });

    expect(yanit.statusCode).toBe(403);
  });

  it('yanlış CSRF değeri reddediliyor', async () => {
    const { tumCookieler } = await tarayiciGirisi();

    const yanit = await app.inject({
      method: 'POST',
      url: `${KOK}/auth/logout`,
      headers: {
        cookie: cookieBasligi(tumCookieler),
        'x-csrf-token': 'baskasinin-uydurdugu-deger',
      },
    });

    expect(yanit.statusCode).toBe(403);
  });

  it('okuma isteği CSRF istemiyor', async () => {
    const { tumCookieler } = await tarayiciGirisi();

    const yanit = await app.inject({
      method: 'GET',
      url: `${KOK}/dashboard`,
      headers: { cookie: cookieBasligi(tumCookieler) },
    });

    expect(yanit.statusCode).toBe(200);
  });

  it('çıkış yapınca iki cookie de siliniyor', async () => {
    const { tumCookieler, okunabilirCookieler } = await tarayiciGirisi();

    const yanit = await app.inject({
      method: 'POST',
      url: `${KOK}/auth/logout`,
      headers: {
        cookie: cookieBasligi(tumCookieler),
        'x-csrf-token': okunabilirCookieler['csrf']!,
      },
    });

    const silinenler = yanit.cookies.map((c) => c.name);
    expect(silinenler).toContain('oturum');
    expect(silinenler).toContain('csrf');
  });
});
