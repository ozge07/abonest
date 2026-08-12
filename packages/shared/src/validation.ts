import { z } from 'zod';

/**
 * Kullanıcı girdisi kuralları — **tek kaynak.**
 *
 * Sunucu ve arayüz aynı şemaları kullanıyor. Kopyalansaydı biri
 * değiştiğinde diğeri sessizce eski kalırdı: kullanıcı formda yeşil ışık
 * görüp sunucudan hata yerdi ya da tersi.
 *
 * **Bu, sunucunun istemciye güvendiği anlamına gelmiyor.** Arayüzdeki
 * doğrulama yalnızca kullanıcı deneyimi — hatayı gönderme tuşuna basmadan
 * göstermek için. Güvenlik kararı her zaman sunucuda, `ZodValidationPipe`
 * içinde veriliyor.
 */

/**
 * Şifre alt sınırı.
 *
 * Uzunluk tek başına karmaşıklık kurallarından daha etkili: "en az bir büyük
 * harf, bir rakam, bir sembol" gibi kurallar kullanıcıyı `Parola1!` yazmaya
 * itiyor — tahmin edilmesi kolay bir kalıp.
 *
 * Bu değer ürün kararıyla 6'ya indirildi. Kısa şifre kaba kuvvete daha açık;
 * buradaki asıl koruma giriş ucundaki hız sınırı (IP başına dakikada 10,
 * hesap başına ayrıca) ve Argon2id'nin yavaşlığı oluyor.
 */
export const SIFRE_MIN = 6;

/** Üst sınır bir DoS önlemi: Argon2 girdiyi bellekte işliyor. */
export const SIFRE_MAX = 200;

export const AD_MIN = 3;
export const AD_MAX = 100;

export const sifreAlani = z
  .string()
  .min(SIFRE_MIN, `Şifre en az ${SIFRE_MIN} karakter olmalı`)
  .max(SIFRE_MAX, 'Şifre çok uzun');

export const epostaAlani = z
  .string()
  .trim()
  .toLowerCase()
  .email('Geçerli bir e-posta adresi gir')
  .max(254, 'E-posta adresi çok uzun'); // RFC 5321 üst sınırı

export const adAlani = z
  .string()
  .trim()
  .min(AD_MIN, `Ad en az ${AD_MIN} karakter olmalı`)
  .max(AD_MAX, 'Ad çok uzun');

/**
 * Tek bir alanı doğrulayıp hata mesajını döndürüyor; geçerliyse `undefined`.
 *
 * Arayüz bunu her tuş vuruşunda çağırıyor: kullanıcı geçerli bir değer
 * yazdığı anda kırmızı çerçeve ve mesaj kayboluyor, gönderme tuşunu
 * beklemiyor.
 */
export function alanHatasi(
  sema: z.ZodType<unknown>,
  deger: unknown,
): string | undefined {
  const sonuc = sema.safeParse(deger);
  return sonuc.success ? undefined : sonuc.error.issues[0]?.message;
}
