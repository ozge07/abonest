/**
 * Silinmiş hesapla giriş.
 *
 * Kullanıcı kendi hesabını sildi ve geri giremedi; giriş "E-posta ya da
 * şifre hatalı" diyordu ve hesabını geri getirmenin uygulama içinde hiçbir
 * yolu yoktu. Artık doğru şifreyle giriş silmeyi geri alıyor.
 *
 * Buradaki iddia arayüzün payına düşen kısım: kullanıcı hesabının geri
 * geldiğini **görüyor**. Sessizce olsaydı, hesabının hâlâ silinme sırasında
 * olduğunu sanırdı.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

/** Girişten önce oturumsuz, sonra oturumlu davranan sunucu. */
function sunucuKur(girisYaniti: () => Response) {
  let girisli = false;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (girdi: string) => {
      const yol = String(girdi).replace('/api/v1', '');

      if (yol === '/auth/login') {
        girisli = true;
        return girisYaniti();
      }
      if (!girisli) {
        return json({ title: 'Oturum gerekli', status: 401 }, 401);
      }
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

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  sessionStorage.clear();

  /*
   * Bu dosya kırılma animasyonunu değil, geri getirme şeridini sınıyor.
   * Hareket azaltma açıkken giriş doğrudan uygulamayı açıyor ve testler
   * üç saniye beklemek zorunda kalmıyor. Animasyonun kendisi
   * `KirilmaAnimasyonu.test.tsx` içinde.
   */
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('silinmiş hesapla giriş', () => {
  it('hesabın geri geldiğini söylüyor', async () => {
    sunucuKur(() =>
      json({ token: 'jeton', expiresAt: '2026-09-11T00:00:00.000Z', restored: true }),
    );

    await girisYap();

    expect(
      await screen.findByText(/hesabın geri getirildi/i),
    ).toBeInTheDocument();
  });

  it('şerit kapatılabiliyor', async () => {
    sunucuKur(() =>
      json({ token: 'jeton', expiresAt: '2026-09-11T00:00:00.000Z', restored: true }),
    );

    const kullanici = userEvent.setup();
    await girisYap();
    await screen.findByText(/hesabın geri getirildi/i);

    await kullanici.click(screen.getByRole('button', { name: 'Kapat' }));

    expect(screen.queryByText(/hesabın geri getirildi/i)).toBeNull();
  });

  it('sıradan girişte şerit çıkmıyor', async () => {
    // `restored` bayrağı yok sayılsaydı herkes her girişte bu mesajı
    // görürdü.
    sunucuKur(() =>
      json({
        token: 'jeton',
        expiresAt: '2026-09-11T00:00:00.000Z',
        restored: false,
      }),
    );

    await girisYap();

    /*
     * Girişin gerçekten tamamlandığından emin oluyoruz; yoksa "mesaj yok"
     * iddiası hiçbir şey kanıtlamazdı. Varış noktası artık özet ekranı
     * değil, girişten sonra açılan hikâye sayfası.
     */
    expect(
      await screen.findByRole(
        'link',
        { name: 'Aboneliklerime git' },
        { timeout: 9000 },
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/hesabın geri getirildi/i)).toBeNull();
  }, 15000);

  it('not tek seferlik: sayfa yenilenince tekrar çıkmıyor', async () => {
    sunucuKur(() =>
      json({ token: 'jeton', expiresAt: '2026-09-11T00:00:00.000Z', restored: true }),
    );

    await girisYap();
    await screen.findByText(/hesabın geri getirildi/i);

    // Yeniden yükleme: aynı sekmede uygulama baştan çiziliyor.
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: sorguSecenekleri })}
      >
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryAllByText(/hesabın geri getirildi/i)).toHaveLength(1);
  });
});
