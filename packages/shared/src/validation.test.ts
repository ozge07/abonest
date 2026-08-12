import { describe, expect, it } from 'vitest';
import {
  AD_MIN,
  adAlani,
  alanHatasi,
  epostaAlani,
  SIFRE_MIN,
  sifreAlani,
} from './validation.js';

describe('şifre kuralı', () => {
  it(`${SIFRE_MIN} karakteri kabul ediyor`, () => {
    expect(alanHatasi(sifreAlani, 'abc123')).toBeUndefined();
  });

  it(`${SIFRE_MIN - 1} karakteri reddediyor`, () => {
    expect(alanHatasi(sifreAlani, 'abc12')).toContain(String(SIFRE_MIN));
  });

  it('çok uzun şifreyi reddediyor', () => {
    // Üst sınır bir DoS önlemi: Argon2 girdiyi bellekte işliyor.
    expect(alanHatasi(sifreAlani, 'a'.repeat(201))).toBeDefined();
  });
});

describe('ad kuralı', () => {
  it(`${AD_MIN} harfi kabul ediyor`, () => {
    expect(alanHatasi(adAlani, 'Ali')).toBeUndefined();
  });

  it(`${AD_MIN - 1} harfi reddediyor`, () => {
    expect(alanHatasi(adAlani, 'Al')).toContain(String(AD_MIN));
  });

  it('baştaki ve sondaki boşluğu saymıyor', () => {
    // "  Al  " üç karakter gibi görünüp değil.
    expect(alanHatasi(adAlani, '  Al  ')).toBeDefined();
    expect(alanHatasi(adAlani, '  Ali  ')).toBeUndefined();
  });
});

describe('e-posta kuralı', () => {
  it('geçerli adresleri kabul ediyor', () => {
    for (const adres of [
      'a@b.co',
      'ozge.demir@example.com',
      'kullanici+etiket@alt.alan.example',
    ]) {
      expect(alanHatasi(epostaAlani, adres)).toBeUndefined();
    }
  });

  it('geçersiz adresleri reddediyor', () => {
    for (const adres of ['', 'abc', 'a@', '@b.com', 'a b@c.com', 'a@b']) {
      expect(alanHatasi(epostaAlani, adres)).toBeDefined();
    }
  });

  it('yazarken geçerli hâle gelince hata kayboluyor', () => {
    // Arayüzün dayandığı davranış: kullanıcı adresi tamamladığı anda
    // kırmızı çerçeve gitmeli.
    expect(alanHatasi(epostaAlani, 'ozge@')).toBeDefined();
    expect(alanHatasi(epostaAlani, 'ozge@example')).toBeDefined();
    expect(alanHatasi(epostaAlani, 'ozge@example.com')).toBeUndefined();
  });
});
