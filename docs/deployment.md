# Yayına çıkarma

## Uygulamanın ihtiyacı

Tek bir konteyner ve bir veritabanı. Arayüz ayrı bir yerde barındırılmıyor —
API onu aynı origin'den sunuyor (bkz. ADR-0022).

| İhtiyaç | Ne için | Zorunlu mu |
|---|---|---|
| Node 24 çalıştırabilen bir yer | Uygulama | Evet |
| PostgreSQL 17 | Veri | Evet |
| Giden SMTP ya da e-posta API'si | Hatırlatma, doğrulama, şifre sıfırlama | Evet |
| Günlük HTTP çağrısı yapabilen bir zamanlayıcı | Hatırlatma işi | Evet — GitHub Actions yeterli |
| HTTPS | Oturum cookie'si `Secure` bayrağıyla gidiyor | Evet |

Redis yok, nesne depolama yok, mesaj kuyruğu yok. Bunlar bilinçli olarak
seçilmedi (ADR-0004, ADR-0015).

## Barındırma seçimi

Ücretsiz katman koşulları sık değişiyor, o yüzden aşağıdaki tablo bir
**öneri değil, kontrol listesi**: seçmeden önce güncel fiyatlandırma
sayfasını oku. Tarihli bilgiler Ağustos 2026'da bakıldığında geçerliydi.

| Katman | Aday | Bakılacak |
|---|---|---|
| Veritabanı | Neon | Kartsız, kalıcı ücretsiz, 0,5 GB, boşta sıfıra iniyor |
| Veritabanı | Supabase | Kartsız, 500 MB — **7 gün hareketsizlikte projeyi duraklatıyor** |
| Uygulama | Render | Ücretsiz web servisi var, boşta uykuya geçiyor; kart isteyip istemediğini kayıt ekranında gör |

Seçerken bakılacaklar:

1. **Kredi kartı isteniyor mu?** Kayıt sırasında değil, ücretsiz katmanı
   *kullanmak* için.
2. **Uyku davranışı.** Ücretsiz katmanların çoğu trafik yokken süreci
   uyutuyor. Bu uygulama buna göre tasarlandı: zamanlayıcı dışarıda
   (GitHub Actions), yani uygulama uyusa bile günlük iş tetikleniyor ve
   çağrı uygulamayı uyandırıyor. İlk isteğin yavaş olması normal.
3. **Veritabanının ömrü.** Bazı ücretsiz Postgres katmanları belirli bir
   süre sonra siliniyor ya da duraklatılıyor. Silinmeden önce yedek almanın
   yolunu bil (aşağıda).
4. **Giden e-posta — burası ölçüldü.** Çoğu barındırma SMTP portlarını
   kapatıyor. Bu projede yaşandı: aynı Brevo bilgileri geliştirme
   makinesinde çalışıyor, yayında `ETIMEDOUT, command: CONN` veriyordu.
   Kimlik sorunu değil, bağlantı hiç kurulamıyor.

   Çözüm `BREVO_API_KEY`: e-posta 443 üzerinden HTTP ile gidiyor ve port
   engeline takılmıyor. `SMTP_*` değişkenleri geliştirmede kullanılabilir.
   **İkisinden biri zorunlu:** hiçbiri tanımsızsa uygulama üretimde
   açılmayı reddediyor, çünkü kullanıcılar hesaplarını doğrulayamaz.

**Sunucusuz (serverless) platformlar bu uygulamaya uymuyor.** Hız sınırı
süreç belleğinde tutuluyor (ADR-0004: Redis yok); her isteğin ayrı bir
örnekte koştuğu bir ortamda sınır örnek başına düşer ve kaba kuvvet
koruması zayıflar. Sunucusuz bir hedef seçilecekse önce o sınırın
dışarı taşınması gerekir.

## Ortam değişkenleri

```bash
NODE_ENV=production
DATABASE_URL=postgresql://kullanici:sifre@sunucu:5432/abonelik_takip
SESSION_SECRET=<32+ karakter, rastgele>
CRON_SECRET=<32+ karakter, rastgele, SESSION_SECRET'ten farklı>
WEB_ORIGIN=https://alan-adin.example
TRUST_PROXY=1      # uygulamanın önünde vekil varsa; yoksa false
PORT=3000
LOG_LEVEL=info
```

Sır üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Uygulama üretimde şu durumlarda açılmayı reddediyor** (`config.ts`), çünkü
hepsi "çalışır ama güvensiz" kategorisinde ve ancak istismar edilince
görünür:

- `.env.example` içindeki örnek sırlar kullanılıyorsa
- `SESSION_SECRET` ile `CRON_SECRET` aynıysa
- `WEB_ORIGIN` https değilse

## Adımlar

Aşağıdaki komutlar **temiz bir klonda birebir çalıştırılıp doğrulandı**
(`npm ci`den üretim modunda ayağa kalkmış sürece kadar). Platforma özel
karşılıkları `render.yaml` içinde.

```bash
# 1. Kurulum
npm ci

# 2. Derleme — sıra zorunlu
npm run build -w @abonelik/shared
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run build -w @abonelik/api
npm run build -w @abonelik/web

# 3. Şema — uygulamayı başlatmadan ÖNCE
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

# 4. Başlangıç verisi (11 kategori, 30 sağlayıcı) — tekrar çalıştırılabilir
node --experimental-strip-types apps/api/prisma/seed.ts

# 5. Çalıştır
node apps/api/dist/main.js
```

