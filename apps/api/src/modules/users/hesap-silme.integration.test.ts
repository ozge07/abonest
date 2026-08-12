/**
 * Hesap silme ve geri getirme.
 *
 * Bu akışın hiç testi yoktu — `DELETE /me` yazılmıştı ama uçtan uca bir
 * kez bile sınanmamıştı. Eksik pahalıya patladı: kullanıcı yeni "Hesabım"
 * ekranında kendi hesabını sildi ve geri giremedi. Giriş "E-posta ya da
 * şifre hatalı" diyordu; kullanıcı şifresini yanlış hatırladığını sandı,
 * oysa hesap silinmişti. Geri getirmenin uygulama içinde hiçbir yolu yoktu.
 *
 * Buradaki iddiaların ekseni: **silme geri alınabilir olmalı, ama yalnızca
 * hesabın sahibi tarafından ve yalnızca söz verilen süre içinde.**
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
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { PURGE_AFTER_DAYS } from './purge.js';

const KOK = '/api/v1';
const SIFRE = 'CokGuclu!Parola123';

let app: NestFastifyApplication;
let prisma: PrismaService;
let passwords: PasswordService;
let sessions: SessionService;

const olusturulanKullanicilar: string[] = [];

async function kullaniciOlustur() {
  const eposta = `silme-${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email: eposta,
      passwordHash: await passwords.hash(SIFRE),
      name: 'Test',
      currency: 'TRY',
      emailVerifiedAt: new Date(),
    },
  });
  olusturulanKullanicilar.push(user.id);
  return { id: user.id, email: eposta };
}

/** Oturum, giriş ucundan geçmeden açılıyor: uç dakikada on istekle sınırlı. */
async function oturumAc(userId: string): Promise<string> {
  const { token } = await sessions.create(userId, {});
  return token;
}

