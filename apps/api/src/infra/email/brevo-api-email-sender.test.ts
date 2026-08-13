/**
 * Brevo HTTP göndericisi.
 *
 * Bu gönderici yayında SMTP'nin çalışmaması üzerine eklendi: barındırma
 * platformu giden SMTP portlarını kapatıyor ve bağlantı `ETIMEDOUT` ile
 * düşüyor. Buradaki testler ağa çıkmıyor; `fetch` taklit ediliyor.
 */

import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrevoApiEmailSender,
  ayrisGonderen,
} from './brevo-api-email-sender.js';

const logger = pino({ level: 'silent' });

function gonderici(from = 'Abonest <posta@ornek.com>') {
  return new BrevoApiEmailSender({ apiKey: 'xkeysib-test', from }, logger);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gönderen ayrıştırma', () => {
  it('"Ad <adres>" biçimini ikiye ayırıyor', () => {
    // Brevo ad ile adresi ayrı alanlarda istiyor; düz metin gönderince
    // "sender not valid" diyor.
    expect(ayrisGonderen('Abonest <posta@ornek.com>')).toEqual({
      name: 'Abonest',
      email: 'posta@ornek.com',
    });
  });

  it('düz adresi olduğu gibi bırakıyor', () => {
    expect(ayrisGonderen('posta@ornek.com')).toEqual({
      email: 'posta@ornek.com',
    });
  });

  it('tırnaklı adı temizliyor', () => {
    expect(ayrisGonderen('"Abonest Bildirim" <posta@ornek.com>')).toEqual({
      name: 'Abonest Bildirim',
      email: 'posta@ornek.com',
    });
  });

  it('boş adı alan olarak göndermiyor', () => {
    // `name: ''` gönderirsek Brevo gönderen adını boş yazıyor.
    expect(ayrisGonderen('   <posta@ornek.com>')).toEqual({
      email: 'posta@ornek.com',
    });
  });
});

describe('gönderim', () => {
  it('Brevo\'nun beklediği gövdeyi kuruyor', async () => {
    const cagrilar: { url: string; secenekler: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, secenekler: RequestInit) => {
        cagrilar.push({ url, secenekler });
        return new Response(JSON.stringify({ messageId: '<abc>' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    await gonderici().send({
      to: 'alici@ornek.com',
      subject: 'Konu',
      text: 'Gövde',
    });

    const { url, secenekler } = cagrilar[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((secenekler.headers as Record<string, string>)['api-key']).toBe(
      'xkeysib-test',
    );
    expect(JSON.parse(secenekler.body as string)).toEqual({
      sender: { name: 'Abonest', email: 'posta@ornek.com' },
      to: [{ email: 'alici@ornek.com' }],
      subject: 'Konu',
      textContent: 'Gövde',
    });
  });

  it('yanıt adresi verilmişse gövdeye giriyor', async () => {
    // Verilmezse yanıtlar gönderen adrese, yani uygulamayı çalıştıran
    // kişinin özel kutusuna gidiyor.
    const cagrilar: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, secenekler: RequestInit) => {
        cagrilar.push(secenekler);
        return new Response(JSON.stringify({ messageId: '<a>' }), {
          status: 201,
        });
      }),
    );

    const gonderen = new BrevoApiEmailSender(
      {
        apiKey: 'k',
        from: 'Abonest <posta@ornek.com>',
        replyTo: 'Destek <destek@ornek.com>',
      },
      logger,
    );
    await gonderen.send({ to: 'a@b.com', subject: 'K', text: 'G' });

    expect(JSON.parse(cagrilar[0]!.body as string).replyTo).toEqual({
      name: 'Destek',
      email: 'destek@ornek.com',
    });
  });

  it('yanıt adresi yoksa alan hiç gönderilmiyor', async () => {
    const cagrilar: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, secenekler: RequestInit) => {
        cagrilar.push(secenekler);
        return new Response(JSON.stringify({ messageId: '<a>' }), {
          status: 201,
        });
      }),
    );

    await gonderici().send({ to: 'a@b.com', subject: 'K', text: 'G' });

    expect(JSON.parse(cagrilar[0]!.body as string)).not.toHaveProperty(
      'replyTo',
    );
  });

  it('reddedilen gönderimde sebebi hataya taşıyor', async () => {
    /*
     * Sessizce başarılı sayılamaz: çağıran taraf (kayıt akışı) hatayı
     * görmezse kullanıcıya "e-posta gönderildi" der ve kullanıcı olmayan
     * bir postayı bekler. Sebep de mesajda olmalı — "sender not valid"
     * cümlesi olmadan hata ayıklamak körlemesine deneme oluyor.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'sender not valid' }), {
            status: 400,
          }),
      ),
    );

    await expect(
      gonderici().send({ to: 'a@b.com', subject: 'K', text: 'G' }),
    ).rejects.toThrow(/sender not valid/);
  });

  it('anahtar hata mesajına sızmıyor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('reddedildi', { status: 401 })),
    );

    const hata = await gonderici()
      .send({ to: 'a@b.com', subject: 'K', text: 'G' })
      .catch((e: Error) => e);

    expect(String(hata)).not.toContain('xkeysib-test');
  });

  it('anahtar geçersizse doğrulama çökmüyor, false dönüyor', async () => {
    // Açılışta çağrılıyor: e-posta dışındaki her şey çalışmaya devam etmeli.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('yok', { status: 401 })),
    );

    await expect(gonderici().dogrulaBaglanti()).resolves.toBe(false);
  });

  it('ağ hatasında da çökmüyor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ağ yok');
      }),
    );

    await expect(gonderici().dogrulaBaglanti()).resolves.toBe(false);
  });
});
