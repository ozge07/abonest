/**
 * Testlerin veritabanı adresi.
 *
 * ## Neden ayrı bir veritabanı
 *
 * Testler geliştirme veritabanına yazıyordu ve bu, gerçek verinin üstüne
 * çıktı: günlük iş tasarımı gereği **bütün** aktif abonelikleri tarıyor ve
 * testler onu sahte bir "bugün" ile çağırıyor (`daily.run(gun(2026, 9, 8))`).
 * Sonuç, gerçek bir kullanıcının bildirim ziline düştü — Netflix ödemesi 30
 * gün sonra olduğu hâlde "ödemesi bugün" diyen bir bildirim. Bildirim yanlış
 * değildi; ona verilen tarih sahteydi.
 *
 * "Testleri ayrı veritabanıyla çalıştırmayı unutmayın" demek çözüm değil:
 * unutulduğunda sessizce gerçek veriyi bozuyor. Bu yüzden ayrım varsayılan.
 *
 * `DATABASE_URL` içindeki veritabanı adına `_test` ekleniyor; başka her şey
 * (kullanıcı, parola, sunucu) aynı kalıyor. Böylece ek bir ayar dosyası
 * gerekmiyor. `TEST_DATABASE_URL` verilirse o kullanılıyor.
 */
export function testVeritabaniUrl(url: string): string {
  const adres = new URL(url);
  // pathname "/abonelik_takip" biçiminde.
  const ad = adres.pathname.replace(/^\//, '');
  if (ad === '') {
    throw new Error('DATABASE_URL içinde veritabanı adı yok.');
  }
  if (ad.endsWith('_test')) {
    return url;
  }
  adres.pathname = `/${ad}_test`;
  return adres.toString();
}

/** Aynı sunucudaki bakım veritabanı; `CREATE DATABASE` buradan çalışıyor. */
export function bakimUrl(url: string): string {
  const adres = new URL(url);
  adres.pathname = '/postgres';
  return adres.toString();
}

export function veritabaniAdi(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}
