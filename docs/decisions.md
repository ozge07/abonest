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

---

## ADR-0013 · CSRF token'ı ayrı, okunabilir bir cookie

**Bağlam.** Double-submit kontrolü oturum cookie'sinin kendisiyle yapılıyordu.
O cookie `httpOnly` — tarayıcıdaki JavaScript onu okuyup `x-csrf-token`
başlığına koyamıyor. Yani web istemcisi hiçbir yazma isteği yapamıyordu.

**Karar.** `csrf` adında ikinci bir cookie; oturum token'ından bağımsız
rastgele değer, `httpOnly` **değil**. Guard başlığı bu cookie ile
karşılaştırıyor.

**Sonuç.** Oturum token'ı JavaScript'e kapalı kalıyor (XSS ile çalınamıyor),
CSRF token'ı okunabilir oluyor. Okunabilir olması bir şey kaybettirmiyor:
tek işi "bu istek bizim sayfamızdan mı geldi" sorusunu cevaplamak ve başka
bir origin onu zaten okuyamıyor.

**Nasıl kaçırdık.** Phase 3'te CSRF'i curl ile doğrulamıştım; curl iki değeri
de elle koyabildiği için kontrol geçiyordu. Hata ancak arayüz yazılırken
ortaya çıktı. Bunun tekrarlamaması için `csrf.integration.test.ts` yalnızca
tarayıcının erişebildiği bilgiyle çalışıyor: `httpOnly` cookie'lerin değerini
hiç okumuyor.

---

## ADR-0014 · Dashboard tek uç

**Bağlam.** Ana ekran beş ayrı veri kümesi gösteriyor: toplamlar, yaklaşan
ödemeler, kategori dağılımı, aktif sayısı, bu ay iptal edilenler.

**Karar.** Hepsi tek `GET /dashboard` çağrısında; şekli arayüzün ihtiyacına
göre belirlendi, tablolara göre değil.

**Sonuç.** Yavaş ağda ekran tek seferde doluyor, parça parça dolup düzen
zıplamıyor. Karşılığında bu uç arayüze bağlı: ekran değişirse uç da değişir.
Kabul edilebilir, çünkü tek tüketicisi bizim arayüzümüz.

**Kategori payları para birimi başına.** Farklı para birimlerini tek yüzdede
karıştırmak, kurları bilmeden anlamsız bir oran üretirdi. Arayüz de bu yüzden
listeyi para birimine göre ayırıyor — düz listede aynı kategori iki kez
görünüyor ve %100'lük çubuk "en büyük kalemim" diye okunuyordu.

---

## ADR-0015 · Günlük iş istek içinde koşuyor; pg-boss ertelendi

**ADR-0004'ü kısmen değiştiriyor.**

**Bağlam.** ADR-0004 kuyruk için `pg-boss` seçmişti. Uygulama sırası gelince
şu soru çıktı: tetikleyici işi kuyruğa mı atsın, yoksa doğrudan mı koştursun?

**Karar.** `POST /internal/jobs/daily` işi **istek içinde senkron** koşturuyor.
`pg-boss` şimdilik eklenmedi.

**Gerekçe.** Kuyruk, arkada sürekli çalışan bir işçi süreci gerektiriyor.
ADR-0004'ün kendisi ücretsiz barındırmanın trafik yokken uykuya geçtiğini
söylüyor — bu, kuyruğun temel varsayımını bozuyor: iş kuyruğa atılır, yanıt
döner, süreç uyur ve işi kimse almaz. "Kuyruğa attım" ile "iş koştu" arasındaki
fark sessiz, yani hatırlatma gelmediğinde kimse fark etmez.

Senkron koşturmak bu belirsizliği kaldırıyor: HTTP 200 dönüyorsa iş bitti,
dönmüyorsa GitHub Actions adımı kırmızı yanıyor.

**Karşılığında ne veriyoruz.** Yeniden deneme ve ölü mektup kutusu yok. Bunun
yerine:

- Her adım idempotent; işi tekrar çağırmak zararsız (`workflow_dispatch` ile
  elle tetiklenebiliyor).
- E-posta gönderimi bildirim üretiminden ayrı izleniyor. Gönderim başarısızsa
  `reminderSentAt` boş kalıyor ve ertesi günkü tur tekrar deniyor.
- Tek aboneliğin hatası turu düşürmüyor; loglanıp devam ediliyor ve iş
  "tamamlanmadı" diye raporluyor.
