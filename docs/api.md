# API sözleşmesi

Taban: `/api/v1` · Gövde: JSON · OpenAPI: `@nestjs/swagger` ile üretilir,
`/api/docs` altında sunulur.

## Kimlik doğrulama — çift taşıma

Oturum, Postgres'te duran **opak bir token**. JWT değil; içinde bilgi taşımıyor,
sunucuda aranıyor. Bu, "hesabımı sil" ve "diğer oturumları kapat" akışlarının
anında etkili olmasını sağlıyor.

| İstemci | Taşıma | CSRF |
|---|---|---|
| Tarayıcı | `httpOnly` + `Secure` + `SameSite=Lax` cookie | Gerekli (double-submit token) |
| Mobil | `Authorization: Bearer <token>` | Gerekmiyor — cookie otomatik gönderilmez |

Sunucu ikisini de kabul eder; guard hangi taşımanın kullanıldığını bilir ve
CSRF kontrolünü yalnızca cookie yolunda uygular.

Veritabanında ham token **durmaz**, yalnızca SHA-256 özeti. Veritabanı sızsa
bile oturumlar ele geçirilemez.

## Hata biçimi — RFC 9457

Kendi formatımızı uydurmuyoruz; standart var.

```json
{
  "type": "https://abonelik-takip.app/errors/validation-failed",
  "title": "Doğrulama başarısız",
  "status": 422,
  "detail": "Gönderilen alanlardan bazıları geçersiz.",
  "instance": "/api/v1/subscriptions",
  "requestId": "01J8F...",
  "errors": [
    { "field": "priceMinor", "message": "0'dan küçük olamaz" }
  ]
}
```

`requestId` log'daki kayıtla eşleşir — kullanıcı bir hata bildirdiğinde onu
aramak yeterli.

**Beklenmeyen hatalarda** istemciye yığın izi, SQL, dosya yolu **gitmez**;
yalnızca `requestId` ve genel mesaj.

## Durum kodları

| Kod | Ne zaman |
|---|---|
| 200 | Başarılı okuma/güncelleme |
| 201 | Kaynak oluşturuldu (`Location` başlığıyla) |
| 202 | Kabul edildi, işlem asenkron (hesap silme, şifre sıfırlama isteği) |
| 204 | Başarılı, gövde yok |
| 400 | Bozuk istek (JSON parse edilemedi) |
| 401 | Oturum yok/geçersiz |
| 403 | Oturum var ama işlem yasak (doğrulanmamış e-posta) |
| 404 | Kaynak yok **veya başkasına ait** — ayrım yapılmaz |
| 409 | Çakışma (e-posta zaten kayıtlı) |
| 410 | Token süresi dolmuş |
| 422 | Doğrulama hatası |
| 429 | Rate limit |

**404 / 403 ayrımı bilinçli:** başkasının aboneliğine erişmeye çalışan
kullanıcıya 403 dönmek "bu ID var ama senin değil" bilgisini sızdırır. Her
ikisi de 404 döner.

## Uçlar

### Auth

> Phase 3'te uygulandı ve uçtan uca doğrulandı.

```
POST   /auth/register           201 · 409 e-posta kayıtlı · 422
POST   /auth/login              200 + oturum · 401 · 429
POST   /auth/logout             204
POST   /auth/logout-all         204   diğer tüm oturumları kapat
POST   /auth/verify-email       204 · 410 token süresi doldu
POST   /auth/resend-verification 202 · 429
POST   /auth/forgot-password    202   ← e-posta var/yok AYRIMI SIZDIRILMAZ
POST   /auth/reset-password     204 · 410
```

`forgot-password` her durumda 202 döner. 404 dönmek hangi e-postaların kayıtlı
olduğunu tarayarak öğrenmeyi mümkün kılar.

### Kullanıcı

```
GET    /me                      200
PATCH  /me                      200   ad, para birimi, saat dilimi, dil
PATCH  /me/password             204   → tüm diğer oturumlar düşer
DELETE /me                      202   30 günlük geri alınabilir silme
GET    /me/sessions             200   aktif oturumlar
DELETE /me/sessions/{id}        204
```

### Abonelikler

> Phase 4'te uygulandı ve uçtan uca doğrulandı (entegrasyon testleri:
> `apps/api/src/modules/subscriptions/subscriptions.integration.test.ts`).

```
GET    /subscriptions           200
POST   /subscriptions           201
GET    /subscriptions/{id}      200 · 404
PATCH  /subscriptions/{id}      200 · 404 · 422
DELETE /subscriptions/{id}      204   kalıcı silme
POST   /subscriptions/{id}/cancel  200   iptal ≠ silme, geçmiş korunur
POST   /subscriptions/{id}/pause   200
POST   /subscriptions/{id}/resume  200
GET    /subscriptions/{id}/occurrences  200   ödeme geçmişi + planı
```

