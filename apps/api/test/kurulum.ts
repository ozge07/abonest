/**
 * Test veritabanını hazırlıyor (vitest `globalSetup`).
 *
 * Yoksa oluşturuyor, şemayı uyguluyor ve başlangıç verisini yüklüyor.
 * "Önce şu üç komutu çalıştır" demek yerine kendi kendine hazırlanıyor:
 * kurulum adımı unutulduğunda testler anlaşılmaz bir hatayla düşerdi.
 *
 * Şema zaten güncelse `migrate deploy` hiçbir şey yapmıyor ve tohumlama
 * idempotent; yani ilk turdan sonrası birkaç yüz milisaniye.
 */

import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { Client } from 'pg';
import { bakimUrl, testVeritabaniUrl, veritabaniAdi } from './veritabani.js';

export default async function kurulum(): Promise<void> {
  config();

  const gelistirme = process.env['DATABASE_URL'];
  if (gelistirme === undefined) {
    throw new Error('DATABASE_URL tanımlı değil; testler koşamaz.');
  }

  const url = process.env['TEST_DATABASE_URL'] ?? testVeritabaniUrl(gelistirme);
  const ad = veritabaniAdi(url);

  await veritabaniniOlustur(gelistirme, ad);

  const ortam = { ...process.env, DATABASE_URL: url };
  const calistir = (komut: string, argumanlar: string[]) =>
    execFileSync(komut, argumanlar, { env: ortam, stdio: 'pipe' });

  calistir('npx', ['prisma', 'migrate', 'deploy']);
  // Tohumlama `package.json`'daki komutun aynısı: iki yerde ayrı çalıştırma
  // biçimi tutmak, birinin diğerinden habersiz bozulması demek.
  calistir(process.execPath, ['--experimental-strip-types', 'prisma/seed.ts']);

  // Test süreçleri bu değeri devralıyor; `dotenv` zaten tanımlı değişkenin
  // üstüne yazmadığı için testlerdeki `import 'dotenv/config'` bunu bozmuyor.
  process.env['DATABASE_URL'] = url;
}

async function veritabaniniOlustur(
  kaynakUrl: string,
  ad: string,
): Promise<void> {
  const bakim = new Client({ connectionString: bakimUrl(kaynakUrl) });
  await bakim.connect();
  try {
    const varMi = await bakim.query(
      'select 1 from pg_database where datname = $1',
      [ad],
    );
    if (varMi.rowCount === 0) {
      // Ad kullanıcıdan değil, kendi türettiğimiz addan geliyor; yine de
      // tanımlayıcı olarak tırnaklanıyor.
      await bakim.query(`create database "${ad.replace(/"/g, '""')}"`);
      console.log(`Test veritabanı oluşturuldu: ${ad}`);
    }
  } finally {
    await bakim.end();
  }
}
