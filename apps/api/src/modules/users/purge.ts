/**
 * Silinmiş hesabın kalıcı temizlenmesine kadar geçen süre.
 *
 * Kendi modülünde, çünkü üç ayrı yer aynı sayıyı kullanıyor: hesabı silen
 * servis (kullanıcıya söylenen tarih), günlük temizlik işi (kaydı gerçekten
 * silen taraf) ve giriş ucu (silmeyi geri alıp almayacağına karar veren
 * taraf). Bu dosya hiçbir şey `import` etmiyor; sabit `users.service.ts`
 * içinde kalsaydı giriş ucu onu okumak için kullanıcı servisine bağlanacak
 * ve döngüsel bir bağımlılık doğacaktı.
 *
 * İki yerde ayrı sabit tutmak, kullanıcıya söylenen süre ile gerçekte
 * beklenen sürenin sessizce ayrışması demek olurdu.
 */
export const PURGE_AFTER_DAYS = 30;

/**
 * Silinmiş bir hesabın geri getirilme penceresi kapandı mı.
 *
 * Silinmemiş hesap için `false`: soru zaten sorulmuyor.
 */
export function geriGetirmeSuresiDoldu(deletedAt: Date | null): boolean {
  if (deletedAt === null) {
    return false;
  }
  return Date.now() - deletedAt.getTime() > PURGE_AFTER_DAYS * 86_400_000;
}
