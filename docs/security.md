# Güvenlik

Bu belge bir söz listesi değil, **ne denendiğinin kaydı.** Her satırın
arkasında ya çalıştırılmış bir yoklama ya da bir test var. Denenmemiş şeyler
"denenmedi" diye yazıyor.

Yoklamalar Phase 8'de çalışan uygulamaya karşı yapıldı; gerileme koruması
`apps/api/src/app.setup.integration.test.ts` ve
`apps/api/src/infra/audit/audit.integration.test.ts` içinde.

## Yoklamada bulunan ve düzeltilen açıklar

### 1. Kayıt ucunun hız sınırı tamamen atlatılabiliyordu

`trustProxy: true` koşulsuz açıktı. Fastify istemci IP'sini `X-Forwarded-For`
başlığından okuyor; uygulamaya doğrudan erişilebildiğinde o başlığı istemcinin
kendisi yazıyor.

Ölçüm: sahte başlıkla **arka arkaya dokuz hesap** açıldı (sınır saatte 5).

Düzeltme: `TRUST_PROXY` ortam değişkeni, varsayılanı `false`. Yayında
uygulamanın önünde gerçekten vekil varsa atlanacak vekil sayısı yazılıyor.
Düzeltmeden sonra aynı yoklama 6. denemede `429` aldı.

Giriş ucu bu açıktan daha az etkileniyordu, çünkü IP'nin yanında e-posta
bazında da sayıyor — ama kayıt ucunda ikinci kova yoktu.

### 2. Güvenlik başlıkları hiç gönderilmiyordu

Beş başlık eksikti. Helmet yerine elle eklendi: bu bir JSON API, Helmet'in
değerinin çoğu HTML uygulamalarına yönelik varsayılanlardan geliyor.

| Başlık | Değer | Ne engelliyor |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Tarayıcının JSON'u HTML sanması |
| `X-Frame-Options` | `DENY` | Clickjacking |
| `Referrer-Policy` | `no-referrer` | Adresteki kimliğin başka siteye sızması |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | Yanıtın kaynak yüklemesi |
| `Cross-Origin-Resource-Policy` | `same-origin` | Yanıtın başka sitece gömülmesi |
| `Strict-Transport-Security` | yalnızca üretimde | Düz HTTP'ye düşürme |

HSTS geliştirmede bilerek gönderilmiyor: yerelde http üzerinden çalışıyoruz ve
tarayıcıya "bu alan adına hep https ile gel" demek geliştirmeyi kilitler.

### 3. "30 gün sonra kalıcı silinecek" sözü tutulmuyordu

`DELETE /me` hesabı `deletedAt` ile işaretliyor ve kullanıcıya 30 gün sonra
kalıcı silineceğini söylüyordu. **Bunu yapan hiçbir kod yoktu**; veri süresiz
duruyordu.

Düzeltme: günlük iş süresi dolmuş hesapları siliyor; abonelikler, ödemeler,
oturumlar ve bildirimler ilişki üzerinden gidiyor. Denetim kayıtları kalıyor
ama kime ait oldukları kalmıyor (`onDelete: SetNull`).

### 4. Denetim kaydı tablosu boştu

`AuditLog` modeli şemada vardı, hiçbir yerden yazılmıyordu — yani "bu hesapta
ne oldu" sorusunun cevabı yoktu. Artık giriş, başarısız giriş, şifre
değişikliği, şifre sıfırlama, e-posta doğrulama, hesap silme ve kalıcı
temizlik kaydediliyor.

Kayda **hassas veri yazılmıyor**: şifre yok, token yok, e-posta yok, tutar
yok. IP ham değil, SHA-256 özeti. Testle sabitlendi.

## Yoklanıp sağlam bulunanlar

| Ne denendi | Sonuç |
|---|---|
| Kütle atama: `status`, `id`, `userId` gövdeye enjekte | Zod şeması bilinmeyen alanları düşürüyor; kayıt `ACTIVE` ve üretilen kimlikle oluştu |
| SQL enjeksiyonu: arama parametresine `'; DROP TABLE …`, `%' OR '1'='1`, `\` | 200, tablo yerinde. Prisma parametreli sorgu üretiyor |
| Prototype pollution: gövdede `__proto__` | Sunucu sağlam kaldı |
| CORS: yabancı `Origin` başlığı | Yansıtılmıyor, yalnızca `WEB_ORIGIN` |
| Hata sızıntısı: bozuk UUID ile 500 tetikleme | Yanıtta yığın izi, dosya yolu, Prisma detayı yok |
| Doğrulanmamış e-posta ile veri erişimi | `403` |
| Silinen hesabın oturumu ve girişi | İkisi de `401` |
| 3 MB gövde | `413` |
| `x-powered-by` | Gönderilmiyor |
| Bağımlılık taraması (`npm audit --omit=dev`) | 0 açık |

Daha önceki fazlarda doğrulananlar: IDOR (başkasının aboneliği, kategorisi ve
bildirimi — hepsi `404`), kullanıcı sayımı (aynı mesaj, eşitlenmiş süre),
CSRF (double-submit, tarayıcının erişebildiği bilgiyle), oturum token'ının
`httpOnly` olması ve veritabanında yalnızca SHA-256 özetinin durması.

## OWASP Top 10 karşılığı

| | Durum |
|---|---|
| A01 Bozuk erişim denetimi | Kapsanmış depo katmanı; `userId` filtresi sorguya gömülü, atlanamıyor (ADR-0008) |
| A02 Kriptografik hatalar | Argon2id; token'lar veritabanında yalnızca özet; oturum cookie'si `httpOnly` |
| A03 Enjeksiyon | Prisma parametreli sorgu; ham SQL yalnızca `SELECT 1` sağlık kontrolünde |
| A04 Güvensiz tasarım | Hız sınırı, e-posta doğrulama zorunluluğu, iptal ≠ silme |
| A05 Yanlış yapılandırma | **Bu fazda düzeltildi** — başlıklar ve vekil güveni |
| A06 Eski bileşenler | `npm audit` CI'da; şu an 0 açık |
| A07 Kimlik doğrulama hataları | Kaba kuvvet sınırı, oturum iptali, sıfırlamada tüm oturumların düşmesi |
| A08 Veri bütünlüğü | Güvenilmeyen veri deserialize edilmiyor; bağımlılıklar sabitlenmiş |
| A09 Kayıt ve izleme eksikliği | **Bu fazda düzeltildi** — denetim kaydı |
| A10 SSRF | Kullanıcı girdisiyle dışarı istek atılmıyor |

## Denenmemiş olanlar

Bunlar bilinçli olarak kapsam dışı; "güvenli" demiyoruz, "bakılmadı" diyoruz.

- **TLS yapılandırması.** Barındırma katmanının işi; Phase 10'da.
- **Bağımlılık zinciri (supply chain).** `npm audit` bilinen açıkları
  tarıyor, kötü niyetli paket enjeksiyonunu değil. Lockfile sabit ve
  yükleme scriptleri `allowScripts` ile açıkça izinli.
- **Yük altında davranış.** Hız sınırı tek sunucu varsayıyor (bellek içi);
  birden çok örneğe geçilirse sayaçların ortak bir yere taşınması gerekiyor.
- **Penetrasyon testi.** Buradaki yoklamalar kendi kodumuza karşı, bilinen
  sınıflara odaklı. Bağımsız bir gözden geçirmenin yerini tutmaz.
