# Mimari kararlar

Her karar: **bağlam** (neyi çözüyoruz), **karar**, **sonuç** (neyi kabul ettik).
Bir kararı değiştirmek isteyen önce buradaki gerekçeyi çürütmeli.

---

## ADR-0001 · Modüler monolit, microservice değil

**Bağlam.** Tek geliştirici, tek veritabanı, henüz kullanıcı yok.

**Karar.** Tek deploy edilebilir NestJS uygulaması; sınırlar modül seviyesinde.

**Sonuç.** Dağıtık sistem maliyetini (ağ hatası, dağıtık işlem, sürüm uyumu,
çoklu deploy) ödemiyoruz. Karşılığında yatay ölçekleme parça bazında değil bütün
olarak yapılıyor — bu ölçekte sorun değil. Modül sınırları katı tutulduğu için
ileride bir modülü ayırmak mümkün.

---

## ADR-0002 · Para: tamsayı minor unit

**Bağlam.** Para hesabında float hatası kabul edilemez. Çoklu para birimi var,
kur dönüşümü ileride gelecek.

**Karar.** `BIGINT` minor unit + ISO 4217 kodu. `NUMERIC` değil, `float` hiç
değil.

**Sonuç.** JSON'da kayıpsız taşınıyor, JS tarafında decimal kütüphanesi
gerekmiyor, Prisma'nın `Decimal` tipiyle uğraşmıyoruz. Karşılığında her tutar
para birimi koduyla birlikte taşınmak zorunda ve ondalık basamak sayısı koddan
türetilmeli — JPY 0, KWD 3 basamaklı.

---

## ADR-0003 · Oturum: opak token + Postgres, JWT değil

**Bağlam.** "Hesabımı sil", "şifremi değiştir", "diğer oturumları kapat"
akışları var. İleride mobil uygulama gelebilir.

**Karar.** Opak token, Postgres'te; ham token değil SHA-256 özeti saklanır.
Tarayıcıda `httpOnly` cookie, mobilde `Authorization: Bearer` — **aynı oturum
kaydı**, farklı taşıma.

**Sonuç.** İptal anında etkili. XSS ile token okunamıyor (cookie `httpOnly`).
Karşılığında her istekte bir veritabanı okuması var — indeksli tekil arama,
ölçeğimizde önemsiz.

**Neden JWT değil:** JWT'nin tek gerçek avantajı durumsuzluk. Anında iptal
gerektiren akışlarımız var; JWT'de bunu doğru yapmak kara liste tutmayı
gerektiriyor, o da durumsuzluğu ortadan kaldırıyor. "Mobil varsa JWT gerekir"
yaygın ama yanlış — taşıma başlığı ile cookie arasındaki fark, token'ın
biçiminden bağımsız.

---

## ADR-0004 · İş kuyruğu Postgres'te, Redis yok

**Bağlam.** Bir günlük iş var (hatırlatma taraması). Ücretsiz Redis
katmanlarının komut kotası aylık 500 bin.

**Karar.** `pg-boss` (Postgres tabanlı kuyruk). Redis yok. Zamanlayıcı GitHub
Actions cron.

**Sonuç.** Bir servis, bir bağımlılık, bir hata kaynağı eksildi. Ücretsiz
katmanla uyumlu: BullMQ boştayken bile Redis'i saniyede yokluyor, bu ayda ~2,5
milyon komut eder ve kotayı beşe katlayarak aşar. Karşılığında kuyruk
performansı Redis'e göre düşük — bizim yükümüz günde birkaç iş, fark
ölçülemez.

Zamanlayıcının dışarıda olması ek bir fayda sağlıyor: ücretsiz barındırma
uykuya geçtiğinde sunucu içi cron tetiklenmez, GitHub Actions tetiklenir.

---

## ADR-0005 · TypeScript 6, 7 değil

**Bağlam.** TypeScript 7.0 (Go tabanlı derleyici) 8 Temmuz 2026'da GA oldu,
derleme ~10 kat hızlı.

**Karar.** `typescript@6.0.3`'e sabitle.

**Sonuç.** TS 7'nin kararlı programatik API'si yok; `typescript-eslint@8.67`'in
peer aralığı `>=4.8.4 <6.1.0`, yani TS 7 ile lint çalışmıyor. CI'daki lint
adımı kırılırdı. Kararlı API'nin geldiği 7.1 (~Ekim 2026) sonrası tek PR'lık
geçiş yapılacak.

---

## ADR-0006 · `subscription_occurrences` tablosu MVP'de

**Bağlam.** Hatırlatmaların iki kez gönderilmemesi gerekiyor. İleride banka
entegrasyonu planlanıyor.

**Karar.** Beklenen her ödeme ayrı satır; `UNIQUE (subscription_id, due_date)`
ve bildirimlerde `UNIQUE (user_id, type, occurrence_id)`.

