# Abonelik Takip

Kişisel dijital ve fiziksel abonelikleri tek yerden takip eden web uygulaması.
Netflix, Spotify, spor salonu, internet — hepsi bir arada: ne kadar ödüyorsun,
sırada ne var, neyi boşuna ödüyorsun.

> **Durum: Phase 5 tamamlandı.** Çalışan API (kimlik, abonelik CRUD, katalog,
> ana ekran özeti) ve React arayüzü var. Sırada bildirimler var.

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

Gereken tek şey Node 22+ ve PostgreSQL 17. Docker gerekmiyor.

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

**E-posta doğrulama kodu** geliştirmede gönderilmiyor, API loguna yazılıyor —
kayıt olduktan sonra terminalde `bu kodu kullan:` satırını ara.

```bash
npm test --workspaces      # 74 test
npm run typecheck          # bütün paketler
```

## Yol haritası

| Phase | İçerik | Durum |
|---|---|---|
| 1 | Mimari, şema, API sözleşmesi | ✅ |
| 2 | Proje iskeleti, yapılandırma, loglama, hata yönetimi | ⏳ |
| 3 | Kimlik doğrulama | |
| 4 | Abonelik CRUD, kategori, katalog, döngü motoru | |
| 5 | Dashboard | |
| 6 | Hatırlatma ve bildirimler | |
| 7 | Analytics | |
| 8 | Güvenlik gözden geçirme | |
| 9 | Test tamamlama | |
| 10 | CI/CD, izleme, yayın | |
