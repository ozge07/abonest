/**
 * E-posta doğrulama ekranı.
 *
 * Şikâyet: kullanıcı kayıt oldu, abonelik formunu doldurdu, kaydete bastı ve
 * "Önce e-posta adresini doğrulaman gerekiyor" yazısını gördü — nereden
 * doğrulayacağına dair hiçbir yol yokken. Emeği de boşa gitti.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { sorguSecenekleri } from '../lib/sorgu';

/*
 * Türkçe büyük İ, küçük 'i'ye standart kurallarla dönüşmüyor: `/ilk/i`
 * deseni "İlk" ile **eşleşmiyor**. Baştaki harfi desene almıyoruz.
 */
const ILK_ABONELIK = /aboneliğini ekle/i;

const DOGRULANMAMIS = {
  id: 'k1',
  email: 'ozge@example.com',
  name: 'Özge',
  currency: 'TRY',
  emailVerifiedAt: null,
};

/** Çağrılan yolları kaydeden bir `fetch` taklidi. */
function sunucuKur(yanitlar: Record<string, () => Response>) {
  const cagrilar: { yol: string; method: string }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (girdi: string, secenekler?: { method?: string }) => {
      const yol = String(girdi).replace('/api/v1', '');
      cagrilar.push({ yol, method: secenekler?.method ?? 'GET' });

      const uretici = yanitlar[yol];
      if (uretici === undefined) {
        return new Response(
          JSON.stringify({ title: 'Bulunamadı', status: 404 }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return uretici();
    }),
  );

  return cagrilar;
}

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function ciz() {
  const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
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

describe('doğrulanmamış kullanıcı', () => {
  it('uygulama yerine doğrulama ekranını görüyor', async () => {
    sunucuKur({ '/me': () => json(DOGRULANMAMIS) });
    ciz();

    expect(
      await screen.findByRole('heading', { name: /e-posta adresini doğrula/i }),
    ).toBeInTheDocument();
    // Uygulamanın gezinme çubuğu görünmüyor: gidebileceği bir yer yok.
    expect(screen.queryByRole('link', { name: 'Abonelikler' })).toBeNull();
  });

  it('hangi adrese kod gittiğini söylüyor', async () => {
    sunucuKur({ '/me': () => json(DOGRULANMAMIS) });
    ciz();

    expect(await screen.findByText(DOGRULANMAMIS.email)).toBeInTheDocument();
  });

  it('veri uçlarına hiç istek atmıyor', async () => {
    // Eski davranışta ekranlar açılıyor, her biri 403 alıyor ve tekrar
    // deneme yüzünden saniyelerce "Yükleniyor" kalıyordu.
    const cagrilar = sunucuKur({ '/me': () => json(DOGRULANMAMIS) });
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });

    expect(cagrilar.some((c) => c.yol === '/dashboard')).toBe(false);
    expect(cagrilar.some((c) => c.yol === '/subscriptions')).toBe(false);
  });

  it('kod girip doğrulayınca uygulama açılıyor', async () => {
    let dogrulandi = false;
    sunucuKur({
      '/me': () =>
        json(
          dogrulandi
            ? { ...DOGRULANMAMIS, emailVerifiedAt: '2026-08-12T00:00:00.000Z' }
            : DOGRULANMAMIS,
        ),
      '/auth/verify-email-code': () => {
        dogrulandi = true;
        // 204 gövdesiz bir durum kodu; boş metin bile verilse `Response`
        // kurucusu hata fırlatıyor ve taklit sunucu sessizce çöküyor.
        return new Response(null, { status: 204 });
      },
      '/dashboard': () =>
        json({
          activeCount: 0,
          totals: [],
          upcoming: [],
          byCategory: [],
          cancelledThisMonth: 0,
        }),
      '/subscriptions': () => json({ data: [], nextCursor: null, hasMore: false }),
    });

    const kullanici = userEvent.setup();
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });
    await kullanici.type(screen.getByLabelText(/doğrulama kodu/i), '123456');
    await kullanici.click(screen.getByRole('button', { name: /^doğrula$/i }));

    // Doğrulama sonrası uygulama açılıyor; aboneliği olmadığı için
    // abonelikler ekranına düşüyor. Zincir uzun: /me yeniden okunuyor,
    // uygulama açılıyor, özet yükleniyor, yönlendirme oluyor.
    expect(
      await screen.findByRole('heading', { name: ILK_ABONELIK }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('boş kod göndermiyor', async () => {
    const cagrilar = sunucuKur({ '/me': () => json(DOGRULANMAMIS) });
    const kullanici = userEvent.setup();
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });
    await kullanici.click(screen.getByRole('button', { name: /^doğrula$/i }));

    expect(cagrilar.some((c) => c.yol === '/auth/verify-email-code')).toBe(false);
    expect(screen.getByText(/6 rakamdan/i)).toBeInTheDocument();
  });

  it('geçersiz kodda sunucunun mesajını gösteriyor', async () => {
    sunucuKur({
      '/me': () => json(DOGRULANMAMIS),
      '/auth/verify-email-code': () =>
        json(
          {
            title: 'Doğrulama bağlantısı geçersiz ya da süresi dolmuş',
            status: 410,
          },
          410,
        ),
    });

    const kullanici = userEvent.setup();
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });
    await kullanici.type(screen.getByLabelText(/doğrulama kodu/i), '654321');
    await kullanici.click(screen.getByRole('button', { name: /^doğrula$/i }));

    expect(
      await screen.findByText(/geçersiz ya da süresi dolmuş/i),
    ).toBeInTheDocument();
  });

  it('kodu tekrar gönderebiliyor', async () => {
    const cagrilar = sunucuKur({
      '/me': () => json(DOGRULANMAMIS),
      '/auth/resend-verification': () => json({ deliveredToInbox: false }, 202),
    });

    const kullanici = userEvent.setup();
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });
    await kullanici.click(screen.getByRole('button', { name: /tekrar gönder/i }));

    await waitFor(() =>
      expect(
        cagrilar.some((c) => c.yol === '/auth/resend-verification'),
      ).toBe(true),
    );
    expect(await screen.findByText(/yeni kod gönderildi/i)).toBeInTheDocument();
  });

  it('sunucu geliştirme modundaysa kodun nerede olduğunu söylüyor', async () => {
    // Uyarı sunucunun ortamına bakıyor, derleme moduna değil: derlenmiş
    // arayüzü geliştirme sunucusuyla çalıştırmak olağan.
    sunucuKur({
      '/me': () => json(DOGRULANMAMIS),
      '/auth/resend-verification': () => json({ deliveredToInbox: false }, 202),
    });

    const kullanici = userEvent.setup();
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });
    await kullanici.click(screen.getByRole('button', { name: /tekrar gönder/i }));

    expect(
      await screen.findByText(/geliştirme modunda/i),
    ).toBeInTheDocument();
  });

  it('gerçekten e-posta gönderiliyorsa geliştirme uyarısı çıkmıyor', async () => {
    sunucuKur({
      '/me': () => json(DOGRULANMAMIS),
      '/auth/resend-verification': () => json({ deliveredToInbox: true }, 202),
    });

    const kullanici = userEvent.setup();
    ciz();

    await screen.findByRole('heading', { name: /e-posta adresini doğrula/i });
    await kullanici.click(screen.getByRole('button', { name: /tekrar gönder/i }));
    await screen.findByText(/yeni kod gönderildi/i);

    expect(screen.queryByText(/geliştirme modunda/i)).toBeNull();
  });
});