**Sonuç.** Idempotency uygulama kodunda değil **veritabanı kısıtında** —
uygulama kontrolü yarış koşullarında sızdırır, kısıt sızdırmaz. Aynı tablo
ileride gerçek banka işlemlerinin eşleşeceği yer olacak; onsuz banka
entegrasyonu şema göçü gerektirirdi. Karşılığında bir tablo ve bir üretim işi
fazladan bakım.

---

## ADR-0007 · Toplamlar para birimi başına

**Bağlam.** Kullanıcının ₺ ve $ abonelikleri olabilir; MVP'de kur dönüşümü yok.

**Karar.** `totals` alanı **liste** döner, skaler değil.

**Sonuç.** Uydurma bir toplam üretmiyoruz. Kur dönüşümü geldiğinde yanına
`converted` bloğu eklenir; mevcut alanlar değişmez, istemciler kırılmaz. Skaler
dönüp sonradan listeye çevirmek kırıcı bir API değişikliği olurdu.

---

## ADR-0008 · Yetki kontrolü repository katmanında

**Bağlam.** IDOR, bu uygulamanın en yüksek riskli açığı — kullanıcı verisi
kişisel finans.

**Karar.** `userId` filtresi repository seviyesinde zorunlu; filtresiz sorgu
tip seviyesinde yazılamıyor.

**Sonuç.** Controller'da unutulan bir kontrol tüm veriyi açardı ve kod
incelemesinde gözden kaçardı. Repository'de unutmak derleme hatası veriyor.
Güvenliği insan dikkatine değil derleyiciye bağlıyoruz. Karşılığında repository
arayüzü biraz daha tören gerektiriyor.

---

## ADR-0009 · Sonraki tarih çapadan hesaplanır

**Bağlam.** Aylık abonelikte 31 Ocak + 1 ay = 28 Şubat (ay sonu kırpması).

**Karar.** `occurrence(n) = start_date + (n × döngü)` — zincirleme değil.

**Sonuç.** Zincirleme hesapta kırpma kalıcı hâle gelir: 31 Oca → 28 Şub → 28
Mar (yanlış). Çapadan hesapta 31 Oca + 2 ay = 31 Mar (doğru). Karşılığında
hesap her seferinde başlangıçtan yapılır — maliyeti yok.

---

## ADR-0010 · Doğrulama pipe'ı yalnızca gövde ve sorguya bakar

**Bağlam.** `@UsePipes()` metot seviyesinde yazıldığında Nest pipe'ı handler'ın
bütün parametrelerine uyguluyor — `@CurrentUser()` gibi özel dekoratörler
dahil.

**Karar.** `ZodValidationPipe` `ArgumentMetadata.type` değeri `body` ya da
`query` değilse değeri dokunmadan geçiriyor.

**Sonuç.** Pipe nereye takılırsa takılsın yalnızca kullanıcıdan gelen veriye
bakıyor. Bu davranış canlı denemede yakalandı: gövde kusursuzken istek "bütün
alanlar eksik" diye reddediliyordu, çünkü şema oturum nesnesini doğrulamaya
çalışıyordu. Tip süzgeci olmadan aynı hata her yeni denetleyicide tekrar
edebilirdi.

---

## ADR-0011 · HTTP kurulumu `main.ts` dışında

**Bağlam.** Global prefix, cookie eklentisi, hata filtresi ve CORS `main.ts`
içindeydi. Entegrasyon testi kendi uygulamasını kurduğu için bunları almıyor,
üretimden farklı davranan bir uygulamayı test ediyordu.

**Karar.** Kurulum `app.setup.ts` içindeki `configureApp()` fonksiyonunda;
hem `main.ts` hem testler onu çağırıyor.

**Sonuç.** "Testte geçti ama üretimde farklı" sınıfı ortadan kalkıyor. Bu da
gerçek bir hatayla ortaya çıktı: test uygulamasında `ProblemFilter` olmadığı
için hata yanıtları RFC 9457 biçiminde değildi ve doğrulama testi yanlış
yerde patladı.

---

## ADR-0012 · Sistem kategorilerinin tekilliği kısmi indeksle

**Bağlam.** `@@unique([userId, slug])` sistem kategorilerini kapsamıyor:
onlarda `userId` NULL ve Postgres NULL'ları birbirinden farklı sayıyor. Aynı
slug'la iki sistem kategorisi eklenebildiği ölçüldü.

**Karar.** `CREATE UNIQUE INDEX ... ON categories(slug) WHERE "userId" IS NULL`
— elle yazılmış migration, çünkü Prisma şeması kısmi indeks ifade edemiyor.

**Sonuç.** Tohumlama scripti idempotent olabiliyor ve katalog bozulamıyor.
Karşılığında şemayla migration arasında Prisma'nın bilmediği bir fark var;
schema.prisma'ya bunu anlatan bir yorum bırakıldı.
