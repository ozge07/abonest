# Test yaklaşımı

## Neye göre yazılıyor

Testler kapsam yüzdesini yükseltmek için değil, **yanlış olduğunda pahalıya
mal olacak şeyleri sabitlemek** için yazılıyor. Sıralama şu:

1. Para ve tarih matematiği — hatası kullanıcının cebinden çıkıyor.
2. Yetkilendirme — hatası başkasının verisini açıyor.
3. İdempotentlik — hatası kullanıcıya aynı bildirimi tekrar tekrar
   gönderiyor.
4. Sertleştirme ayarları — sessizce kaybolabilecek türden.
5. Geri kalanı.

## Katmanlar

| Katman | Nerede | Ne sınıyor |
|---|---|---|
| Saf birim | `packages/shared`, `apps/web/src/lib` | Para, tarih, biçimleme. Veritabanı yok, IO yok. |
| Entegrasyon | `apps/api/src/**/*.integration.test.ts` | Gerçek Nest + gerçek Postgres, HTTP katmanından geçerek. |

**Entegrasyon testleri mock kullanmıyor.** Bu projedeki en önemli iddiaların
çoğu — IDOR koruması, tekillik, kısmi indeks — veritabanı kısıtlarına
dayanıyor. Taklit bir depoya karşı test etmek tam da kaçırmak istemediğimiz
katmanı testin dışında bırakırdı.

## Sayılar

```
packages/shared    48 test
apps/api          175 test    kapsam: %92 satır, %72 dal
apps/web          121 test
```

Kapsam eşikleri (`apps/api/vitest.config.ts`) mevcut seviyenin **altında**:
%90 satır, %65 dal. Amaç yüzdeyi yükseltmek değil düşüşü fark etmek. Eşiği tam
mevcut değere koymak, ilgisiz bir düzenlemede CI'ı kırar ve insanı testi değil
eşiği düzeltmeye iter.

## Kapsam yalan söyleyebilir: mutasyon denemesi

Yüzde, testlerin **çalıştığı** satırları sayıyor; **iddia ettiği** şeyleri
değil. Bunu ölçmek için kodu bilerek bozup testlerin fark edip etmediğine
baktık.

| Bozma | Sonuç |
|---|---|
| Para ayrıştırmasını metin yerine kayan nokta çarpımına çevir | ✓ 2 test düştü |
| `gunSayisiYaz`'da negatif gün kontrolünü gevşet | ✓ 1 test düştü |
| Geçersiz tutarda `null` yerine `0` dön | ✓ 1 test düştü |
| Kapsanmış depodan `userId` filtresini kaldır | ✓ IDOR testi düştü |
| `createIfAbsent` çakışmada "oluşturdum" desin | ✗ **hiçbir test düşmedi** |

Sonuncusu gerçek bir boşluktu. Veritabanı kısıtı bildirimi hâlâ tekil
tutuyordu, ama günlük işin **raporladığı** sayı yalan söylüyordu — ve o sayıyı
GitHub Actions çıktısında bir insan okuyup "her şey yolunda mı" kararını
veriyor. `notifications.service.ts` %97 kapsamdaydı; yüzde bunu görmedi.

Boşluk kapatıldı (`daily.integration.test.ts` → "ikinci turda yeni bildirim
sayacı artmıyor") ve aynı mutasyon tekrar denendiğinde test düştü.

## Testlerin bildiği sınırlar

- **Tek veritabanı paylaşılıyor.** Test dosyaları sırayla koşuyor
  (ADR-0016); paralel koşarken günlük işin sayaçlarına başka dosyaların
  verisi karışıyordu.
- **Testler ayrı bir veritabanında koşuyor** (`<veritabanı>_test`); yoksa
  kendisi oluşturup şemayı ve tohumu uyguluyor. Bu ayrım bir olaydan sonra
  eklendi: testler geliştirme veritabanına yazıyordu ve günlük işi sahte bir
  "bugün" ile çağırdıkları için gerçek bir kullanıcının ziline "Netflix
  ödemesi bugün" bildirimi düştü — ödeme 30 gün sonraydı. "Ayrı veritabanı
  kullanmayı unutmayın" bir çözüm değildi; unutulduğunda sessizce gerçek
  veriyi bozuyordu.
- **Hız sınırı bellek içi ve süreç boyunca paylaşılıyor.** Giriş ucu dakikada
  on, `forgot-password` saatte üç istekle sınırlı. Bu yüzden testler oturumu
  ve sıfırlama kodunu çoğunlukla servis üzerinden alıyor; **ucun kendisi**
  konu olduğunda uçtan geçiyorlar.
- **Arayüzde ölçülmeyen şey görünüm.** Bileşen çizimi ve tıklama akışları
  artık Testing Library ile sınanıyor (giriş, çıkış, hesap ekranı, onay
  kutusu, doğrulama). Otomatik sınanmayan şey **düzen**: hangi öğe nerede
  duruyor. Bunlar tarayıcıda ekran görüntüsüyle doğrulanıyor.

  **Dar ekran artık doğrulandı** (390 piksel, telefon genişliği): bütün
  ekranlarda `document.scrollWidth === window.innerWidth`, yani yatay taşma
  yok. Uzun süre "doğrulanmadı" diye duran bu madde iki gerçek hata
  saklıyormuş — başlık çubuğu sığmayıp sayfayı geniş yapıyor, grid öğeleri
  de `min-width: auto` yüzünden içeriklerinden dar olamıyordu. Sonuç:
  telefonda tutarların sağı ekran dışında kalıyordu.

  Ölçüm yönteminin kendisi de bir tuzak çıkardı: `mobile: true` ile
  emülasyonda düzen 436, ekran görüntüsü 390 piksel oluyor ve **CSS'te
  olmayan bir kırpılma görünüyordu**. Doğru okuma `innerWidth` ile
  `scrollWidth` karşılaştırması; ekran görüntüsüne bakarak karar vermek
  yanıltıyor.

  Bu ayrımın bedeli ölçüldü: onay kutusu, `backdrop-filter` taşıyan bir
  kartın içinden açıldığında ekranın çok aşağısında kalıyordu. Bileşen
  testleri geçiyordu, çünkü jsdom düzen hesaplamıyor. Hatayı kullanıcı
  buldu; şimdi kutunun DOM'da kartın dışına çıktığı sınanıyor — düzenin
  kendisi değil, düzeni bozan sebep.
