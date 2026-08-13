/**
 * Silinen bir kaydın kalıcı olarak temizlenmesine kadar geçen süre.
 *
 * ## Neden ortak pakette
 *
 * Bu sayı üç ayrı yerde **karar veriyor**: hesabı silen servis (kullanıcıya
 * söylenen tarihi hesaplıyor), günlük temizlik işi (kaydı gerçekten siliyor)
 * ve giriş ucu (silmeyi geri alıp almayacağına bakıyor). Bir de arayüzde,
 * kullanıcıya "kaç gün içinde geri getirebilirsin" diye **yazıyor**.
 *
 * Önce yalnızca sunucuda duruyordu ve arayüz sayıyı cümlenin içine elle
 * yazıyordu ("30 gün içinde geri getirebilirsin"). Süre değiştiğinde
 * davranış değişir ama ekrandaki söz eski kalırdı — kullanıcıya tutmadığımız
 * bir şey söylemiş olurduk. O yüzden sayı burada: hem sunucu hem arayüz
 * aynı yerden okuyor.
 *
 * Kapsamı **hem hesap hem abonelik silme**. İkisi için ayrı süre tutmak,
 * kullanıcının kafasında iki farklı kural demek olurdu; "silinen şey N gün
 * duruyor" tek cümlede anlatılabiliyor.
 */
export const PURGE_AFTER_DAYS = 10;

/**
 * Silinmiş bir kaydın geri getirilme penceresi kapandı mı.
 *
 * Silinmemiş kayıt için `false`: soru zaten sorulmuyor.
 */
export function geriGetirmeSuresiDoldu(deletedAt: Date | null): boolean {
  if (deletedAt === null) {
    return false;
  }
  return Date.now() - deletedAt.getTime() > PURGE_AFTER_DAYS * 86_400_000;
}
