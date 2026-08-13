# Abonest

**Abonest — Abonelik Takip.** Kişisel dijital ve fiziksel abonelikleri tek
yerden takip eden web uygulaması.
Netflix, Spotify, spor salonu, internet — hepsi bir arada: ne kadar ödüyorsun,
sırada ne var, neyi boşuna ödüyorsun.

> **Durum: Phase 10 tamamlandı — tüm fazlar bitti.** Çalışan API (kimlik, abonelik CRUD, katalog,
> ana ekran özeti, hatırlatma ve bildirimler, harcama analizi), günlük iş,
> denetim kaydı ve React arayüzü var. Güvenlik gözden geçirmesi yapıldı —
> bkz. [`docs/security.md`](docs/security.md). Yayına çıkarma adımları
> [`docs/deployment.md`](docs/deployment.md) içinde.

## Ne çözüyor

Abonelikler sessizce birikiyor. Çoğu kişi ayda kaç lira abonelik ödediğini
bilmiyor, unuttuğu bir aboneliği aylarca ödemeye devam ediyor. Bu uygulama üç
soruyu cevaplıyor: **ne kadar gidiyor, sırada ne var, neyi kullanmıyorum.**

## Belgeler

| Belge | İçerik |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Sistem görünümü, modül sınırları, klasör yapısı |
| [`docs/database.md`](docs/database.md) | Şema, indeksler, para ve tarih matematiği |
| [`docs/api.md`](docs/api.md) | Uç noktalar, hata biçimi, kimlik doğrulama, yetkilendirme |
| [`docs/decisions.md`](docs/decisions.md) | Mimari kararlar ve gerekçeleri (ADR) |
| [`docs/security.md`](docs/security.md) | Neyin yoklandığı, ne bulunduğu, neye bakılmadığı |
| [`docs/testing.md`](docs/testing.md) | Test yaklaşımı, kapsam ve mutasyon denemesi |
| [`docs/deployment.md`](docs/deployment.md) | Yayına çıkarma, ortam değişkenleri, izleme |

## Teknoloji

| Katman | Seçim |
|---|---|
| Frontend | React 19 · Vite 8 · TanStack Query · React Router · Tailwind 4 |
| Backend | NestJS 11 · TypeScript 6 |
| Veritabanı | PostgreSQL 17 · Prisma 7 |
| Kuyruk | pg-boss (Postgres) — Redis yok |
| Zamanlayıcı | GitHub Actions cron |
| Kimlik | Opak oturum · Argon2id · cookie (web) / Bearer (mobil) |
| E-posta | Yerelde Mailpit · yayında Brevo |
| CI/CD | GitHub Actions |

Seçimlerin gerekçesi [`docs/decisions.md`](docs/decisions.md) içinde. Özellikle
üçü sıra dışı ve okunmadan değiştirilmemeli: para gösterimi (ADR-0002), JWT
kullanmama (ADR-0003), Redis kullanmama (ADR-0004).

## Tasarım ilkeleri

**Ücretsiz katmanlarla çalışır.** Hiçbir bileşen ücretli ya da kredi kartı
gerektiren bir servise bağımlı değil.

**Para hesabında float yok.** Tutarlar tamsayı kuruş olarak saklanıyor ve her
zaman para birimi koduyla taşınıyor.

**Yetki kontrolü derleyicide.** Kullanıcı verisine erişim repository katmanında
zorunlu kılınıyor; unutulması derleme hatası veriyor, gözden kaçan bir `if`
değil.

**Bugün gerekmeyen şey yazılmıyor.** Microservice yok, Redis yok, cache katmanı
yok. Ölçüm gerektiğini gösterdiğinde eklenir.

## Kurulum

Gereken tek şey Node 22+ ve PostgreSQL 17. Docker gerekmiyor. `citext`
eklentisini ilk migration kendisi kuruyor, elle bir şey yapmak gerekmiyor.

```bash
# 1. Veritabanı (macOS, Homebrew)
brew services start postgresql@17
createdb abonelik_takip

# 2. Bağımlılıklar
npm install

# 3. Ortam değişkenleri
cp apps/api/.env.example apps/api/.env    # DATABASE_URL'i düzenle

# 4. Şema ve başlangıç verisi
npm run prisma:migrate -w @abonelik/api
npm run seed -w @abonelik/api             # 11 kategori, 30 sağlayıcı

# 5. Çalıştır — iki ayrı terminalde
npm run build -w @abonelik/api && npm start -w @abonelik/api   # :3000
npm run dev -w @abonelik/web                                   # :5173
```

Arayüz `http://localhost:5173` adresinde. Vite, `/api` isteklerini API'ye
yönlendiriyor; tarayıcı her şeyi tek origin'den gördüğü için cookie'ler
sorunsuz çalışıyor.

Yayında Vite sunucusu yok: arayüz derleniyor ve **API onu aynı origin'den
sunuyor** (ADR-0022). Bunu yerelde denemek için `npm run build --workspaces`
sonrası `npm start -w @abonelik/api` yeterli — uygulama `:3000` adresinde
tek başına çalışır.

**E-posta doğrulama kodu** geliştirmede gönderilmiyor, API loguna yazılıyor —
kayıt olduktan sonra terminalde `bu kodu kullan:` satırını ara.

