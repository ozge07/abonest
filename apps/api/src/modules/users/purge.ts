/**
 * Silme penceresi sabitinin sunucu tarafındaki girişi.
 *
 * Değerin kendisi `@abonelik/shared` içinde: arayüz de aynı sayıyı okuyup
 * kullanıcıya "kaç gün içinde geri getirebilirsin" diye yazıyor. İki yerde
 * ayrı tutulsaydı, süre değiştiğinde davranış değişir ama ekrandaki söz
 * eski kalırdı.
 *
 * Bu dosya yalnızca yeniden dışa aktarıyor; başka bir şey `import`
 * etmediği için giriş ucu onu kullanıcı servisine bağlanmadan okuyabiliyor
 * (döngüsel bağımlılık olmuyor).
 */
export { PURGE_AFTER_DAYS, geriGetirmeSuresiDoldu } from '@abonelik/shared';
