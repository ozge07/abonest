import { type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Alan, Dugme, HataKutusu } from '../components/form';
import { ApiError, api } from '../lib/api';
import { useAlan } from '../lib/alan';
import { useCikis, useOturum } from '../lib/oturum';

/**
 * E-posta doğrulama ekranı.
 *
 * ## Neden bütün uygulamayı kapatıyor
 *
 * Doğrulanmamış kullanıcı hiçbir veri ucuna erişemiyor — hepsi `403`
 * dönüyor. Uygulamayı gezdirip her ekranda hata göstermek, kullanıcıya
 * "bozuk" hissi veriyor ve **ne yapması gerektiğini söylemiyor**.
 *
 * Bu ekran somut bir şikâyetten doğdu: kullanıcı kayıt oldu, abonelik
 * formunu doldurdu, kaydete bastı ve "Önce e-posta adresini doğrulaman
 * gerekiyor" yazısını gördü — nereden doğrulayacağına dair hiçbir yol
 * yokken. Emeği de boşa gitti.
 */
const kodAlani = z.string().trim().min(1, 'Kodu yapıştır');

export function DogrulamaSayfasi() {
  const { kullanici } = useOturum();
  const cikis = useCikis();
  const queryClient = useQueryClient();

  const dogrula = useMutation({
    mutationFn: (token: string) =>
      api.post<void>('/auth/verify-email', { token }),
    onSuccess: async () => {
      // `/me` yeniden okunuyor; `emailVerifiedAt` dolunca uygulama açılıyor.
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const tekrarGonder = useMutation({
    mutationFn: () =>
      api.post<{ deliveredToInbox: boolean }>('/auth/resend-verification'),
  });

  const hata = dogrula.error;
  const sunucuHatalari = hata instanceof ApiError ? hata.alanHatalari : {};
  const kod = useAlan(kodAlani, sunucuHatalari['token']);

  function gonder(olay: FormEvent) {
    olay.preventDefault();
    kod.gonderildi();
    if (!kod.gecerli) {
      return;
    }
    dogrula.mutate(kod.deger.trim());
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            E-posta adresini doğrula
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium">{kullanici?.email}</span> adresine bir
            doğrulama kodu gönderdik. Aboneliklerini eklemeye başlamak için o
            kodu buraya yapıştır.
          </p>
        </div>

        <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <form onSubmit={gonder} noValidate className="flex flex-col gap-4">
            {hata instanceof ApiError && hata.problem.errors === undefined && (
              <HataKutusu mesaj={hata.problem.title} />
            )}

            <Alan
              etiket="Doğrulama kodu"
              name="token"
              autoComplete="one-time-code"
              autoFocus
              required
              hata={kod.hata}
              {...kod.bagla}
            />

            <Dugme type="submit" bekliyor={dogrula.isPending}>
              Doğrula
            </Dugme>
          </form>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Kod gelmediyse gelen kutunu ve spam klasörünü kontrol et.
            </p>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => tekrarGonder.mutate()}
                disabled={tekrarGonder.isPending || tekrarGonder.isSuccess}
                className="text-sm font-medium text-marka-600 hover:underline disabled:text-slate-400 disabled:no-underline"
              >
                {tekrarGonder.isSuccess ? 'Yeni kod gönderildi' : 'Kodu tekrar gönder'}
              </button>

              {tekrarGonder.error instanceof ApiError && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  {tekrarGonder.error.problem.title}
                </span>
              )}
            </div>

            {/*
              * Uyarı **sunucunun** ortamına bakıyor, derleme moduna değil.
              * Derlenmiş arayüzü geliştirme sunucusuyla çalıştırmak olağan
              * ve o durumda `import.meta.env.DEV` kapalı oluyor — uyarı da
              * tam ihtiyaç duyulduğu anda kaybolurdu.
              *
              * Kodun kendisi buraya gelmiyor; yalnızca nerede arayacağı.
              */}
            {tekrarGonder.data?.deliveredToInbox === false && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                Bu sunucu geliştirme modunda: e-posta gerçekten
                gönderilmiyor. Kod, API'yi çalıştırdığın terminalde{' '}
                <code>bu kodu kullan:</code> satırında yazıyor.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => cikis.mutate()}
            className="self-start text-sm text-slate-500 hover:underline dark:text-slate-400"
          >
            Başka bir hesapla giriş yap
          </button>
        </div>
      </div>
    </div>
  );
}
