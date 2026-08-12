/**
 * Kayıt formunun hata davranışı.
 *
 * Bu dosya somut bir kullanıcı şikâyetinden doğdu: yanlış e-posta girip
 * gönderdikten sonra adres düzeltilse bile kırmızı çerçeve ve "geçerli bir
 * e-posta adresi gir" mesajı ekranda kalıyordu.
 *
 * Davranış saf mantıkla sınanamıyor — hangi anda görünüp hangi anda
 * kaybolduğu React'in durum yönetimine bağlı. `docs/testing.md` bileşen
 * testi olmamasını bilinen bir boşluk olarak kaydediyordu; burada kapanıyor.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KayitSayfasi } from './KayitSayfasi';

function ciz() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KayitSayfasi />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const EPOSTA_HATASI = /geçerli bir e-posta adresi gir/i;

beforeEach(() => {
  // Form gönderimi ağ isteği atıyor; testin konusu o değil.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 500 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kayıt formu — e-posta alanı', () => {
  it('yazarken kızarmıyor', async () => {
    // Kullanıcı adresini yazmaya başladığı anda "geçersiz" demek, henüz
    // bitirmediği bir işi yanlış ilan etmek olur.
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(screen.getByLabelText('E-posta'), 'ozge@');

    expect(screen.queryByText(EPOSTA_HATASI)).toBeNull();
    expect(screen.getByLabelText('E-posta')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });

  it('alandan çıkınca geçersiz adresi bildiriyor', async () => {
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.type(screen.getByLabelText('E-posta'), 'ozge@');
    await kullanici.tab();

    expect(screen.getByText(EPOSTA_HATASI)).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('adres geçerli hâle gelince hata anında kayboluyor', async () => {
    // Şikâyetin tam olarak bu: düzeltince kırmızı kalmamalı, gönderme
    // tuşunu beklememeli.
    const kullanici = userEvent.setup();
    ciz();

    const alan = screen.getByLabelText('E-posta');
    await kullanici.type(alan, 'ozge@');
    await kullanici.tab();
    expect(screen.getByText(EPOSTA_HATASI)).toBeInTheDocument();

    await kullanici.click(alan);
    await kullanici.type(alan, 'example.com');

    expect(screen.queryByText(EPOSTA_HATASI)).toBeNull();
    expect(alan).toHaveAttribute('aria-invalid', 'false');
  });

  it('gönderme denendiğinde dokunulmamış alanların hatası da görünüyor', async () => {
    // Kullanıcı hiçbir alana dokunmadan gönderirse sessizce hiçbir şey
    // olmamalı; eksikler gösterilmeli.
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(screen.getByRole('button', { name: /hesap oluştur/i }));

    expect(screen.getByText(EPOSTA_HATASI)).toBeInTheDocument();
    expect(screen.getByText(/ad en az 3 karakter/i)).toBeInTheDocument();
    expect(screen.getByText(/şifre en az 6 karakter/i)).toBeInTheDocument();
  });

  it('geçersiz formda ağ isteği atılmıyor', async () => {
    const kullanici = userEvent.setup();
    ciz();

    await kullanici.click(screen.getByRole('button', { name: /hesap oluştur/i }));

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('kayıt formu — sunucudan gelen alan hatası', () => {
  /*
   * Yalnızca sunucunun bilebileceği hatalar var (örneğin bir adresin
   * engellenmiş olması). Kullanıcı değeri değiştirdiği anda o hata artık o
   * değer hakkında değil; ekranda kalması yanlış bilgi olur.
   *
   * Bu yol bir mutasyon denemesiyle bulundu: hata temizleme mantığı eski
   * hâline döndürüldüğünde testlerin hiçbiri düşmüyordu, çünkü hepsi
   * yalnızca istemci tarafı doğrulamayı sınıyordu.
   */
  function sunucuAlanHatasiDondur() {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'x',
              title: 'Doğrulama başarısız',
              status: 422,
              errors: [
                { field: 'email', message: 'Bu adres kullanılamıyor' },
              ],
            }),
            { status: 422, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
  }

  async function gecerliFormuGonder(kullanici: ReturnType<typeof userEvent.setup>) {
    await kullanici.type(screen.getByLabelText('Ad'), 'Özge');
    await kullanici.type(screen.getByLabelText('E-posta'), 'ozge@example.com');
    await kullanici.type(screen.getByLabelText('Şifre'), 'abc123');
    await kullanici.click(screen.getByRole('button', { name: /hesap oluştur/i }));
  }

  it('sunucunun alan hatasını gösteriyor', async () => {
    sunucuAlanHatasiDondur();
    const kullanici = userEvent.setup();
    ciz();

    await gecerliFormuGonder(kullanici);

    expect(await screen.findByText(/bu adres kullanılamıyor/i)).toBeInTheDocument();
  });

  it('kullanıcı adresi değiştirince sunucu hatası kayboluyor', async () => {
    sunucuAlanHatasiDondur();
    const kullanici = userEvent.setup();
    ciz();

    await gecerliFormuGonder(kullanici);
    await screen.findByText(/bu adres kullanılamıyor/i);

    const alan = screen.getByLabelText('E-posta');
    await kullanici.clear(alan);
    await kullanici.type(alan, 'baska@example.com');

    expect(screen.queryByText(/bu adres kullanılamıyor/i)).toBeNull();
    expect(alan).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('kayıt formu — yeni kurallar', () => {
  it('altı karakterlik şifreyi kabul ediyor', async () => {
    const kullanici = userEvent.setup();
    ciz();

    const alan = screen.getByLabelText('Şifre');
    await kullanici.type(alan, 'abc12');
    await kullanici.tab();
    expect(screen.getByText(/şifre en az 6 karakter/i)).toBeInTheDocument();

    await kullanici.click(alan);
    await kullanici.type(alan, '3');
    expect(screen.queryByText(/şifre en az 6 karakter/i)).toBeNull();
  });

  it('üç harflik adı kabul ediyor', async () => {
    const kullanici = userEvent.setup();
    ciz();

    const alan = screen.getByLabelText('Ad');
    await kullanici.type(alan, 'Al');
    await kullanici.tab();
    expect(screen.getByText(/ad en az 3 karakter/i)).toBeInTheDocument();

    await kullanici.click(alan);
    await kullanici.type(alan, 'i');
    expect(screen.queryByText(/ad en az 3 karakter/i)).toBeNull();
  });

  it('şifre ipucu güncel alt sınırı gösteriyor', async () => {
    ciz();
    expect(screen.getByText(/en az 6 karakter/i)).toBeInTheDocument();
  });
});