```bash
npm test --workspaces      # 344 test (48 shared + 175 api + 121 web)
npm run typecheck          # bütün paketler
npm run test:coverage -w @abonelik/api   # kapsam raporu ve eşikler
```

**Testler ayrı bir veritabanında koşuyor** (`<veritabanı>_test`). Yoksa
kendisi oluşturuyor, şemayı ve başlangıç verisini uyguluyor — elle bir şey
yapmak gerekmiyor. `TEST_DATABASE_URL` verirsen o kullanılıyor.

Ayrım şart, çünkü günlük iş tasarımı gereği **bütün** abonelikleri tarıyor
ve testler onu sahte bir "bugün" ile çağırıyor. Aynı veritabanında
koşarken gerçek bir kullanıcının ziline "Netflix ödemesi bugün" bildirimi
düştü — oysa ödeme 30 gün sonraydı. Bildirim yanlış değildi; ona verilen
tarih sahteydi.

## Destek ve müdahale

Yönetici rolü ve yönetici paneli **bilerek yok**. Herkesin finansal
verisini okuyabilen tek bir hesap, bu sistemdeki en değerli hedef olurdu;
proje boyunca yetkilendirmeyi derleyiciye bağlayıp IDOR'u yapısal olarak
kapattıktan sonra üstüne öyle bir rol koymak o işin çoğunu geri alırdı.

Bunun yerine veritabanı erişimiyle çalışan bir komut satırı aracı var:

```bash
npm run destek -w @abonelik/api                          # kullanım
npm run destek -w @abonelik/api -- kullanici a@b.com     # hesap özeti
npm run destek -w @abonelik/api -- abonelikler a@b.com   # silinmişler dahil
npm run destek -w @abonelik/api -- gecmis a@b.com        # denetim kaydı
npm run destek -w @abonelik/api -- geri-getir <id> --onayla
npm run destek -w @abonelik/api -- hesap-sil a@b.com --onayla
npm run destek -w @abonelik/api -- hesap-geri-getir a@b.com --onayla
```

Hesap geri getirmede **çoğu zaman bu komuta gerek yok**: kullanıcı 10 gün
içinde aynı e-posta ve şifreyle giriş yaparsa hesabı kendiliğinden geri
geliyor ve ekranda bunu söyleyen bir şerit çıkıyor (ADR-0024). Komut,
pencerenin dolduğu ya da kullanıcının şifresini de unuttuğu durumlar için
duruyor; süre dolmuşsa uyarı yazıyor. Kayıt kalıcı silindikten sonra geri
dönüş yok.

Yazma işlemleri `--onayla` olmadan çalışmıyor: yanlış hesapta çalıştırılan
bir komut, düzeltmeye çalıştığı sorundan büyük olabilir.

Çoğu durumda araca gerek kalmıyor — abonelik silme geri alınabilir ve
kullanıcı kendi çöp kutusundan 10 gün içinde geri getirebiliyor.

## Günlük iş

Hatırlatmaları üreten iş dışarıdan tetikleniyor:

```bash
curl -X POST http://localhost:3000/api/v1/internal/jobs/daily \
  -H "x-cron-secret: $CRON_SECRET"
```

Yayında bunu GitHub Actions çağırıyor (`.github/workflows/gunluk-is.yml`,
her gün 06:00 TSİ). Zamanlayıcının uygulamanın dışında olmasının sebebi
ücretsiz barındırmanın uykuya geçmesi — süreç içi cron tetiklenmez, dışarıdan
gelen istek hem uyandırır hem işi başlatır.

İş **idempotent**: aynı gün beş kez çağırsan da kullanıcı hatırlatmayı bir kez
alır. Tekillik uygulama kodunda değil veritabanı kısıtında (bkz. ADR-0015).

## Yol haritası

| Phase | İçerik | Durum |
|---|---|---|
| 1 | Mimari, şema, API sözleşmesi | ✅ |
| 2 | Proje iskeleti, yapılandırma, loglama, hata yönetimi | ✅ |
| 3 | Kimlik doğrulama | ✅ |
| 4 | Abonelik CRUD, kategori, katalog, döngü motoru | ✅ |
| 5 | Dashboard | ✅ |
| 6 | Hatırlatma ve bildirimler | ✅ |
| 7 | Analytics | ✅ |
| 8 | Güvenlik gözden geçirme | ✅ |
| 9 | Test tamamlama | ✅ |
| 10 | CI/CD, izleme, yayın | ✅ |

Fazlar bittikten sonra eklenenler — hepsi kullanımdan doğdu, plandan
değil:

| Ne | Neden |
|---|---|
| Hesabım ekranı (profil, şifre, oturumlar, hesap silme) | Altı uç sunucuda hazırdı ama hiçbirinin arayüzü yoktu; kullanıcı hesabını silemiyordu |
| Silinmiş hesabın giriş yaparak geri gelmesi | Hesabını silen kullanıcının tek çıkışı operatöre ulaşmaktı (ADR-0024) |
| Silmenin geri alınabilir olması + destek aracı | Kazayla silinen aboneliğin dönüşü yoktu (ADR-0023) |
| TCMB kuruyla TRY karşılığı | Farklı para birimlerindeki abonelikler karşılaştırılamıyordu |
| Testlerin ayrı veritabanında koşması | Testler geliştirme verisine yazıyor, gerçek kullanıcıya sahte bildirim üretiyordu |
