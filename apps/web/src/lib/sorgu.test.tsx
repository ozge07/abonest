/**
 * Sorgu yeniden deneme politikası.
 *
 * Kullanıcı şikâyeti: "kayıt olduktan sonra özet, abonelikler, analiz çok geç
 * yükleniyor."
 *
 * Sebep sunucu değildi — bütün uçlar 60 ms altında yanıtlıyor. TanStack
 * Query'nin varsayılanı başarısız isteği **üç kez daha** deniyor ve aralar
 * katlanarak büyüyor (1s + 2s + 4s). Doğrulanmamış kullanıcıda her veri ucu
 * 403 döndüğü için ekran yedi saniye boyunca "Yükleniyor" kalıyordu.
 *
 * 4xx bir istemci hatası: aynı isteği tekrar göndermek aynı cevabı getirir.
 * Tekrar denemenin anlamı yalnızca ağ hatalarında ve 5xx'te var.
 */

import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { sorguSecenekleri } from './sorgu';

function Deneme() {
  const sorgu = useQuery({
    queryKey: ['deneme'],
    queryFn: () => api.get('/deneme'),
  });
  return <p>{sorgu.isError ? 'hata' : sorgu.isPending ? 'yükleniyor' : 'tamam'}</p>;
}

function ciz() {
  const queryClient = new QueryClient({ defaultOptions: sorguSecenekleri });
  return render(
    <QueryClientProvider client={queryClient}>
      <Deneme />
    </QueryClientProvider>,
  );
}

function yanitVer(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ title: 'x', status }), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('yeniden deneme politikası', () => {
  it('403 tekrar denenmiyor', async () => {
    // Doğrulanmamış kullanıcının gördüğü durum. Tekrar denemek yedi saniye
    // bekleme üretiyordu ve sonuç yine 403 oluyordu.
    yanitVer(403);
    ciz();

    await waitFor(() => expect(screen.getByText('hata')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('401 tekrar denenmiyor', async () => {
    yanitVer(401);
    ciz();

    await waitFor(() => expect(screen.getByText('hata')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('404 tekrar denenmiyor', async () => {
    yanitVer(404);
    ciz();

    await waitFor(() => expect(screen.getByText('hata')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sunucu hatası tekrar deneniyor', async () => {
    // 5xx geçici olabiliyor; burada tekrar denemenin anlamı var.
    yanitVer(500);
    ciz();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
  });
});
