/**
 * E-postadaki doğrulama bağlantısı.
 *
 * Bağlantı oturum istemiyor: kullanıcı postayı telefonunda açıp hesabına
 * bilgisayarından girmiş olabilir. Oturum şart olsaydı tıklayan kişi giriş
 * ekranına düşer ve doğrulama yarıda kalırdı.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { sorguSecenekleri } from '../lib/sorgu';

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function sunucuKur(yanitlar: Record<string, () => Response>) {
  const cagrilar: { yol: string; govde: string | undefined }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (girdi: string, secenekler?: { body?: string }) => {
      const yol = String(girdi).replace('/api/v1', '');
      cagrilar.push({ yol, govde: secenekler?.body });
      const uretici = yanitlar[yol];
      return uretici === undefined
        ? json({ title: 'Bulunamadı', status: 404 }, 404)
        : uretici();
    }),
  );

  return cagrilar;
}

function ciz(adres: string) {
  const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[adres]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Giriş yapmamış kullanıcı: `/me` 401 dönüyor. */
const OTURUMSUZ = () => json({ title: 'Oturum bulunamadı', status: 401 }, 401);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bağlantıyla doğrulama', () => {
  it('oturum ucunu döngüye sokmuyor', async () => {
    /*
     * Gerileme koruması. Bu sayfa `useOturum()`'u ikinci kez çağırıyor ve
     * varsayılan `retryOnMount` ile sonsuz döngü oluşuyordu: hatalı sorguya
     * yeni gözlemci bağlanınca TanStack yeniden deniyor, sorgu "beklemede"ye
     * dönüyor, uygulama tam ekran yükleme gösterip bu bileşeni söküyor, o da
     * tekrar bağlanınca aynı şey baştan başlıyordu.
     *
     * Ölçüm: 600 ms içinde 3672 istek. Sunucuyu dövecek türden bir hata ve
     * ekranda yalnızca "Yükleniyor…" olarak görünüyordu.
     */
    const cagrilar = sunucuKur({
      '/me': OTURUMSUZ,
      '/auth/verify-email': () => new Response(null, { status: 204 }),
    });

    ciz('/dogrula?token=dongu-denemesi');
    await screen.findByRole('heading', { name: /hesabın hazır/i });
    await new Promise((cozumle) => setTimeout(cozumle, 300));

    expect(cagrilar.filter((c) => c.yol === '/me').length).toBeLessThan(5);
  });

  it('giriş yapmamış kullanıcıda da çalışıyor', async () => {
    const cagrilar = sunucuKur({
      '/me': OTURUMSUZ,
      '/auth/verify-email': () => new Response(null, { status: 204 }),
    });

    ciz('/dogrula?token=postadan-gelen-kod');

    expect(
      await screen.findByRole('heading', { name: /hesabın hazır/i }),
    ).toBeInTheDocument();

    // Token adresten okunup gövdeye konuyor.
    const istek = cagrilar.find((c) => c.yol === '/auth/verify-email');
    expect(istek?.govde).toContain('postadan-gelen-kod');
  });

  it('token bir kez gönderiliyor', async () => {
    // React geliştirme modunda bileşenleri iki kez çalıştırıyor; token tek
    // kullanımlık olduğu için ikinci istek "süresi dolmuş" hatası alır ve
    // kullanıcı başarılı bir işlemi hata olarak görür.
    const cagrilar = sunucuKur({
      '/me': OTURUMSUZ,
      '/auth/verify-email': () => new Response(null, { status: 204 }),
    });

    ciz('/dogrula?token=tek-kullanimlik');
    await screen.findByRole('heading', { name: /hesabın hazır/i });

    expect(cagrilar.filter((c) => c.yol === '/auth/verify-email')).toHaveLength(1);
  });

  it('süresi dolmuş bağlantıda ne yapacağını söylüyor', async () => {
    sunucuKur({
      '/me': OTURUMSUZ,
      '/auth/verify-email': () =>
        json(
          { title: 'Doğrulama bağlantısı geçersiz ya da süresi dolmuş', status: 410 },
          410,
        ),
    });

    ciz('/dogrula?token=eski');

    expect(
      await screen.findByRole('heading', { name: /doğrulanamadı/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/yeni bir kod isteyebilirsin/i)).toBeInTheDocument();
  });

  it('token yoksa doğrulama isteği atmıyor', async () => {
    const cagrilar = sunucuKur({ '/me': OTURUMSUZ });

    ciz('/dogrula');

    expect(
      await screen.findByRole('heading', { name: /bağlantı eksik/i }),
    ).toBeInTheDocument();
    expect(cagrilar.some((c) => c.yol === '/auth/verify-email')).toBe(false);
  });

  it('girişteyken de bağlantı çalışıyor', async () => {
    // Doğrulanmamış kullanıcı normalde doğrulama ekranını görüyor; bağlantı
    // o ekranı geçip doğrudan işi yapmalı.
    sunucuKur({
      '/me': () =>
        json({
          id: 'k',
          email: 'a@b.co',
          name: 'X',
          currency: 'TRY',
          emailVerifiedAt: null,
        }),
      '/auth/verify-email': () => new Response(null, { status: 204 }),
    });

    ciz('/dogrula?token=gecerli');

    expect(
      await screen.findByRole('heading', { name: /hesabın hazır/i }),
    ).toBeInTheDocument();
  });
});
