import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

/**
 * Yapılandırma doğrulaması bir güvenlik ve işletim garantisi:
 * eksik ortam değişkeniyle açılan bir süreç, hatayı ilk isteğe kadar saklar ve
 * deploy "başarılı" görünür. Bu testler o garantiyi koruyor.
 */
const gecerli = {
  DATABASE_URL: 'postgresql://u@localhost:5432/db',
  SESSION_SECRET: 'a'.repeat(32),
  CRON_SECRET: 'b'.repeat(32),
};

describe('loadConfig', () => {
  it('geçerli ortamda varsayılanlarla birlikte yapılandırma döner', () => {
    const config = loadConfig(gecerli);

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.WEB_ORIGIN).toBe('http://localhost:5173');
  });

  it('DATABASE_URL eksikse hata veriyor', () => {
    const { DATABASE_URL: _, ...eksik } = gecerli;
    expect(() => loadConfig(eksik)).toThrow(/DATABASE_URL/);
  });

  it('kısa SESSION_SECRET reddediliyor', () => {
    // 32 karakterin altı kaba kuvvetle bulunabilir.
    expect(() =>
      loadConfig({ ...gecerli, SESSION_SECRET: 'kisa' }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('eksik değişkenlerin hepsini tek seferde bildiriyor', () => {
    // Teker teker bildirmek, her düzeltmede yeniden başlatmayı gerektirir.
    try {
      loadConfig({});
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      const mesaj = (error as Error).message;
      expect(mesaj).toContain('DATABASE_URL');
      expect(mesaj).toContain('SESSION_SECRET');
      expect(mesaj).toContain('CRON_SECRET');
    }
  });

  it('hata mesajı sır değerlerini yazmıyor', () => {
    // Log'a düşen bir hata mesajı sırrı sızdırmamalı.
    try {
      loadConfig({ ...gecerli, SESSION_SECRET: 'gizli-ama-kisa' });
      expect.unreachable('hata bekleniyordu');
    } catch (error) {
      expect((error as Error).message).not.toContain('gizli-ama-kisa');
    }
  });

  it('geçersiz PORT değerini reddediyor', () => {
    expect(() => loadConfig({ ...gecerli, PORT: 'abc' })).toThrow(/PORT/);
  });
});

describe('üretim yapılandırması', () => {
  /**
   * Bu blokta sınananların hepsi "çalışır ama güvensiz" kategorisinde:
   * uygulama ayağa kalkar, testler geçer, sorun ancak birileri istismar
   * edince görünür. Açılışta çökmek tek güvenilir savunma.
   */
  const uretim = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://a:b@localhost:5432/c',
    WEB_ORIGIN: 'https://abonelik.example',
    SESSION_SECRET: 'x'.repeat(40),
    CRON_SECRET: 'z'.repeat(40),
  } as NodeJS.ProcessEnv;

  it('sağlam yapılandırmayı kabul ediyor', () => {
    expect(() => loadConfig(uretim)).not.toThrow();
  });

  it('.env.example\'daki örnek sırlarla açılmıyor', () => {
    // Bu değerler depoda açıkta duruyor; kopyala-yapıştırla üretime
    // taşınırsa oturum imzası herkesin bildiği bir değer olur.
    expect(() =>
      loadConfig({
        ...uretim,
        SESSION_SECRET: 'degistir-en-az-32-karakter-olmali-1234',
      }),
    ).toThrow(/örnek değer/);

    expect(() =>
      loadConfig({
        ...uretim,
        CRON_SECRET: 'degistir-en-az-32-karakter-olmali-5678',
      }),
    ).toThrow(/örnek değer/);
  });

  it('iki sır aynıysa açılmıyor', () => {
    // Aynı olmaları, birinin sızmasının diğerini de vermesi demek.
    const ayni = 'q'.repeat(40);
    expect(() =>
      loadConfig({ ...uretim, SESSION_SECRET: ayni, CRON_SECRET: ayni }),
    ).toThrow(/ayrı olmalı/);
  });

  it('WEB_ORIGIN https değilse açılmıyor', () => {
    // Cookie üretimde `Secure` bayrağıyla gönderiliyor; http origin'de
    // tarayıcı onu hiç göndermez ve giriş sessizce çalışmaz.
    expect(() =>
      loadConfig({ ...uretim, WEB_ORIGIN: 'http://abonelik.example' }),
    ).toThrow(/https/);
  });

  it('geliştirmede bu kurallar uygulanmıyor', () => {
    // Yerelde http ve basit sırlar normal; kuralı oraya taşımak
    // geliştirmeyi zorlaştırırdı, güvenliği artırmazdı.
    expect(() =>
      loadConfig({
        ...uretim,
        NODE_ENV: 'development',
        WEB_ORIGIN: 'http://localhost:5173',
        SESSION_SECRET: 'degistir-en-az-32-karakter-olmali-1234',
      }),
    ).not.toThrow();
  });
});
