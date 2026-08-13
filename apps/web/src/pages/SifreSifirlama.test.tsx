/**
 * Şifre sıfırlama akışı.
 *
 * Sunucu ucu ve e-posta aylardır hazırdı, ama **arayüzü hiç yoktu**:
 * giriş ekranında bağlantı bulunmuyordu ve postadaki adres
 * (`/sifre-sifirla?token=…`) rota olarak tanımlı değildi, yani bilinmeyen
 * yol sayılıp giriş ekranına düşüyordu. Şifresini unutan kullanıcının
 * hesabına dönmesinin hiçbir yolu yoktu.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { sorguSecenekleri } from '../lib/sorgu';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json' },
  });

interface Cagri {
  yol: string;
  govde: string | undefined;
}

/** Oturumsuz kullanıcı; `/me` 401 dönüyor. */
function sunucuKur(yanitlar: Record<string, () => Response> = {}) {
  const cagrilar: Cagri[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (girdi: string, secenekler?: { body?: string }) => {
      const yol = String(girdi).replace('/api/v1', '');
      cagrilar.push({ yol, govde: secenekler?.body });

      const uretici = yanitlar[yol];
      if (uretici !== undefined) return uretici();
      return json({ title: 'Oturum gerekli', status: 401 }, 401);
    }),
  );

  return cagrilar;
}

function ciz(adres: string) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: sorguSecenekleri })}
    >
      <MemoryRouter initialEntries={[adres]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('şifremi unuttum', () => {
  it('giriş ekranından ulaşılabiliyor', async () => {
    // Bağlantı yoksa akışın var olmasının kullanıcı için bir anlamı yok.
    sunucuKur();
    const kullanici = userEvent.setup();
    ciz('/giris');

    await kullanici.click(
      await screen.findByRole('link', { name: /şifremi unuttum/i }),
    );

    expect(
      await screen.findByRole('heading', { name: /şifreni mi unuttun/i }),
    ).toBeInTheDocument();
  });

  it('adresi gönderiyor ve kayıtlı olup olmadığını sızdırmıyor', async () => {
    /*
     * Sunucu her durumda 202 dönüyor; ekran da aynı cümleyi gösteriyor.
     * "Bu e-posta kayıtlı değil" demek, hangi adreslerin sistemde
     * olduğunu tarayarak öğrenmeyi mümkün kılardı.
     */
    const cagrilar = sunucuKur({
      '/auth/forgot-password': () => new Response(null, { status: 202 }),
    });
    const kullanici = userEvent.setup();
    ciz('/sifre-unuttum');

    await kullanici.type(
      await screen.findByLabelText('E-posta'),
      'ozge@example.com',
    );
    await kullanici.click(
      screen.getByRole('button', { name: /sıfırlama bağlantısı gönder/i }),
    );

    expect(
      await screen.findByRole('heading', { name: /postanı kontrol et/i }),
    ).toBeInTheDocument();
    expect(
      cagrilar.find((c) => c.yol === '/auth/forgot-password')?.govde,
    ).toBe(JSON.stringify({ email: 'ozge@example.com' }));
    // "Kayıtlı" ya da "bulunamadı" gibi bir ayrım ekranda geçmiyor.
    expect(screen.getByText(/kayıtlıysa/i)).toBeInTheDocument();
  });

  it('geçersiz adresi sunucuya göndermiyor', async () => {
    const cagrilar = sunucuKur();
    const kullanici = userEvent.setup();
    ciz('/sifre-unuttum');

    await kullanici.type(await screen.findByLabelText('E-posta'), 'bozuk');
    await kullanici.click(
      screen.getByRole('button', { name: /sıfırlama bağlantısı gönder/i }),
    );

    expect(cagrilar.some((c) => c.yol === '/auth/forgot-password')).toBe(false);
  });
});

describe('yeni şifre belirleme', () => {
  it('e-postadaki bağlantı çalışıyor ve şifreyi değiştiriyor', async () => {
    const cagrilar = sunucuKur({
      '/auth/reset-password': () => new Response(null, { status: 204 }),
    });
    const kullanici = userEvent.setup();
    ciz('/sifre-sifirla?token=gecerli-jeton');

    await kullanici.type(
      await screen.findByLabelText('Yeni şifre'),
      'YeniSifre!123',
    );
    await kullanici.click(
      screen.getByRole('button', { name: /şifreyi değiştir/i }),
    );

    expect(
      await screen.findByRole('heading', { name: /şifren değişti/i }),
    ).toBeInTheDocument();
    expect(cagrilar.find((c) => c.yol === '/auth/reset-password')?.govde).toBe(
      JSON.stringify({ token: 'gecerli-jeton', password: 'YeniSifre!123' }),
    );
  });

  it('oturumların kapandığını söylüyor', async () => {
    // Sunucu bütün oturumları düşürüyor; kullanıcı bunu bilmezse "neden
    // diğer cihazımdan çıktım" diye sorar.
    sunucuKur({
      '/auth/reset-password': () => new Response(null, { status: 204 }),
    });
    const kullanici = userEvent.setup();
    ciz('/sifre-sifirla?token=jeton');

    await kullanici.type(await screen.findByLabelText('Yeni şifre'), 'YeniSifre!123');
    await kullanici.click(screen.getByRole('button', { name: /şifreyi değiştir/i }));

    expect(await screen.findByText(/oturumların kapatıldı/i)).toBeInTheDocument();
  });

  it('süresi dolmuş jetonda sebebi ve çıkış yolunu gösteriyor', async () => {
    sunucuKur({
      '/auth/reset-password': () =>
        json({ title: 'Sıfırlama kodu geçersiz ya da süresi dolmuş', status: 410 }, 410),
    });
    const kullanici = userEvent.setup();
    ciz('/sifre-sifirla?token=eski');

    await kullanici.type(await screen.findByLabelText('Yeni şifre'), 'YeniSifre!123');
    await kullanici.click(screen.getByRole('button', { name: /şifreyi değiştir/i }));

    expect(await screen.findByText(/süresi dolmuş/i)).toBeInTheDocument();
    // Kullanıcı ekranda kilitli kalmıyor.
    expect(
      screen.getByRole('link', { name: /yeni bağlantı iste/i }),
    ).toBeInTheDocument();
  });

  it('jetonsuz gelindiğinde şifre sordurmuyor', async () => {
    // Boş jetonla gönderim 422 alırdı; kullanıcıya şifresini boşuna
    // yazdırmak yerine durumu baştan söylüyoruz.
    sunucuKur();
    ciz('/sifre-sifirla');

    expect(
      await screen.findByRole('heading', { name: /bağlantı eksik/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Yeni şifre')).toBeNull();
  });

  it('kısa şifreyi sunucuya göndermiyor', async () => {
    const cagrilar = sunucuKur();
    const kullanici = userEvent.setup();
    ciz('/sifre-sifirla?token=jeton');

    await kullanici.type(await screen.findByLabelText('Yeni şifre'), 'abc');
    await kullanici.click(screen.getByRole('button', { name: /şifreyi değiştir/i }));

    expect(cagrilar.some((c) => c.yol === '/auth/reset-password')).toBe(false);
  });
});
