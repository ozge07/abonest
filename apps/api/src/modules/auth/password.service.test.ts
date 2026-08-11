import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('doğru şifreyi kabul, yanlışı reddediyor', async () => {
    const hash = await passwords.hash('dogru-parola-123456');

    expect(await passwords.verify(hash, 'dogru-parola-123456')).toBe(true);
    expect(await passwords.verify(hash, 'dogru-parola-12345')).toBe(false);
  });

  it('argon2id kullanıyor', async () => {
    // Özet biçimi algoritmayı içeriyor. argon2i ya da argon2d'ye kayarsak
    // (biri yan kanal, diğeri GPU direnci açısından zayıf) bu test düşer.
    const hash = await passwords.hash('parola-123456789');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('aynı şifre için her seferinde farklı özet üretiyor', async () => {
    // Tuz rastgele olmasaydı, iki kullanıcının aynı şifresi aynı özeti
    // verirdi ve veritabanına bakan biri bunu görebilirdi.
    const a = await passwords.hash('ayni-parola-12345');
    const b = await passwords.hash('ayni-parola-12345');

    expect(a).not.toBe(b);
    expect(await passwords.verify(a, 'ayni-parola-12345')).toBe(true);
    expect(await passwords.verify(b, 'ayni-parola-12345')).toBe(true);
  });

  it('bozuk özette çökmüyor, sadece false dönüyor', async () => {
    // Tek bir bozuk kayıt, giriş ucunu 500 döndürür hâle getirmemeli.
    expect(await passwords.verify('bu-bir-ozet-degil', 'parola')).toBe(false);
    expect(await passwords.verify('', 'parola')).toBe(false);
  });

  it('uzun şifreyi kırpmadan işliyor', async () => {
    // bcrypt 72 baytta kırpar ve iki farklı uzun şifre aynı sayılırdı.
    // Argon2'de böyle bir sınır yok; bu testi bcrypt'e dönülürse yakalar.
    const uzun = 'a'.repeat(100);
    const hash = await passwords.hash(uzun + 'SON');

    expect(await passwords.verify(hash, uzun + 'SON')).toBe(true);
    expect(await passwords.verify(hash, uzun + 'BASKA')).toBe(false);
  });
});

describe('TokenService', () => {
  const tokens = new TokenService();

  it('her çağrıda farklı token üretiyor', () => {
    const uretilen = new Set(
      Array.from({ length: 200 }, () => tokens.generate().token),
    );
    expect(uretilen.size).toBe(200);
  });

  it('token yeterince uzun', () => {
    // 32 bayt → base64url'de 43 karakter. Kısalırsa tahmin edilebilir olur.
    expect(tokens.generate().token.length).toBeGreaterThanOrEqual(43);
  });

  it('özet deterministik ve ham token’dan farklı', () => {
    const { token, hash } = tokens.generate();

    expect(tokens.hash(token)).toBe(hash);
    // Veritabanına yazılan değer ham token olmamalı; olsaydı sızıntıda
    // doğrudan oturum açılabilirdi.
    expect(hash).not.toBe(token);
  });

  it('safeEqual eşitleri kabul, farklıları reddediyor', () => {
    expect(tokens.safeEqual('abc123', 'abc123')).toBe(true);
    expect(tokens.safeEqual('abc123', 'abc124')).toBe(false);
    // Farklı uzunlukta çökmemeli: timingSafeEqual eşit uzunluk istiyor.
    expect(tokens.safeEqual('kisa', 'cok-daha-uzun-deger')).toBe(false);
    expect(tokens.safeEqual('', '')).toBe(true);
  });
});
