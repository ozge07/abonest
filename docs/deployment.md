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

## Barındırma seçimi hakkında dürüst not

**Bu belgede belirli bir sağlayıcı önerilmiyor, çünkü ücretsiz katman
koşulları sık değişiyor ve doğrulayamadığım bir şeyi yazmak istemiyorum.**
"Kredi kartı istemiyor" gibi bir bilgi altı ay içinde yanlış olabiliyor.

Seçerken bakılacaklar:

1. **Kredi kartı isteniyor mu?** Kayıt sırasında değil, ücretsiz katmanı
   *kullanmak* için.
2. **Uyku davranışı.** Ücretsiz katmanların çoğu trafik yokken süreci
   uyutuyor. Bu uygulama buna göre tasarlandı: zamanlayıcı dışarıda
   (GitHub Actions), yani uygulama uyusa bile günlük iş tetikleniyor ve
   çağrı uygulamayı uyandırıyor. İlk isteğin yavaş olması normal.
3. **Veritabanının ömrü.** Bazı ücretsiz Postgres katmanları belirli bir
   süre sonra siliniyor. Silinmeden önce yedek almanın yolunu bil.
4. **Giden e-posta.** Çoğu barındırma SMTP portlarını kapatıyor; e-posta
   sağlayıcısının HTTP API'si olan biri gerekebilir.

Değerlendirmeye değer aday kategorileri: konteyner çalıştıran PaaS'lar,
yönetilen Postgres sunan sağlayıcılar, ücretsiz e-posta gönderim
servisleri. **Seçmeden önce güncel fiyatlandırma sayfasını oku.**

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

```bash
# 1. İmajı derle (depo kökünden)
docker build -f apps/api/Dockerfile -t abonelik-takip .

# 2. Şemayı uygula — uygulamayı başlatmadan önce
docker run --rm -e DATABASE_URL="$DATABASE_URL" abonelik-takip \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

# 3. Başlangıç verisi (kategoriler ve sağlayıcılar) — tekrar çalıştırılabilir
docker run --rm -e DATABASE_URL="$DATABASE_URL" abonelik-takip \
  node --experimental-strip-types apps/api/prisma/seed.ts

# 4. Çalıştır
docker run -d -p 3000:3000 --env-file .env.production abonelik-takip
```

> **Doğrulanmadı:** Bu imaj derlenip çalıştırılmadı — geliştirme makinesinde
> Docker kurulu değildi. Dockerfile'ın mantığı ve dosya yerleşimi gözden
> geçirildi (`apps/api/dist`ten `../../web/dist` yolu yerel çalıştırmayla
> doğrulandı, `npm prune --omit=dev`in üretilmiş Prisma istemcisini
> silmediği gerçek bir kopyada ölçüldü), ama `docker build` çalıştırılmadı.
> İlk derlemede sürpriz çıkabilir.

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
