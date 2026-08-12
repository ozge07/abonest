import { useState } from 'react';
import { alanHatasi } from '@abonelik/shared';
import type { ZodType } from 'zod';

/**
 * Tek bir form alanı: değer, dokunulma durumu ve gösterilecek hata.
 *
 * ## Hata ne zaman görünüyor
 *
 * Üç kural birlikte çalışıyor:
 *
 * 1. **Yazarken kızarmıyor.** Kullanıcı e-postasını yazmaya başladığı anda
 *    "geçerli bir adres gir" demek, henüz bitirmediği bir işi yanlış ilan
 *    etmek olur. Hata ancak alandan çıkınca ya da gönderme denenince
 *    görünüyor.
 * 2. **Düzeltilince anında kayboluyor.** Değer geçerli hâle geldiğinde
 *    kırmızı çerçeve ve mesaj gidiyor; gönderme tuşunu beklemiyor.
 * 3. **Sunucu hatası değer değişince bayatlıyor.** "Bu e-posta zaten
 *    kayıtlı" gibi yalnızca sunucunun bilebileceği hatalar var; kullanıcı
 *    adresi değiştirdiği anda o hata artık o değer hakkında değil.
 *
 * Kurallar ortak pakette (`@abonelik/shared`), sunucununkiyle aynı. İkisi
 * ayrı yazılsaydı kullanıcı formda yeşil ışık görüp sunucudan hata yerdi.
 */
export function useAlan(sema: ZodType<unknown>, sunucuHatasi?: string) {
  const [deger, setDeger] = useState('');
  const [dokunuldu, setDokunuldu] = useState(false);
  /** Sunucu hatasının ait olduğu değer; değişince hata bayatlıyor. */
  const [hataliDeger, setHataliDeger] = useState<string | null>(null);

  // Sunucudan yeni bir hata geldiyse hangi değere ait olduğunu not ediyoruz.
  if (sunucuHatasi !== undefined && hataliDeger === null) {
    setHataliDeger(deger);
  }
  if (sunucuHatasi === undefined && hataliDeger !== null) {
    setHataliDeger(null);
  }

  const yerelHata = alanHatasi(sema, deger);
  const sunucuHalaGecerli =
    sunucuHatasi !== undefined && hataliDeger === deger;

  return {
    deger,
    hata: dokunuldu
      ? (yerelHata ?? (sunucuHalaGecerli ? sunucuHatasi : undefined))
      : sunucuHalaGecerli
        ? sunucuHatasi
        : undefined,
    /** Alan geçerli mi — gönderme tuşunu kilitlemek için değil, bilgi için. */
    gecerli: yerelHata === undefined,
    bagla: {
      value: deger,
      onChange: (olay: { target: { value: string } }) => {
        setDeger(olay.target.value);
      },
      // Alandan çıkınca hata görünür hâle geliyor: yazarken değil.
      onBlur: () => {
        setDokunuldu(true);
      },
    },
    /** Gönderme denendiğinde çağrılıyor; bekleyen hataları görünür kılıyor. */
    gonderildi: () => {
      setDokunuldu(true);
    },
  };
}
