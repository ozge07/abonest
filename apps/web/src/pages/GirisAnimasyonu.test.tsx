/**
 * Girişten sonraki geçiş animasyonu.
 *
 * Sınanan şey görüntü değil **sıra ve zamanlama**: yörünge önce hafifçe
 * büyüyor, sonra merkeze toplanıyor ve en sonda uygulama açılıyor. Bu sıra
 * bozulursa animasyon yarıda kesiliyor — nitekim ilk uygulamada tam da bu
 * oluyordu: giriş başarılı olur olmaz sorgular tazeleniyor, giriş ekranı
 * sökülüyor ve animasyon hiç görünmüyordu.
 *
 * Görünümün kendisi (renkler, gölgeler) burada sınanmıyor; jsdom düzen ve
 * boyama hesaplamıyor, o taraf tarayıcıda ekran görüntüsüyle bakılıyor.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { sorguSecenekleri } from '../lib/sorgu';

const KULLANICI = {
  id: 'k1',
  email: 'ozge@example.com',
  name: 'Özge',
  currency: 'TRY',
  emailVerifiedAt: '2026-08-01T00:00:00.000Z',
};

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function sunucuKur() {
  let girisli = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (girdi: string) => {
      const yol = String(girdi).replace('/api/v1', '');
      if (yol === '/auth/login') {
        girisli = true;
        return json({ token: 'j', expiresAt: '2026-09-01', restored: false });
      }
      if (!girisli) return json({ title: 'Oturum gerekli', status: 401 }, 401);
      if (yol === '/me') return json(KULLANICI);
      if (yol === '/me/sessions') return json([]);
      if (yol === '/dashboard') {
        return json({
          activeCount: 1,
          totals: [],
          upcoming: [],
          byCategory: [],
          cancelledThisMonth: 0,
        });
      }
      return json({ data: [], nextCursor: null, hasMore: false });
    }),
  );
}

/** Hareket tercihini testin kontrolüne veriyor. */
function hareketTercihi(azaltilsin: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: azaltilsin,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

async function girisYap() {
  const kullanici = userEvent.setup();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: sorguSecenekleri })}
    >
      <MemoryRouter initialEntries={['/giris']}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await kullanici.type(await screen.findByLabelText('E-posta'), KULLANICI.email);
  await kullanici.type(screen.getByLabelText('Şifre'), 'CokGuclu!Parola123');
  await kullanici.click(screen.getByRole('button', { name: 'Giriş yap' }));
}

function kimlik() {
  return document.querySelector('.kimlik');
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('giriş geçişi sırası', () => {
  it('giriş öncesi kimlik ekranı dinleniyor', async () => {
    hareketTercihi(false);
    sunucuKur();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: sorguSecenekleri })}
      >
        <MemoryRouter initialEntries={['/giris']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByLabelText('E-posta');
    expect(kimlik()).toHaveClass('kimlik-dinlenme');
  });

  it('girişten sonra hızlanma → toplanma sırasını izliyor', async () => {
    hareketTercihi(false);
    sunucuKur();
    await girisYap();

    await waitFor(() => expect(kimlik()).toHaveClass('kimlik-hizlanma'));
    await waitFor(() => expect(kimlik()).toHaveClass('kimlik-toplanma'), {
      timeout: 2000,
    });
  });

  it('toplanma sırasında ışık patlaması çıkıyor', async () => {
    hareketTercihi(false);
    sunucuKur();
    await girisYap();

    await waitFor(
      () => expect(document.querySelector('.giris-isigi')).not.toBeNull(),
      { timeout: 3000 },
    );
  });

  it('uygulama animasyon bitmeden açılmıyor', async () => {
    /*
     * Asıl regresyon bu. Giriş başarılı olur olmaz sorgular tazelenirse
     * giriş ekranı sökülüyor ve animasyon hiç görünmüyor.
     */
    hareketTercihi(false);
    sunucuKur();
    await girisYap();

    // Hızlanma sürerken hikâye hâlâ kapalı.
    await waitFor(() => expect(kimlik()).toHaveClass('kimlik-hizlanma'));
    expect(screen.queryByRole('link', { name: 'Aboneliklerime git' })).toBeNull();

    /*
     * Sonunda hikâye açılıyor. Girişten sonra varılan yer artık özet
     * ekranı değil: sinematik anlatı kabuğun dışında, kendi rotasında.
     */
    expect(
      await screen.findByRole(
        'link',
        { name: 'Aboneliklerime git' },
        { timeout: 9000 },
      ),
    ).toBeInTheDocument();
  }, 15000);

  it('hareket azaltma açıkken animasyon oynamıyor', async () => {
    /*
     * Ekranı üç saniye kaplayan bir efekt, kısılacak bir süsleme değil;
     * baş dönmesi yapabiliyor. Bu kullanıcıda giriş doğrudan açılıyor.
     */
    hareketTercihi(true);
    sunucuKur();
    await girisYap();

    expect(
      await screen.findByRole(
        'link',
        { name: 'Aboneliklerime git' },
        { timeout: 9000 },
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.giris-isigi')).toBeNull();
  }, 15000);
});