async function istek(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  jeton?: string,
  govde?: unknown,
) {
  const yanit = await app.inject({
    method,
    url: `${KOK}${url}`,
    headers: {
      ...(jeton !== undefined ? { authorization: `Bearer ${jeton}` } : {}),
      ...(govde !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(govde !== undefined ? { payload: JSON.stringify(govde) } : {}),
  });
  return {
    kod: yanit.statusCode,
    govde: yanit.body === '' ? null : (JSON.parse(yanit.body) as never),
  };
}

/** Gerçekten giriş ucundan geçiyor: sınanan şey girişin kendisi. */
async function giris(email: string, sifre = SIFRE) {
  return istek('POST', '/auth/login', undefined, { email, password: sifre });
}

/** Hesabı `gun` gün önce silinmiş gibi gösteriyor. */
async function silinmeTarihiniGeriAl(userId: string, gun: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(Date.now() - gun * 86_400_000) },
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

describe('hesap silme', () => {
  it('silinen hesabın oturumları anında düşüyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await oturumAc(kullanici.id);

    const silme = await istek('DELETE', '/me', jeton);
    expect(silme.kod).toBe(202);
    expect((silme.govde as { purgeAt: string }).purgeAt).toBeTruthy();

    // Silinmiş hesabın açık oturumu kalmamalı.
    expect((await istek('GET', '/me', jeton)).kod).toBe(401);
  });

  it('kullanıcıya söylenen tarih gerçek temizlik süresiyle aynı', async () => {
    // Ekranda "30 gün" yazıp 7 gün sonra silmek verilen sözü bozardı.
    const kullanici = await kullaniciOlustur();
    const jeton = await oturumAc(kullanici.id);

    const { govde } = await istek('DELETE', '/me', jeton);
    const purgeAt = new Date((govde as { purgeAt: string }).purgeAt);
    const gun = Math.round((purgeAt.getTime() - Date.now()) / 86_400_000);

    expect(gun).toBe(PURGE_AFTER_DAYS);
  });

  it('veriler silinmiyor, sadece işaretleniyor', async () => {
    const kullanici = await kullaniciOlustur();
    await istek('DELETE', '/me', await oturumAc(kullanici.id));

    const satir = await prisma.user.findUnique({ where: { id: kullanici.id } });
    expect(satir).not.toBeNull();
    expect(satir?.deletedAt).not.toBeNull();
  });
});

describe('silmeyi geri alma', () => {
  it('doğru şifreyle giriş hesabı geri getiriyor', async () => {
    const kullanici = await kullaniciOlustur();
    await istek('DELETE', '/me', await oturumAc(kullanici.id));

    const yanit = await giris(kullanici.email);
    expect(yanit.kod).toBe(200);
    expect((yanit.govde as { restored: boolean }).restored).toBe(true);

    // Hesap gerçekten açık: yeni oturumla veri okunabiliyor.
    const jeton = (yanit.govde as { token: string }).token;
    expect((await istek('GET', '/me', jeton)).kod).toBe(200);

    const satir = await prisma.user.findUnique({ where: { id: kullanici.id } });
    expect(satir?.deletedAt).toBeNull();
  });

  it('yanlış şifre hesabı geri getirmiyor', async () => {
    /*
     * En önemli iddia. Geri getirme, şifre doğrulanmadan **önce**
     * yapılsaydı, bir e-posta adresi bilen herkes başkasının silme
     * kararını iptal edebilirdi.
     */
    const kullanici = await kullaniciOlustur();
    await istek('DELETE', '/me', await oturumAc(kullanici.id));

    const yanit = await giris(kullanici.email, 'YanlisSifre!123');
    expect(yanit.kod).toBe(401);

    const satir = await prisma.user.findUnique({ where: { id: kullanici.id } });
    expect(satir?.deletedAt).not.toBeNull();
  });

  it('süre dolduktan sonra doğru şifre bile geri getirmiyor', async () => {
    // "30 gün sonra kalıcı olarak silinecek" sözünün karşılığı: o günden
    // sonra kayıt temizlik sırasını bekliyor, diriltilmiyor.
    const kullanici = await kullaniciOlustur();
    await istek('DELETE', '/me', await oturumAc(kullanici.id));
    await silinmeTarihiniGeriAl(kullanici.id, PURGE_AFTER_DAYS + 1);

    const yanit = await giris(kullanici.email);
    expect(yanit.kod).toBe(401);

    const satir = await prisma.user.findUnique({ where: { id: kullanici.id } });
    expect(satir?.deletedAt).not.toBeNull();
  });

  it('sürenin son gününde hâlâ geri getirilebiliyor', async () => {
    // Sınırda kapanan bir pencere, kullanıcıya söylenen süreden kısa olurdu.
    const kullanici = await kullaniciOlustur();
    await istek('DELETE', '/me', await oturumAc(kullanici.id));
    await silinmeTarihiniGeriAl(kullanici.id, PURGE_AFTER_DAYS - 1);

    const yanit = await giris(kullanici.email);
    expect(yanit.kod).toBe(200);
    expect((yanit.govde as { restored: boolean }).restored).toBe(true);
  });

  it('abonelikler ve geçmiş olduğu gibi geri geliyor', async () => {
    const kullanici = await kullaniciOlustur();
    const jeton = await oturumAc(kullanici.id);
    const kategori = await prisma.category.findFirstOrThrow({
      where: { userId: null },
    });

    const eklendi = await istek('POST', '/subscriptions', jeton, {
      name: 'Netflix',
      categoryId: kategori.id,
      priceMinor: 22_999,
      currency: 'TRY',
      billingCycle: 'MONTHLY',
      startDate: '2026-08-01',
    });
    expect(eklendi.kod).toBe(201);

    await istek('DELETE', '/me', jeton);
    const yeniJeton = (
      (await giris(kullanici.email)).govde as { token: string }
    ).token;

    const liste = await istek('GET', '/subscriptions', yeniJeton);
    const abonelikler = (liste.govde as { data: { name: string }[] }).data;
    expect(abonelikler).toHaveLength(1);
    expect(abonelikler[0]?.name).toBe('Netflix');
  });

  it('geri getirme denetim kaydına yazılıyor', async () => {
    // Hesabın diriltildiği, sonradan bakan biri için görünür olmalı.
    const kullanici = await kullaniciOlustur();
    await istek('DELETE', '/me', await oturumAc(kullanici.id));
    await giris(kullanici.email);

    const kayit = await prisma.auditLog.findFirst({
      where: { userId: kullanici.id, action: 'account.restored' },
    });
    expect(kayit).not.toBeNull();
  });

  it('sıradan giriş geri getirme bildirmiyor', async () => {
    // `restored` her girişte `true` olsaydı arayüz herkese "hesabın geri
    // geldi" derdi.
    const kullanici = await kullaniciOlustur();

    const yanit = await giris(kullanici.email);
    expect(yanit.kod).toBe(200);
    expect((yanit.govde as { restored: boolean }).restored).toBe(false);
  });
});
