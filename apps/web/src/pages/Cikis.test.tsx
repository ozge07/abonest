/**
 * Çıkış.
 *
 * Şikâyet: "çıkış butonuna basınca giriş sayfasına yönlendirmen lazım,
 * şu anda aynı sayfada kalıyor".
 *
 * Sunucu tarafı çalışıyordu — oturum satırı gerçekten siliniyordu — ama
 * ekran değişmiyordu. İki ayrı sebep vardı:
 *
 * 1. `queryClient.clear()` **bağlı gözlemcilere haber vermiyor**. Kimse
 *    yeniden çizilmediği için uygulama hâlâ giriş yapılmış sanıyordu.
 * 2. TanStack Query bir sorgu hata alınca **eski veriyi tutuyor**. `/me`
 *    401 dönse bile `data` son kullanıcıyı taşımaya devam ediyordu; yalnızca
 *    `data`ya bakan "girişte mi" kuralı bu yüzden hep `true` kalıyordu.
 *
 * Buradaki testler ikisini de tutuyor.
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

const BOS_OZET = {
  activeCount: 0,
  totals: [],
  upcoming: [],
  byCategory: [],
  cancelledThisMonth: 0,
};

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Çıkıştan sonra `/me` 401 dönen, gerçeğe yakın bir sunucu. */
function sunucuKur() {
  let girisli = true;
  const cagrilar: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (girdi: string, secenekler?: { method?: string }) => {
      const yol = String(girdi).replace('/api/v1', '');
      cagrilar.push(`${secenekler?.method ?? 'GET'} ${yol}`);

      if (yol === '/auth/logout') {
        girisli = false;
        return new Response(null, { status: 204 });
      }
      if (!girisli) {
        return json({ title: 'Oturum gerekli', status: 401 }, 401);
      }
      if (yol === '/me') return json(KULLANICI);
      if (yol === '/me/sessions') return json([]);
      if (yol === '/dashboard') return json(BOS_OZET);
      if (yol.startsWith('/subscriptions') || yol.startsWith('/notifications')) {
        return json({ data: [], nextCursor: null, hasMore: false });
      }
      return json({ title: 'Bulunamadı', status: 404 }, 404);
    }),
  );

  return cagrilar;
}

function ciz() {
  const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hesap']}>
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

describe('çıkış', () => {
  it('giriş ekranına düşüyor', async () => {
    const cagrilar = sunucuKur();
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(await screen.findByRole('button', { name: 'Çıkış' }));

    expect(
      await screen.findByRole('heading', { name: /giriş yap/i }),
    ).toBeInTheDocument();
    expect(cagrilar).toContain('POST /auth/logout');
  });

  it('önceki kullanıcının verisi ekranda kalmıyor', async () => {
    sunucuKur();
    const kullanici = userEvent.setup();
    ciz();

    // Hesabım ekranı açıkken çıkılıyor: e-posta ve ad ekranda duruyordu.
    await screen.findByText(`E-posta: ${KULLANICI.email}`);
    await kullanici.click(screen.getByRole('button', { name: 'Çıkış' }));

    await screen.findByRole('heading', { name: /giriş yap/i });
    expect(screen.queryByText(`E-posta: ${KULLANICI.email}`)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Hesabım' })).toBeNull();
  });

  it('kendi çıkanda "oturumun kapandı" notu çıkmıyor', async () => {
    // Kullanıcı kendi çıktıysa sebebini söylemek gereksiz gürültü.
    sunucuKur();
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(await screen.findByRole('button', { name: 'Çıkış' }));
    await screen.findByRole('heading', { name: /giriş yap/i });

    expect(screen.queryByText(/tekrar giriş yap/i)).toBeNull();
  });

  it('oturum kapandığında sebebi giriş ekranında yazıyor', async () => {
    /*
     * Kullanıcı bir anda giriş ekranında buluyor kendini; sebebini
     * bilmeden bu, uygulamanın kendiliğinden bozulması gibi görünüyor.
     * Sunucunun 401 gövdesindeki cümle ekrana taşınıyor.
     */
    let girisli = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (girdi: string) => {
        const yol = String(girdi).replace('/api/v1', '');
        if (!girisli) {
          return json(
            {
              // Ayrım `type` ile: metne bakmak, cümle değişince sessizce
              // bozulan bir bağ kurardı.
              type: 'https://abonelik-takip.app/errors/session-idle',
              title: 'Bir süre işlem yapılmadığı için oturumun kapandı',
              status: 401,
            },
            401,
          );
        }
        if (yol === '/me') return json(KULLANICI);
        if (yol === '/me/sessions') return json([]);
        if (yol === '/dashboard') return json(BOS_OZET);
        return json({ data: [], nextCursor: null, hasMore: false });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/hesap']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText(`E-posta: ${KULLANICI.email}`);

    girisli = false;
    await queryClient.invalidateQueries({ queryKey: ['me'] });

    expect(
      await screen.findByText(/bir süre işlem yapılmadığı için/i),
    ).toBeInTheDocument();
  });

  it('sayfa yenilendiğinde de not çıkıyor', async () => {
    /*
     * Asıl senaryo bu: kullanıcı sekmeye dönüp yeniliyor, ilk istek zaten
     * 401 oluyor ve elde eski veri yok. "Önce kullanıcı vardı" koşuluna
     * bakan ilk uygulamada not hiç çıkmıyordu; ölçülüp düzeltildi.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(
          {
            type: 'https://abonelik-takip.app/errors/session-idle',
            title: 'Bir süre işlem yapılmadığı için oturumun kapandı',
            status: 401,
          },
          401,
        ),
      ),
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: sorguSecenekleri })}
      >
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(/bir süre işlem yapılmadığı için/i),
    ).toBeInTheDocument();
  });

  it('hiç giriş yapmamış ziyaretçiye not gösterilmiyor', async () => {
    // Sıradan 401: not gürültü olurdu.
    sunucuKur();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ title: 'Oturum bulunamadı', status: 401 }, 401)),
    );

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: sorguSecenekleri })}
      >
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByRole('heading', { name: /giriş yap/i });
    expect(screen.queryByText(/tekrar giriş yap/i)).toBeNull();
  });

  it('oturum süresi dolduğunda da giriş ekranına düşüyor', async () => {
    /*
     * Aynı kök sebep: sunucu 401 diyorsa önbellekteki eski kullanıcı
     * kaydı bunu değiştirmiyor. Burada çıkışa basılmıyor — oturum
     * kendiliğinden düşüyor.
     */
    let girisli = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (girdi: string) => {
        const yol = String(girdi).replace('/api/v1', '');
        if (!girisli) return json({ title: 'Oturum gerekli', status: 401 }, 401);
        if (yol === '/me') return json(KULLANICI);
        if (yol === '/me/sessions') return json([]);
        if (yol === '/dashboard') return json(BOS_OZET);
        return json({ data: [], nextCursor: null, hasMore: false });
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/hesap']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText(`E-posta: ${KULLANICI.email}`);

    girisli = false;
    await queryClient.invalidateQueries({ queryKey: ['me'] });

    expect(
      await screen.findByRole('heading', { name: /giriş yap/i }),
    ).toBeInTheDocument();
  });
});