describe('doğrulanmış kullanıcı', () => {
  it('doğrulama ekranını görmüyor', async () => {
    sunucuKur({
      '/me': () =>
        json({ ...DOGRULANMAMIS, emailVerifiedAt: '2026-08-12T00:00:00.000Z' }),
      '/dashboard': () =>
        json({
          activeCount: 0,
          totals: [],
          upcoming: [],
          byCategory: [],
          cancelledThisMonth: 0,
        }),
      '/subscriptions': () => json({ data: [], nextCursor: null, hasMore: false }),
    });

    ciz();

    expect(
      await screen.findByRole('heading', { name: ILK_ABONELIK }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/e-posta adresini doğrula/i)).toBeNull();
  });

  it('aboneliği yoksa özet yerine abonelikler ekranına düşüyor', async () => {
    // Boş bir "aylık giderin ₺0" ekranı kimseye bir şey söylemiyor.
    sunucuKur({
      '/me': () =>
        json({ ...DOGRULANMAMIS, emailVerifiedAt: '2026-08-12T00:00:00.000Z' }),
      '/dashboard': () =>
        json({
          activeCount: 0,
          totals: [],
          upcoming: [],
          byCategory: [],
          cancelledThisMonth: 0,
        }),
      '/subscriptions': () => json({ data: [], nextCursor: null, hasMore: false }),
    });

    ciz();

    expect(
      await screen.findByRole('heading', { name: ILK_ABONELIK }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/aylık gideri/i)).toBeNull();
  });
});
