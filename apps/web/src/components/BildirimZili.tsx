import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Bildirim, Sayfa } from '../lib/types';

/**
 * Bildirim merkezi.
 *
 * Rozet için okunmamış **sayısı** ayrı uçtan geliyor; liste yalnızca panel
 * açıldığında indiriliyor. Sayıyı öğrenmek için 20 bildirim indirmek, en sık
 * yapılan isteği en pahalısı yapardı.
 */
export function BildirimZili() {
  const [acik, setAcik] = useState(false);
  const queryClient = useQueryClient();
  const kok = useRef<HTMLDivElement>(null);

  const sayi = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    // Bildirim gece üretiliyor; sık sormanın faydası yok.
    refetchInterval: 5 * 60_000,
  });

  const liste = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get<Sayfa<Bildirim>>('/notifications?limit=20'),
    enabled: acik,
  });

  const okundu = useMutation({
    mutationFn: (id: string) => api.patch<void>(`/notifications/${id}/read`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const hepsiOkundu = useMutation({
    mutationFn: () => api.post<void>('/notifications/read-all'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Panel dışına tıklayınca kapanıyor; Escape de kapatıyor.
  useEffect(() => {
    if (!acik) {
      return;
    }

    function disaridaTiklandi(olay: MouseEvent) {
      if (kok.current !== null && !kok.current.contains(olay.target as Node)) {
        setAcik(false);
      }
    }
    function tusaBasildi(olay: KeyboardEvent) {
      if (olay.key === 'Escape') {
        setAcik(false);
      }
    }

    document.addEventListener('mousedown', disaridaTiklandi);
    document.addEventListener('keydown', tusaBasildi);
    return () => {
      document.removeEventListener('mousedown', disaridaTiklandi);
      document.removeEventListener('keydown', tusaBasildi);
    };
  }, [acik]);

  const okunmamis = sayi.data?.count ?? 0;
  const bildirimler = liste.data?.data ?? [];

  return (
    <div ref={kok} className="relative">
      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        aria-label={
          okunmamis > 0 ? `Bildirimler, ${okunmamis} okunmamış` : 'Bildirimler'
        }
        className="relative rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <ZilSimgesi />
        {okunmamis > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white tabular-nums">
            {okunmamis > 9 ? '9+' : okunmamis}
          </span>
        )}
      </button>

      {acik && (
        <div className="absolute right-0 z-10 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <span className="text-sm font-medium">Bildirimler</span>
            {okunmamis > 0 && (
              <button
                type="button"
                onClick={() => hepsiOkundu.mutate()}
                className="text-xs text-marka-600 hover:underline"
              >
                Hepsini okundu say
              </button>
            )}
          </div>

          {liste.isPending && (
            <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Yükleniyor…
            </p>
          )}

          {!liste.isPending && bildirimler.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Henüz bildirim yok.
            </p>
          )}

          <ul className="max-h-96 divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
            {bildirimler.map((bildirim) => (
              <li key={bildirim.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (bildirim.readAt === null) {
                      okundu.mutate(bildirim.id);
                    }
                  }}
                  className="flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  {/* Okunmamışı renkle değil, hem nokta hem kalın yazıyla
                      ayırıyoruz: rengi ayırt edemeyen kullanıcı da görsün. */}
                  <span
                    aria-hidden
                    className={[
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      bildirim.readAt === null
                        ? 'bg-marka-500'
                        : 'bg-transparent',
                    ].join(' ')}
                  />
                  <span className="min-w-0">
                    <span
                      className={[
                        'block text-sm',
                        bildirim.readAt === null
                          ? 'font-semibold'
                          : 'text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {bildirim.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      {bildirim.body}
                    </span>
                    <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                      {zamanYaz(bildirim.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ZilSimgesi() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/** "3 saat önce" — mutlak zaman damgası bildirimde okunması zor. */
function zamanYaz(iso: string): string {
  const gecen = Date.now() - new Date(iso).getTime();
  const dakika = Math.floor(gecen / 60_000);

  if (dakika < 1) return 'az önce';
  if (dakika < 60) return `${dakika} dakika önce`;

  const saat = Math.floor(dakika / 60);
  if (saat < 24) return `${saat} saat önce`;

  const gun = Math.floor(saat / 24);
  if (gun < 7) return `${gun} gün önce`;

  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}
