/**
 * Hesap ekranı.
 *
 * Şikâyet: "Hesap silme nerde ben göremiyorum". Sunucuda profil, şifre,
 * oturum ve hesap silme uçları vardı ama hiçbirinin ekranı yoktu; kullanıcı
 * kendi hesabını silemiyordu. Buradaki testler ekranın var olduğunu değil,
 * **yanlışlıkla tetiklenemediğini** ve doğru uçlara gittiğini ölçüyor.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { HesapSayfasi } from './HesapSayfasi';
import { sorguSecenekleri } from '../lib/sorgu';

const KULLANICI = {
  id: 'k1',
  email: 'ozge@example.com',
  name: 'Özge',
  currency: 'TRY',
  emailVerifiedAt: '2026-08-01T00:00:00.000Z',
};

const BU_CIHAZ = {
  id: 'o1',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0',
  lastSeenAt: '2026-08-12T09:00:00.000Z',
  createdAt: '2026-08-01T09:00:00.000Z',
  current: true,
};

const BASKA_CIHAZ = {
  id: 'o2',
  userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile',
  lastSeenAt: '2026-08-11T20:00:00.000Z',
  createdAt: '2026-08-05T20:00:00.000Z',
  current: false,
};

interface Cagri {
  yol: string;
  method: string;
  govde: string | undefined;
}

function sunucuKur(yanitlar: Record<string, () => Response>) {
  const cagrilar: Cagri[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (
        girdi: string,
        secenekler?: { method?: string; body?: string },
      ) => {
        const yol = String(girdi).replace('/api/v1', '');
        const method = secenekler?.method ?? 'GET';
        cagrilar.push({ yol, method, govde: secenekler?.body });

        // `/me` hem okunuyor hem yazılıyor: anahtar yönteme göre de
        // aranıyor, yoksa profil okuması silme cevabını verirdi.
        const uretici = yanitlar[`${yol} ${method}`] ?? yanitlar[yol];
        if (uretici === undefined) {
          return new Response(
            JSON.stringify({ title: 'Bulunamadı', status: 404 }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          );
        }
        return uretici();
      },
    ),
  );

  return cagrilar;
}

const json = (govde: unknown, status = 200) =>
  new Response(JSON.stringify(govde), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function ciz(icerik = <HesapSayfasi />) {
  const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{icerik}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Varsayılan sunucu: profil ve iki oturum. */
