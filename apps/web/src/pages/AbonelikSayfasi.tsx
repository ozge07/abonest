import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AbonelikFormu } from '../components/AbonelikFormu';
import { Dugme } from '../components/form';
import { api } from '../lib/api';
import { donguYaz, paraYaz, tarihYaz } from '../lib/money';
import type { Abonelik, Sayfa } from '../lib/types';

export function AbonelikSayfasi() {
  const [formAcik, setFormAcik] = useState(false);
  const queryClient = useQueryClient();

  const sorgu = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => api.get<Sayfa<Abonelik>>('/subscriptions'),
  });

  const durumDegistir = useMutation({
    mutationFn: ({ id, eylem }: { id: string; eylem: string }) =>
      api.post<Abonelik>(`/subscriptions/${id}/${eylem}`),
    onSuccess: async () => {
      // Özet de değişiyor: iptal edilen abonelik toplamdan düşmeli.
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const abonelikler = sorgu.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Abonelikler</h1>
        <Dugme onClick={() => setFormAcik(true)}>Yeni abonelik</Dugme>
      </div>

      {formAcik && (
        <AbonelikFormu
          onKapat={() => setFormAcik(false)}
          onKaydedildi={() => setFormAcik(false)}
        />
      )}

      {sorgu.isPending && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</p>
      )}

      {/*
        * İlk kez giren kullanıcı buraya düşüyor (özet boşken oraya
        * yönlendiriliyor). Boş bir liste yerine ne yapması gerektiğini
        * söyleyen bir ekran görüyor.
        */}
      {!sorgu.isPending && abonelikler.length === 0 && !formAcik && (
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <h2 className="text-base font-semibold">İlk aboneliğini ekle</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600 dark:text-slate-400">
            Netflix, spor salonu, internet — ne ödüyorsan ekle. Ayda ne kadar
            gittiğini ve sırada hangi ödemenin olduğunu buradan takip
            edeceksin.
          </p>
          <div className="mt-5">
            <Dugme onClick={() => setFormAcik(true)}>Abonelik ekle</Dugme>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {abonelikler.map((abonelik) => (
          <li
            key={abonelik.id}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate font-medium">{abonelik.name}</h2>
                  <DurumRozeti durum={abonelik.status} />
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {abonelik.category.name} ·{' '}
                  {donguYaz(abonelik.billingCycle, abonelik.customIntervalDays)}
                </p>
                {abonelik.nextPaymentDate !== null && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Sonraki ödeme: {tarihYaz(abonelik.nextPaymentDate)}
                  </p>
                )}
              </div>

              <div className="text-right">
                <p className="font-semibold tabular-nums">
                  {paraYaz(abonelik.priceMinor, abonelik.currency)}
                </p>
                {abonelik.billingCycle !== 'MONTHLY' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ayda{' '}
                    {paraYaz(abonelik.monthlyEquivalentMinor, abonelik.currency)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {abonelik.status === 'ACTIVE' && (
                <>
                  <KucukDugme
                    onClick={() =>
                      durumDegistir.mutate({ id: abonelik.id, eylem: 'pause' })
                    }
                  >
                    Duraklat
                  </KucukDugme>
                  <KucukDugme
                    onClick={() =>
                      durumDegistir.mutate({ id: abonelik.id, eylem: 'cancel' })
                    }
                  >
                    İptal et
                  </KucukDugme>
                </>
              )}
              {(abonelik.status === 'PAUSED' ||
                abonelik.status === 'CANCELLED') && (
                <KucukDugme
                  onClick={() =>
                    durumDegistir.mutate({ id: abonelik.id, eylem: 'resume' })
                  }
                >
                  Devam ettir
                </KucukDugme>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DurumRozeti({ durum }: { durum: Abonelik['status'] }) {
  if (durum === 'ACTIVE') {
    return null;
  }

  const metin = {
    PAUSED: 'duraklatıldı',
    CANCELLED: 'iptal edildi',
    EXPIRED: 'süresi doldu',
  }[durum];

  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {metin}
    </span>
  );
}

function KucukDugme({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
