// `toBeInTheDocument`, `toHaveAttribute` gibi DOM iddiaları.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * Her testten sonra DOM temizleniyor.
 *
 * Testing Library bunu `globals: true` ile kendiliğinden yapıyor; bu projede
 * global'ler kapalı olduğu için elle bağlanması gerekiyor. Bağlanmadığında
 * önceki testin ekranı belgede kalıyor ve `getByLabelText` yanlış — eski —
 * alanı buluyor. Hata da kodda değil testte olduğu için insanı yanlış yere
 * bakmaya götürüyor.
 */
afterEach(cleanup);

/*
 * `matchMedia` jsdom'da yok.
 *
 * Uygulama bunu hareket tercihini okumak için kullanıyor; tanımsızken
 * giriş ekranı çöküyordu. Varsayılan olarak "hareket açık" diyoruz, yani
 * testler kullanıcıların büyük çoğunluğunun gördüğü yolu koşuyor. Azaltma
 * davranışını sınayan test bu değeri kendi değiştiriyor.
 */
if (window.matchMedia === undefined) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/*
 * jsdom canvas çizemiyor.
 *
 * `getContext` çağrıldığında "Not implemented" uyarısı basıyor ve test
 * çıktısı her çalıştırmada onlarca satır gürültüyle doluyor — gerçek bir
 * hata mesajı arasında kaybolur. Burada sessizce `null` dönüyoruz;
 * parçacık küresi zaten bu durumu karşılayıp çizmekten vazgeçiyor, yani
 * sahte bir bağlam uydurmaya gerek yok.
 *
 * Kürenin çizim mantığı tarayıcıda ekran görüntüsüyle doğrulanıyor;
 * jsdom'da sınanacak bir şey yok.
 */
HTMLCanvasElement.prototype.getContext = () => null;