`prisma generate` veritabanına **bağlanmıyor**, dolayısıyla derleme
aşamasında `DATABASE_URL` gerekmiyor — bu bilinçli (bkz.
`apps/api/prisma.config.ts`). Adres bir sır; derleme ortamına ve imaja
girmemeli.

Arayüz ayrı bir yere kurulmuyor: `apps/api/dist` içinden `../../web/dist`
olarak bulunup aynı origin'den sunuluyor. İki klasör de dağıtım hedefinde
bulunmalı.

### Render ücretsiz katman notu

Şema ve tohumlama `preDeployCommand` ile ayrı bir adımda çalışsa daha
temiz olurdu; **ücretsiz katman o alanı kabul etmiyor** ("pre-deploy
command is not supported for free tier services") ve blueprint hiç
uygulanmıyor. Bu yüzden ikisi derleme komutunun sonunda.

Prisma komutları `apps/api` içinden çalışıyor: `prisma.config.ts` orada ve
Prisma onu çalışma dizininden arıyor. Depo kökünden `--schema` vererek
çağırmak yetmiyor, "datasource.url property is required" diyerek düşüyor.

### Konteyner olarak

`apps/api/Dockerfile` depoda ve aynı yerleşimi üretiyor.

> **Doğrulanmadı:** İmaj derlenip çalıştırılmadı — geliştirme makinesinde
> Docker kurulu değil. Mantığı ve dosya yerleşimi gözden geçirildi, derleme
> komutları yukarıdaki doğrulanmış sırayla aynı. İlk `docker build`
> denemesinde sürpriz çıkabilir.

## Sıfırdan yayına: sıra

1. **Veritabanını aç** (Neon vb.), bağlantı adresini al. Adreste
   `sslmode=require` gerekebiliyor.
2. **Sırları üret** — ikisi farklı olmalı, aynıysa uygulama açılmıyor:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **E-posta sağlayıcısı ayarla.** Bu adım atlanamaz: `SMTP_HOST` yoksa
   uygulama üretimde açılmayı reddediyor. Bağlantıyı önce yerelde dene:
   ```bash
   npm run eposta:dene -w @abonelik/api
   ```
4. **Uygulamayı bağla** (depoyu platforma, `render.yaml` varsa okutarak),
   ortam değişkenlerini gir.
5. **İlk dağıtımdan sonra** aşağıdaki kontrol listesini çalıştır.
6. **GitHub deposuna iki sır ekle** (`API_URL`, `CRON_SECRET`), sonra
   Actions sekmesinden günlük işi elle bir kez tetikle.
7. **Kendine bir hesap aç** ve doğrulama e-postasının gerçekten geldiğini
   gör. Gelmiyorsa günlüğe bak: e-posta gönderilemediğinde uyarı yazılıyor.

## Zamanlayıcı

`.github/workflows/gunluk-is.yml` her gün 06:00 TSİ'de günlük işi tetikliyor.
İki depo sırrı gerekiyor:

| Sır | Değer |
|---|---|
| `API_URL` | `https://alan-adin.example` (sonunda `/` olmadan) |
| `CRON_SECRET` | Uygulamadaki değerle **aynı** |

İş idempotent: aynı gün birkaç kez çağrılması zararsız. Elle tetiklemek için
Actions sekmesindeki **Run workflow**.

## Yayın sonrası kontrol listesi

```bash
# Süreç ayakta mı
curl -sf https://alan-adin.example/health

# Veritabanına erişebiliyor mu
curl -sf https://alan-adin.example/ready

# Arayüz geliyor mu
curl -sI https://alan-adin.example/ | grep -i content-type

# Güvenlik başlıkları
curl -sI https://alan-adin.example/ | grep -iE 'strict-transport|content-security|x-frame'

# Cron sırrı çalışıyor mu (sırsız çağrı 403 dönmeli)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://alan-adin.example/api/v1/internal/jobs/daily
```

Son komut `403` dönmeli. `200` dönüyorsa sır kontrolü devrede değil demektir
ve iş herkese açık.

## İzleme

Yapılandırılmış günlük (JSON) dışında bir izleme aracı yok — bu ölçekte
gereksiz. Günlükte her isteğin `requestId`, yol, durum kodu ve süresi var; bu
kimlik hata yanıtındaki değerle aynı, yani kullanıcı "şu kimlikle hata aldım"
dediğinde ilgili satır doğrudan bulunuyor.

Hassas alanlar kayıt anında siliniyor (`logger.ts` içindeki `redact`): şifre,
token, cookie, yetkilendirme başlığı. Sorgu dizesi de yazılmıyor — arama
terimi kişisel veri olabiliyor.

Bakılacak şeyler:

- Günlük işin çıktısı: `tamamlandi: false` bir şeyin yarım kaldığını söylüyor.
- `basarisizEposta` sıfırdan büyükse e-posta sağlayıcısında sorun var.
- 5xx satırları; hepsi tam yığın iziyle loglanıyor ama istemciye
  gitmiyor.

## Yedekleme

Veritabanı tek durum kaynağı. Barındırma sağlayıcısının otomatik yedeği
yoksa:

```bash
pg_dump "$DATABASE_URL" | gzip > yedek-$(date +%F).sql.gz
```

Geri yükleme denenmeden yedek sayılmaz — en az bir kez boş bir veritabanına
geri yükleyip uygulamayı çalıştır.
