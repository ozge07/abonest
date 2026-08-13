/**
 * Denetim kaydı ve hesap temizliği.
 *
 * İki iddia sınanıyor:
 * 1. Güvenlik olayları kaydediliyor ve kayıtta hassas veri **yok**.
 * 2. "N gün sonra kalıcı silinecek" sözü tutuluyor.
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
import { PURGE_AFTER_DAYS } from '@abonelik/shared';
import { PrismaService } from '../database/prisma.service.js';
import { PasswordService } from '../../modules/auth/password.service.js';
import { DailyJobService } from '../../modules/jobs/daily.service.js';

const KOK = '/api/v1';
const SIFRE = 'CokGuclu!Parola123';

let app: NestFastifyApplication;
let prisma: PrismaService;
let passwords: PasswordService;
let daily: DailyJobService;

const olusturulanKullanicilar: string[] = [];

async function kullaniciOlustur(dogrulanmis = true) {
  const eposta = `denetim-${randomUUID()}@example.com`;
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

async function giris(email: string, sifre = SIFRE) {
  return app.inject({
    method: 'POST',
    url: `${KOK}/auth/login`,
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ email, password: sifre }),
  });
}

async function kayitlar(userId: string) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
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
  passwords = app.get(PasswordService);
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

describe('denetim kaydı', () => {
  it('başarılı girişi kaydediyor', async () => {
    const kullanici = await kullaniciOlustur();
    expect((await giris(kullanici.email)).statusCode).toBe(200);

    const liste = await kayitlar(kullanici.id);
    expect(liste.map((k) => k.action)).toContain('auth.login');
  });

  it('başarısız girişi kaydediyor', async () => {
    const kullanici = await kullaniciOlustur();
    expect((await giris(kullanici.email, 'YanlisSifre123!')).statusCode).toBe(401);

    const liste = await kayitlar(kullanici.id);
    expect(liste.map((k) => k.action)).toContain('auth.login_failed');
  });

  it('kayıtta şifre, token ya da e-posta bulunmuyor', async () => {
    // Denetim kaydı sızarsa saldırgana yeni bilgi vermemeli.
    const kullanici = await kullaniciOlustur();
    await giris(kullanici.email);
    await giris(kullanici.email, 'YanlisSifre123!');

    const liste = await kayitlar(kullanici.id);
    const hepsi = JSON.stringify(liste);

    expect(hepsi).not.toContain(SIFRE);
    expect(hepsi).not.toContain(kullanici.email);
    expect(hepsi).not.toMatch(/passwordHash|tokenHash/);
  });

  it('IP ham değil, özet olarak saklanıyor', async () => {
    const kullanici = await kullaniciOlustur();
    await giris(kullanici.email);

    const kayit = (await kayitlar(kullanici.id)).find(
      (k) => k.action === 'auth.login',
    );
    expect(kayit?.ipHash).not.toBeNull();
    // Fastify testte 127.0.0.1 görüyor; özet o değeri içermemeli.
    expect(kayit?.ipHash).not.toContain('127.0.0.1');
  });

  it('şifre değişikliğini kaydediyor', async () => {
    const kullanici = await kullaniciOlustur();
    const oturum = await giris(kullanici.email);
    const jeton = JSON.parse(oturum.body).token as string;

    const yanit = await app.inject({
      method: 'PATCH',
      url: `${KOK}/me/password`,
      headers: {
        authorization: `Bearer ${jeton}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        currentPassword: SIFRE,
        newPassword: 'BambaskaGuclu!Parola456',
      }),
    });
    expect(yanit.statusCode).toBe(204);

    const liste = await kayitlar(kullanici.id);
    expect(liste.map((k) => k.action)).toContain('auth.password_changed');
  });

  it('denetim kaydı yazılamasa bile işlem düşmüyor', async () => {
    // Kayıt yazımı en iyi çaba: tablo dolsa bile kullanıcı giriş yapabilmeli.
    const kullanici = await kullaniciOlustur();
    const audit = app.get(
      (await import('./audit.service.js')).AuditService,
    );
    // Var olmayan kullanıcıya kayıt yazmak yabancı anahtar hatası veriyor.
    await expect(
      audit.record({
        action: 'auth.login',
        userId: '00000000-0000-7000-8000-000000000000',
      }),
    ).resolves.toBeUndefined();

    expect((await giris(kullanici.email)).statusCode).toBe(200);
  });
});

describe('silinen hesabın kalıcı temizliği', () => {
  it('bekleme süresi dolmuş hesabı ve verisini siliyor', async () => {
    const kullanici = await kullaniciOlustur();
    const kategori = await prisma.category.findFirstOrThrow({
      where: { userId: null },
    });
    const abonelik = await prisma.subscription.create({
      data: {
        userId: kullanici.id,
        categoryId: kategori.id,
        name: 'Silinecek',
        priceMinor: BigInt(1000),
        currency: 'TRY',
        billingCycle: 'MONTHLY',
        startDate: new Date(Date.UTC(2026, 0, 10)),
      },
    });

    // Bekleme süresi bir gün önce dolmuş.
    await prisma.user.update({
      where: { id: kullanici.id },
      data: {
        deletedAt: new Date(Date.now() - (PURGE_AFTER_DAYS + 1) * 86_400_000),
      },
    });

    const sonuc = await daily.run();
    expect(sonuc.temizlenenHesap).toBeGreaterThanOrEqual(1);

    expect(
      await prisma.user.findUnique({ where: { id: kullanici.id } }),
    ).toBeNull();
    // Abonelik ilişki üzerinden gitti.
    expect(
      await prisma.subscription.findUnique({ where: { id: abonelik.id } }),
    ).toBeNull();
  });

  it('süresi dolmamış silme talebine dokunmuyor', async () => {
    const kullanici = await kullaniciOlustur();
    await prisma.user.update({
      where: { id: kullanici.id },
      data: { deletedAt: new Date(Date.now() - 5 * 86_400_000) },
    });

    await daily.run();

    const hala = await prisma.user.findUnique({ where: { id: kullanici.id } });
    expect(hala).not.toBeNull();
  });

  it('silinmemiş hesaba dokunmuyor', async () => {
    const kullanici = await kullaniciOlustur();
    await daily.run();
    expect(
      await prisma.user.findUnique({ where: { id: kullanici.id } }),
    ).not.toBeNull();
  });
});