function varsayilan(ekstra: Record<string, () => Response> = {}) {
  return sunucuKur({
    '/me': () => json(KULLANICI),
    '/me/sessions': () => json([BU_CIHAZ, BASKA_CIHAZ]),
    ...ekstra,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hesap ekranına ulaşmak', () => {
  it('gezinme çubuğundan açılıyor', async () => {
    // Uçlar aylardır hazırdı ama hiçbir bağlantı onlara gitmiyordu.
    sunucuKur({
      '/me': () => json(KULLANICI),
      '/me/sessions': () => json([BU_CIHAZ]),
      '/dashboard': () =>
        json({
          activeCount: 0,
          totals: [],
          upcoming: [],
          byCategory: [],
          cancelledThisMonth: 0,
        }),
      '/subscriptions': () => json({ data: [], nextCursor: null, hasMore: false }),
      '/notifications': () => json({ data: [], nextCursor: null, hasMore: false }),
    });

    const kullanici = userEvent.setup();
    ciz(<App />);

    await kullanici.click(await screen.findByRole('link', { name: 'Hesabım' }));

    expect(
      await screen.findByRole('button', { name: 'Hesabımı sil' }),
    ).toBeInTheDocument();
  });
});

describe('hesap silme', () => {
  it('tek tıkla silmiyor: önce onay soruyor', async () => {
    const cagrilar = varsayilan();
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(
      await screen.findByRole('button', { name: 'Hesabımı sil' }),
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(
      cagrilar.some((c) => c.yol === '/me' && c.method === 'DELETE'),
    ).toBe(false);
  });

  it('vazgeçince hiçbir şey olmuyor', async () => {
    const cagrilar = varsayilan();
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(
      await screen.findByRole('button', { name: 'Hesabımı sil' }),
    );
    await kullanici.click(screen.getByRole('button', { name: 'Vazgeç' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(
      cagrilar.some((c) => c.yol === '/me' && c.method === 'DELETE'),
    ).toBe(false);
  });

  it('onaylanınca siliyor ve kalıcı silme tarihini söylüyor', async () => {
    const cagrilar = varsayilan({
      // 202 + purgeAt: sunucu hemen silmiyor, işaretliyor.
      '/me DELETE': () => json({ purgeAt: '2026-09-11T10:00:00.000Z' }, 202),
    });
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(
      await screen.findByRole('button', { name: 'Hesabımı sil' }),
    );
    const kutu = screen.getByRole('alertdialog');
    await kullanici.click(
      within(kutu).getByRole('button', { name: 'Evet, hesabımı sil' }),
    );

    // Kullanıcı geri dönüş penceresini görüyor: "kalıcı olarak silindi"
    // demek yanlış olurdu, 30 gün geri alınabiliyor.
    expect(await screen.findByText(/11 Eylül 2026/)).toBeInTheDocument();
    // Ve geri dönüşün **nasıl** olacağını da: eskiden "destekle iletişime
    // geç" yazıyordu, oysa ortada bir destek masası yok.
    expect(screen.getByText(/giriş yap/i)).toBeInTheDocument();
    expect(
      cagrilar.some((c) => c.yol === '/me' && c.method === 'DELETE'),
    ).toBe(true);
  });

  it('sunucu reddederse sebebi gösteriliyor', async () => {
    varsayilan({
      '/me DELETE': () =>
        json({ title: 'Hesap silinemedi', status: 500 }, 500),
    });
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(
      await screen.findByRole('button', { name: 'Hesabımı sil' }),
    );
    await kullanici.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Evet, hesabımı sil',
      }),
    );

    expect(await screen.findByText('Hesap silinemedi')).toBeInTheDocument();
  });
});

describe('açık oturumlar', () => {
  it('kullanıcı kendi oturumunu kapatamıyor', async () => {
    // İşaretsiz bir listede "şüpheli oturumu kapat" derken insan kendini
    // atıyordu.
    varsayilan();
    ciz();

    const satirlar = await screen.findAllByRole('listitem');
    const buCihaz = satirlar.find((s) => s.textContent?.includes('bu cihaz'));

    expect(buCihaz).toBeDefined();
    expect(within(buCihaz!).queryByRole('button', { name: 'Kapat' })).toBeNull();
  });

  it('başka cihazın oturumunu kapatıyor', async () => {
    const cagrilar = varsayilan({
      '/me/sessions/o2': () => new Response(null, { status: 204 }),
    });
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(await screen.findByRole('button', { name: 'Kapat' }));

    await waitFor(() =>
      expect(
        cagrilar.some(
          (c) => c.yol === '/me/sessions/o2' && c.method === 'DELETE',
        ),
      ).toBe(true),
    );
  });

  it('cihazı okunabilir bir adla gösteriyor', async () => {
    // Ham user-agent metni kullanıcıya "bu ben miydim" sorusunu
    // sordurmuyor.
    varsayilan();
    ciz();

    expect(await screen.findByText(/Chrome · Mac/)).toBeInTheDocument();
    expect(screen.getByText(/Chrome · Android/)).toBeInTheDocument();
    expect(screen.queryByText(/Mozilla\/5\.0/)).toBeNull();
  });
});

describe('şifre değiştirme', () => {
  it('kısa yeni şifreyi sunucuya göndermiyor', async () => {
    const cagrilar = varsayilan();
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(
      await screen.findByLabelText('Mevcut şifre'),
      'eski-sifre',
    );
    await kullanici.type(screen.getByLabelText('Yeni şifre'), 'abc');
    await kullanici.click(
      screen.getByRole('button', { name: 'Şifreyi değiştir' }),
    );

    expect(cagrilar.some((c) => c.yol === '/me/password')).toBe(false);
    expect(screen.getByText(/en az 6 karakter/i)).toBeInTheDocument();
  });

  it('mevcut şifre yanlışsa sunucunun mesajını gösteriyor', async () => {
    varsayilan({
      '/me/password': () =>
        json({ title: 'Mevcut şifre hatalı', status: 401 }, 401),
    });
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(
      await screen.findByLabelText('Mevcut şifre'),
      'yanlis-sifre',
    );
    await kullanici.type(screen.getByLabelText('Yeni şifre'), 'yeni-sifre');
    await kullanici.click(
      screen.getByRole('button', { name: 'Şifreyi değiştir' }),
    );

    expect(await screen.findByText('Mevcut şifre hatalı')).toBeInTheDocument();
  });

  it('başarılı olunca oturum listesini yeniden okuyor', async () => {
    // Sunucu diğer oturumları düşürüyor; ekranda durmaya devam etmeleri
    // kullanıcıya yanlış bilgi verirdi.
    const cagrilar = varsayilan({
      '/me/password': () => new Response(null, { status: 204 }),
    });
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(
      await screen.findByLabelText('Mevcut şifre'),
      'eski-sifre',
    );
    await kullanici.type(screen.getByLabelText('Yeni şifre'), 'yeni-sifre');
    await kullanici.click(
      screen.getByRole('button', { name: 'Şifreyi değiştir' }),
    );

    expect(await screen.findByText('Şifren değişti')).toBeInTheDocument();
    expect(
      cagrilar.filter((c) => c.yol === '/me/sessions').length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('profil', () => {
  it('çok kısa adı sunucuya göndermiyor', async () => {
    const cagrilar = varsayilan();
    const kullanici = userEvent.setup();
    ciz();

    const ad = await screen.findByLabelText('Ad');
    await kullanici.clear(ad);
    await kullanici.type(ad, 'Öz');
    await kullanici.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(
      cagrilar.some((c) => c.yol === '/me' && c.method === 'PATCH'),
    ).toBe(false);
  });

  it('adı ve para birimini kaydediyor', async () => {
    const cagrilar = varsayilan({
      '/me PATCH': () => json({ ...KULLANICI, name: 'Özge N', currency: 'USD' }),
    });
    const kullanici = userEvent.setup();
    ciz();

    const ad = await screen.findByLabelText('Ad');
    await kullanici.clear(ad);
    await kullanici.type(ad, 'Özge N');
    await kullanici.selectOptions(
      screen.getByLabelText('Varsayılan para birimi'),
      'USD',
    );
    await kullanici.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Kaydedildi')).toBeInTheDocument();

    const istek = cagrilar.find(
      (c) => c.yol === '/me' && c.method === 'PATCH',
    );
    expect(istek?.govde).toBe(
      JSON.stringify({ name: 'Özge N', currency: 'USD' }),
    );
  });
});