- Parti sınırı (500) tek isteğin sonsuza kadar sürmesini engelliyor.

**Ne zaman geri dönülür.** İş tek istekte bitmemeye başladığında ya da
barındırma sürekli ayakta bir sürece geçtiğinde. O gün `DailyJobService.run()`
olduğu gibi bir kuyruk işçisinin içine taşınır — iş mantığı taşımadan
etkilenmiyor, çünkü tetikleyiciyi hiç bilmiyor.

---

## ADR-0016 · Test dosyaları sırayla koşuyor

**Bağlam.** Entegrasyon testleri tek bir Postgres veritabanını paylaşıyor.
Günlük iş tasarımı gereği **bütün** kullanıcıları tarıyor.

**Karar.** `vitest.config.ts` içinde `fileParallelism: false`.

**Sonuç.** Bir dosyanın ürettiği abonelik başka bir dosyanın sayaçlarına
karışmıyor. Paralel koşarken testler çoğu zaman geçiyor, ara sıra düşüyordu —
ara sıra düşen test hiç olmayandan zararlı, çünkü insanı "yine o bilinen hata"
demeye alıştırıyor. Maliyeti düşük: bütün paket birkaç saniye.

---

## ADR-0017 · Geçmiş harcama takvimden hesaplanır, kayıtlardan değil

**Bağlam.** `/analytics/spending` geçmiş dönemleri raporluyor. İlk akla gelen
kaynak `subscription_occurrences` tablosu — ama o tablo geçmişi kapsamıyor.
Kayıtlar aboneliğin **uygulamaya eklendiği** günden ileriye üretiliyor.

Ölçtük: Ocak'ta başlayıp Ağustos'ta eklenen bir abonelikte en eski kayıt
Ağustos'a ait, yedi ay eksik. Yıllık bir abonelikte ise ilk ödeme 60 günlük
ufkun ötesinde kaldığı için **hiç** kayıt yok.

**Karar.** Ödeme takvimi fatura döngüsünden hesaplanıyor
(`occurrencesBetween`, çapadan). Tutar için: o tarihe ait kayıt varsa oradan
okunuyor — kayıt ödemenin o günkü fiyatını taşıyor — yoksa bugünkü fiyat
kullanılıyor.

**Sonuç.** Kullanıcı "bu yıl ne harcadım" sorusuna dolu bir cevap alıyor.
Kayıtlara dayansaydı cevap makul görünen ama yanlış bir sayı olurdu; en kötü
hata türü, çünkü yanlış olduğu anlaşılmıyor.

**Bilinen sınır.** Fiyatı sonradan değişmiş bir aboneliğin, kayıt bulunmayan
geçmiş dönemleri bugünkü fiyatla hesaplanıyor. Geçmiş fiyat hiçbir yerde
saklanmıyor, dolayısıyla daha iyisi mümkün değil. Uydurmak yerine arayüzde
yazıyoruz. Fiyat geçmişi tutulmaya başlanırsa bu sınır kalkar.

**Yan sonuç: `pausedAt` şemaya eklendi.** Analiz "bu abonelik ne zamana kadar
ödendi" sorusunu cevaplamak zorunda. İptalde `cancelledAt`, bitişte `endDate`
vardı; duraklatmada hiçbir şey yoktu ve duraklatılmış abonelikler ya sonsuza
kadar ödeniyor ya hiç ödenmemiş sayılacaktı. Para raporunda tahmin
yürütmektense tek bir nullable sütun eklemek doğru olan.

---

## ADR-0018 · Vekil güveni varsayılan olarak kapalı

**Bağlam.** `trustProxy: true` koşulsuz açıktı. Fastify istemci IP'sini
`X-Forwarded-For` başlığından okuyor.

**Ölçüm.** Sahte başlıkla arka arkaya dokuz hesap açıldı; kayıt ucunun saatlik
beş sınırı tamamen atlatıldı. Giriş ucu daha az etkileniyordu çünkü e-posta
bazında ikinci bir kova var.

**Karar.** `TRUST_PROXY` ortam değişkeni; varsayılan `false`, yayında vekil
sayısı yazılıyor.

**Sonuç.** Varsayılan güvenli. Yanlış tarafta hata yapmak burada "yayında IP
`::1` görünür ve hız sınırı herkesi tek kovaya koyar" demek — rahatsız edici
ama açık değil. Tersi, sessiz bir açık.

---

## ADR-0019 · Güvenlik başlıkları elle, Helmet'siz

**Bağlam.** Beş güvenlik başlığı eksikti.

