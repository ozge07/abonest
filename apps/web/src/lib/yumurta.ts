/**
 * Yumurtanın şekli — tek kaynak.
 *
 * Hem giriş ekranındaki parçacık yumurtası hem hikâyedeki 3B kabuk bunu
 * kullanıyor. İki yerde ayrı yazılsaydı biri değiştiğinde diğeri sessizce
 * başka bir yumurta olurdu.
 *
 * ## Oranlar nereden geliyor
 *
 * `logo.svg`'deki yumurtadan ölçüldü — marka simgesiyle **aynı** şey
 * olmalı, ona benzeyen bir şey değil:
 *
 *   genişlik / yükseklik   = 0.864
 *   en geniş yer, tepeden  = %55.5
 *
 * `w(θ) = sin(θ) · (A + B·cos(θ))` bağıntısı ikisini birlikte tutturuyor:
 * `A` genel şişkinliği, `B` asimetriyi veriyor. Aşağıdaki değerler %57.2
 * ve 0.867 üretiyor.
 *
 * `B` **negatif**: `cos(θ)` tepede +1, tabanda −1 olduğu için negatif
 * katsayı tepeyi daraltıp tabanı genişletiyor. İlk yazdığımda artı
 * işaretliydi ve yumurta baş aşağı çıkıyordu — tepesi şişkin, tabanı
 * sivri, damla gibi. Ekran görüntüsünde yakalandı.
 */

/** Genel şişkinlik. */
const YUMURTA_A = 0.9;

/** Asimetri; negatif olmak zorunda, yoksa yumurta ters döner. */
const YUMURTA_B = -0.135;

/** Yüksekliğin yarısı. Toplam yükseklik 2.1, genişlik ≈ 1.82. */
export const YUMURTA_YUKSEKLIK = 1.05;

/**
 * `θ` açısındaki kesit yarıçapı.
 *
 * `θ = 0` tepe, `θ = π` taban. İkisinde de yarıçap sıfır.
 */
export function yumurtaYaricapi(aci: number): number {
  return Math.sin(aci) * (YUMURTA_A + YUMURTA_B * Math.cos(aci));
}