**Liste parametreleri:**

```
?q=netflix                 ad ve açıklamada arama
&categoryId=<uuid>
&status=ACTIVE|PAUSED|CANCELLED|EXPIRED
&billingCycle=MONTHLY
&currency=TRY
&minPriceMinor=&maxPriceMinor=
&nextPaymentBefore=2026-09-01
&sort=name|priceMinor|nextPaymentDate|createdAt
&order=asc|desc
&cursor=<opak>&limit=20        (varsayılan 20, en fazla 100)
```

`categoryId` yalnızca sistem kategorisi ya da isteği yapan kullanıcının kendi
kategorisi olabilir; başkasının kategorisi `404` alır. Yabancı anahtar kısıtı
tek başına "kategori var mı" diye bakar, **kimin** olduğuna bakmaz — o kontrol
serviste.

**Sayfalama cursor tabanlı**, offset değil. Offset'te yeni kayıt eklendiğinde
sayfalar kayar ve kullanıcı aynı kaydı iki kez görür ya da hiç görmez.

```json
{ "data": [ … ], "nextCursor": "eyJpZCI6…", "hasMore": true }
```

### Dashboard

Tek çağrı — ekranın ihtiyacı olan her şey. Beş ayrı istek atmak mobil ağda
gözle görülür gecikme demek.

```
GET /dashboard
```

```json
{
  "activeCount": 12,
  "totals": [
    { "currency": "TRY", "monthlyMinor": 185000, "yearlyMinor": 2220000 },
    { "currency": "USD", "monthlyMinor": 1299,   "yearlyMinor": 15588 }
  ],
  "upcoming": [
    { "subscriptionId": "…", "name": "Netflix",
      "amountMinor": 29900, "currency": "TRY",
      "dueDate": "2026-08-12", "daysUntil": 1 }
  ],
  "byCategory": [
    { "categoryId": "…", "name": "Entertainment",
      "currency": "TRY", "monthlyMinor": 65000, "share": 0.35 }
  ],
  "cancelledThisMonth": 2
}
```

Toplamlar **para birimi başına liste** — bkz. `database.md`, kritik karar 5.

### Analytics

```
GET /analytics/spending?from=2026-01-01&to=2026-08-01&groupBy=month|category
GET /analytics/unused?thresholdDays=30      uzun süredir kullanılmayanlar
```

### Bildirimler

```
GET    /notifications?unreadOnly=true&cursor=&limit=
GET    /notifications/unread-count      200  { "count": 3 }
PATCH  /notifications/{id}/read         204
POST   /notifications/read-all          204
```

### Katalog

```
GET    /providers?q=net                 200  sistem kataloğu, salt okunur
GET    /categories                      200  sistem + kullanıcının kendi
POST   /categories                      201
PATCH  /categories/{id}                 200 · 403 sistem kategorisi değiştirilemez
DELETE /categories/{id}                 204 · 409 kullanımdaysa silinemez
```

### Sistem

```
GET /health    200  süreç ayakta   — kimlik doğrulama yok
GET /ready     200  veritabanı erişilebilir · 503 değilse
POST /internal/jobs/daily            GitHub Actions cron tetikler
                                     paylaşılan gizli anahtarla korunur
```

## Yetkilendirme — IDOR'a karşı yapısal önlem

Kontrol controller'da `if` ile yapılmaz. **Repository katmanında zorunludur:**
her sorgu `userId` filtresi taşır ve filtresiz sorgu yazmak tip seviyesinde
mümkün değildir.

Gerekçe: controller'da unutulan tek bir kontrol tüm kullanıcı verisini açar ve
kod incelemesinde gözden kaçar. Repository'de unutulması **derleme hatası**
verir. Güvenliği insan dikkatine değil derleyiciye bağlıyoruz.

Ek olarak kimlikler **UUIDv7** — sıralı tamsayı tahmin edilebilir olurdu.

## Rate limit

| Uç | Sınır |
|---|---|
| `POST /auth/login` | IP başına 10/dk · hesap başına 5/dk, sonra üstel gecikme |
| `POST /auth/register` | IP başına 5/saat |
| `POST /auth/forgot-password` | IP başına 3/saat · e-posta başına 3/gün |
| Diğer kimlik doğrulamalı uçlar | Kullanıcı başına 120/dk |

Aşımda `429` + `Retry-After` başlığı.

## Sürümleme

Yol tabanlı (`/api/v1`). Kırıcı değişiklik `/api/v2` açar; eski sürüm en az bir
sürüm boyunca yaşar. Kırıcı olmayan eklemeler (yeni alan, yeni uç) sürüm
değiştirmez — istemciler bilmedikleri alanları yok saymalı.