**Karar.** `configureApp` içinde `onSend` kancasıyla elle ekleniyor.

**Sonuç.** Bu bir JSON API; Helmet'in değerinin çoğu HTML uygulamalarına
yönelik varsayılanlardan geliyor. Beş satırlık liste, her satırın neden orada
olduğu yazılı ve anlamadığımız bir bağımlılık yok. Karşılığında Helmet'in
ileride ekleyeceği yeni varsayılanları kendiliğinden almıyoruz — liste elle
gözden geçirilecek.

---

## ADR-0020 · Denetim kaydı en iyi çaba

**Bağlam.** `AuditLog` modeli vardı ama hiç yazılmıyordu.

**Karar.** Güvenlik olayları kaydediliyor; **yazma başarısız olursa istek
düşmüyor**, hata loglanıp devam ediliyor.

**Sonuç.** Şifresini değiştiren kullanıcı, denetim tablosu doluysa şifresini
değiştiremez hâle gelmiyor. Karşılığında kayıt eksiksiz değil — denetim
kaydını hukuki delil değil, olay incelemesi aracı olarak konumlandırıyoruz.
Eksiksizlik gerekirse aynı işlemde (transaction) yazmaya geçilir ve o zaman
kullanılabilirlik bedeli kabul edilir.

---

## ADR-0021 · Kapsam eşiği hedef değil, düşüş alarmı

**Bağlam.** Kapsam ölçümü gerçek boşluklar gösterdi (`catalog.service` %44,
`users.service` %50) ve bunlar kapatıldı: %86 → %94 satır.

**Karar.** Eşikler mevcut seviyenin **altında** sabitlendi: %90 satır, %65 dal.

**Sonuç.** Büyük bir düşüş CI'ı kırıyor, normal düzenleme kırmıyor. Eşiği tam
mevcut değere koymak, ilgisiz bir değişiklikte insanı testi değil eşiği
düzeltmeye iterdi. Yüzdeyi hedef yapmak da kapsam tiyatrosu üretir: her satıra
dokunan ama hiçbir şey iddia etmeyen testler.

**Neden yüzde tek başına yetmiyor.** Mutasyon denemesinde
`notifications.service` %97 kapsamdayken, "çakışmada oluşturdum de" mutasyonu
128 testin hiçbirini düşürmedi. Kapsam çalışan satırı sayıyor, iddia edileni
değil. Boşluk kapatıldı; ayrıntı `docs/testing.md`.

---

## ADR-0022 · Arayüz API ile aynı origin'den sunuluyor

**Bağlam.** Arayüz `/api/v1`'i göreli çağırıyordu; yerelde Vite vekili bunu
gizliyordu. Yayında iki ayrı alan adı olsaydı ne olurdu diye bakınca sorun
çıktı.

**Sorun.** Oturum bir cookie'de ve `SameSite=Lax`. Arayüz ayrı bir alan
adında dursaydı o cookie yazma isteklerinde **gönderilmezdi**. Çalıştırmak
için `SameSite=None` gerekirdi — yani CSRF'e karşı ilk savunma hattını
kaldırmak. Üstüne CORS'u kimlik bilgisi taşıyan çapraz-origin isteklere
açmak gerekirdi.

**Karar.** API, derlenmiş arayüzü kendi origin'inden sunuyor. Bilinmeyen
sayfa yolları `index.html`'e düşüyor; API yolları düşmüyor.

**Sonuç.** CORS devreye hiç girmiyor, cookie kendiliğinden gidiyor, tek
dağıtım hedefi var. Bedeli API sürecinin statik dosya da servis etmesi — bu
ölçekte ölçülebilir değil. Trafik büyürse varlıklar bir CDN'in arkasına
alınabilir; o zaman da HTML aynı origin'den gelmeye devam eder.

**Uygulama ayrıntısı.** SPA geri dönüşü `ProblemFilter` içinde, ayrı bir
`setNotFoundHandler`'da değil: Nest kendi 404 işleyicisini `init()` sırasında
kuruyor ve Fastify ikincisini kabul etmiyor. Filtre yönlendiriciden sonra
çalıştığı için gerçek uçlar etkilenmiyor.

**Yan sonuç: iki ayrı CSP.** API yanıtları `default-src 'none'` ile kalıyor;
HTML yanıtları kendi kaynaklarını yükleyebilen bir politika alıyor. Tek
politika kullanılsaydı ya arayüz açılmazdı ya API gereksiz yere gevşerdi.
