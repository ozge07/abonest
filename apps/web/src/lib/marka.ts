/**
 * Uygulamanın adı ve markası — **tek yer**.
 *
 * Ad birden çok ekranda, sayfa başlığında ve e-postalarda geçiyor. Her
 * birine ayrı yazılsaydı ad değiştiğinde bir kısmı eskide kalır, kullanıcı
 * iki farklı isim görürdü.
 *
 * Sunucu tarafındaki karşılığı `apps/api/src/infra/marka.ts` içinde: iki
 * paket birbirinin koduna bağlı değil, o yüzden değer iki yerde duruyor ve
 * ikisi de bu yorumla işaretli.
 */
export const UYGULAMA_ADI = 'Abonest';

