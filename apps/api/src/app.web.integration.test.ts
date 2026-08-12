/**
 * Arayüzün aynı origin'den sunulması.
 *
 * Bu davranış üretimde kimlik akışının temeli: oturum cookie'si
 * `SameSite=Lax` ve arayüz ayrı bir alan adında olsaydı yazma isteklerinde
 * gönderilmezdi. Sessizce bozulabilecek türden bir ayar — statik eklentinin
 * bir seçeneği değişse hiçbir test kırılmazsa kimse fark etmez.
 *
 * Gerçek `apps/web/dist` yerine geçici bir klasör kullanılıyor: test arayüzün
 * derlenmiş olmasına bağlı olmamalı.
 */

import 'dotenv/config';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

const KOK = '/api/v1';
const HTML = '<!doctype html><title>Abonest</title><div id="root"></div>';

let app: NestFastifyApplication;
let webRoot: string;

beforeAll(async () => {
  webRoot = mkdtempSync(join(tmpdir(), 'web-dist-'));
  writeFileSync(join(webRoot, 'index.html'), HTML);
  mkdirSync(join(webRoot, 'assets'));
  writeFileSync(join(webRoot, 'assets', 'index-abcd1234.js'), 'console.log(1)');

  const modul = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modul.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  );
  await configureApp(app, pino({ level: 'silent' }), { webRoot });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
  rmSync(webRoot, { recursive: true, force: true });
});

const sayfa = (url: string) =>
  app.inject({ method: 'GET', url, headers: { accept: 'text/html' } });

describe('arayüz aynı origin\'den', () => {
  it('kök adres arayüzü veriyor', async () => {
    const yanit = await sayfa('/');
    expect(yanit.statusCode).toBe(200);
    expect(yanit.body).toContain('id="root"');
  });

  it('istemci tarafı yolları index.html\'e düşüyor', async () => {
    // `/abonelikler` sunucuda bir dosya değil; yönlendirme tarayıcıda.
    for (const yol of ['/abonelikler', '/analiz', '/giris', '/derin/bir/yol']) {
      const yanit = await sayfa(yol);
      expect(yanit.statusCode).toBe(200);
      expect(yanit.body).toContain('id="root"');
    }
  });

  it('varlıkları sunuyor', async () => {
    const yanit = await app.inject({
      method: 'GET',
      url: '/assets/index-abcd1234.js',
    });
    expect(yanit.statusCode).toBe(200);
    expect(yanit.body).toContain('console.log');
  });
});

describe('API yolları arayüze karışmıyor', () => {
  it('olmayan API ucu JSON 404 dönüyor, HTML değil', async () => {
    // Bu ayrım kritik: HTML dönseydi istemci "JSON bekliyordum" diye
    // anlaşılmaz bir hata verirdi ve sorun API'de sanılırdı.
    const yanit = await app.inject({
      method: 'GET',
      url: `${KOK}/boyle-bir-uc-yok`,
      headers: { accept: 'text/html' },
    });

    expect(yanit.statusCode).toBe(404);
    expect(yanit.body).not.toContain('id="root"');
    expect(JSON.parse(yanit.body)).toMatchObject({ status: 404 });
  });

  it('gerçek API ucu arayüze düşmüyor', async () => {
    const yanit = await app.inject({
      method: 'GET',
      url: `${KOK}/subscriptions`,
      headers: { accept: 'text/html' },
    });
    expect(yanit.statusCode).toBe(401);
  });

  it('sağlık uçları arayüze düşmüyor', async () => {
    expect((await sayfa('/health')).statusCode).toBe(200);
    expect((await sayfa('/ready')).statusCode).toBe(200);
  });

  it('GET olmayan istekler arayüze düşmüyor', async () => {
    // Bir POST'un HTML alması, hatalı istemci kodunu gizlerdi.
    const yanit = await app.inject({
      method: 'POST',
      url: '/olmayan-yol',
      headers: { accept: 'text/html' },
    });
    expect(yanit.statusCode).toBe(404);
    expect(yanit.body).not.toContain('id="root"');
  });
});

describe('başlıklar', () => {
  it('arayüz sayfası kendi kaynaklarını yükleyebiliyor', async () => {
    // API'nin `default-src 'none'` politikası sayfaya uygulansaydı arayüz
    // kendi betiğini yükleyemez, ekran bomboş açılırdı.
    const yanit = await sayfa('/');
    const csp = yanit.headers['content-security-policy'];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("default-src 'none'");
  });

  it('API yanıtı en dar politikada kalıyor', async () => {
    const yanit = await app.inject({ method: 'GET', url: `${KOK}/subscriptions` });
    expect(yanit.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
  });

  it('içerik özetli varlıklar kalıcı, index.html değil', async () => {
    // index.html önbelleğe alınsaydı yeni sürüm kullanıcıya hiç ulaşmazdı.
    const varlik = await app.inject({
      method: 'GET',
      url: '/assets/index-abcd1234.js',
    });
    expect(varlik.headers['cache-control']).toContain('immutable');

    const html = await sayfa('/');
    expect(html.headers['cache-control']).toBe('no-cache');
  });
});
