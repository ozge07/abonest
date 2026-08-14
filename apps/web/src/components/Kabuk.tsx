import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useLocation } from 'react-router';
import { UYGULAMA_ADI } from '../lib/marka';
import { useCikis, useOturum } from '../lib/oturum';
import { api } from '../lib/api';
import type { Ozet } from '../lib/types';
import { BildirimZili } from './BildirimZili';
import { Imlec, Izgara } from '../sahne/Katmanlar';

/** Giriş yapmış kullanıcının gördüğü çerçeve: başlık, gezinme, içerik. */
export function Kabuk({ children }: { children: ReactNode }) {
  const { kullanici } = useOturum();
  const cikis = useCikis();
  const konum = useLocation();

  /*
   * Özet sekmesi, gösterecek bir şey olmadan görünmüyor.
   *
   * Aboneliği olmayan kullanıcı zaten Özet'e girse abonelikler ekranına
   * yönlendiriliyordu — yani sekme tıklanabilir ama hiçbir yere
   * götürmüyordu. Görünen ama işe yaramayan bir sekme, kullanıcıya
   * "burada bir şey var" deyip yalan söylüyor.
   *
   * Sorgu ana ekranınkiyle aynı anahtarı kullanıyor: iki ayrı istek
   * atmıyoruz, TanStack aynı veriyi paylaşıyor.
   */
  const ozet = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Ozet>('/dashboard'),
  });
  const abonelikVar = (ozet.data?.activeCount ?? 0) > 0;

  /*
   * Girişten hemen sonra uygulama yukarıdan kayarak beliriyor; kırılma
   * animasyonunun son adımı bu. Not `sessionStorage`'da, çünkü giriş
   * ekranı bu noktada sökülmüş oluyor ve React durumu onunla birlikte
   * kayboluyor.
   *
   * Bir kez oynuyor: her sayfa açılışında tekrarlarsa süsleme olmaktan
   * çıkıp gecikme gibi hissediliyor.
   */
  const [girisAnimasyonu] = useState(
    () => sessionStorage.getItem('kabuk-girisi') !== null,
  );
  useEffect(() => {
    sessionStorage.removeItem('kabuk-girisi');
  }, []);

  return (
    <div
      className={[
        'min-h-dvh text-slate-900 dark:text-slate-100',
        girisAnimasyonu ? 'kabuk-girisi' : '',
      ].join(' ')}
    >
      {/*
        Hikâyedeki mimari ızgara ve özel imleç burada da var: iki ekran
        arasında geçerken görsel dil değişmiyor. Izgara `pointer-events`
        geçiriyor, içeriğe tıklamayı engellemiyor.
      */}
      <Izgara dar={false} arkada />
      <Imlec />

      {/*
        * Buzlu cam: tema arka planı başlığın altından geçiyor ve sayfa
        * kaydırıldıkça hafifçe değişiyor. Opak bir şerit temayı ikiye
        * bölüyordu.
        */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
        {/*
          * Dar ekranda taşmayan başlık.
          *
          * Önce tek bir esnemez satırdı: dört bağlantı, marka adı ve sağdaki
          * düğmeler 390 pikselde sığmıyor, satır sayfayı kendinden geniş
          * yapıyordu. Sonuç yalnızca başlığın kesilmesi değildi — bütün
          * sayfa yana kayıyor ve listedeki tutarlar sağdan kırpılıyordu.
          * Telefonda ölçüldü.
          *
          * Üç kural birlikte çözüyor: marka adı dar ekranda gizleniyor
          * (logo kalıyor), gezinme kalan yeri alıp gerektiğinde **yatay
          * kayıyor**, sağdaki düğmeler küçülmüyor. Kaydırmayı sarma
          * (`flex-wrap`) yerine seçtik: sarma başlığı iki satıra çıkarıp
          * içeriği aşağı itiyordu.
        */}
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:gap-6">
          <NavLink to="/" className="flex shrink-0 items-center gap-2">
            <img
              src="/logo.svg?v=3"
              alt=""
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="hidden text-base font-semibold sm:inline">
              {UYGULAMA_ADI}
            </span>
          </NavLink>

          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {/*
              Hikâye en solda: girişten sonra ilk gelinen yer orası,
              gezinmedeki sırası da bunu yansıtıyor.
            */}
            <Baglanti to="/hikaye">Hikâye</Baglanti>
            {abonelikVar && <Baglanti to="/">Özet</Baglanti>}
            <Baglanti to="/abonelikler">Abonelikler</Baglanti>
            <Baglanti to="/analiz">Analiz</Baglanti>
            {/*
              * Hesap ayarları gezinmede açıkça duruyor. Yalnızca kullanıcı
              * adına gizlenmiş bir bağlantı olsaydı, hesabını silmek isteyen
              * kullanıcı nereye tıklayacağını bulamazdı — bulamadı da.
              */}
            <Baglanti to="/hesap">Hesabım</Baglanti>
          </nav>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <BildirimZili />
            <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
              {kullanici?.name}
            </span>
            <button
              type="button"
              onClick={() => cikis.mutate()}
              disabled={cikis.isPending}
              className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      {/*
        `key` yol adı: sekme değişince React içeriği yeniden kuruyor ve
        giriş animasyonu tekrar oynuyor. Anahtar olmadan aynı düğüm
        korunuyor ve geçiş hiç görünmüyordu.
      */}
      <main key={konum.pathname} className="sayfa-icerigi mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}

function Baglanti({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-marka-100 text-marka-700 dark:bg-marka-700/20 dark:text-marka-100'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        ].join(' ')
      }
    >
      {children}
    </NavLink>
  );
}
