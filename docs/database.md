# Veritabanı tasarımı

PostgreSQL 17 · Prisma 7

## Varlık ilişkileri

```
users ──┬──< sessions
        ├──< categories            (user_id NULL = sistem kategorisi)
        ├──< subscriptions ──┬──< subscription_occurrences
        │                    └──> providers      (opsiyonel)
        ├──< notifications ───────> subscription_occurrences  (opsiyonel)
        ├──< audit_logs
        ├──< email_verification_tokens
        └──< password_reset_tokens
```

## Kritik karar 1 — Para gösterimi

**`BIGINT` minor unit (kuruş/cent) + ISO 4217 kodu. Float hiçbir yerde yok.**

`₺299,90` → `price_minor = 29990`, `currency = 'TRY'`.

`NUMERIC(19,4)` de kesin sonuç verir, ama ORM ve JSON katmanlarında sessizce
`float`'a dönme riski taşır; JavaScript'in yerleşik decimal tipi yok. Tamsayı
JSON'da `2^53`'e kadar tam taşınır ve toplama/çarpma kayıpsızdır.

**Dikkat:** para birimlerinin ondalık basamağı farklıdır (JPY 0, KWD 3). Bu
yüzden tutar **her zaman** para birimi koduyla birlikte taşınır; basamak sayısı
koddan türetilir, sabit 2 varsayılmaz. MVP'deki dört para biriminin hepsi 2
basamak, ama varsayım koda gömülmüyor.

## Kritik karar 2 — Döngü normalizasyonu

Önce **yıllıklaştır**, sonra böl:

```
yıllıkMinor(fiyat, döngü) =
  haftalık    → fiyat × 52
  aylık       → fiyat × 12
  üç_aylık    → fiyat × 4
  altı_aylık  → fiyat × 2
  yıllık      → fiyat × 1
  özel(n gün) → round(fiyat × 365 / n)

aylıkKarşılığıMinor = round(yıllıkMinor / 12)
```

Haftalık için `× 4` **yanlıştır** — 52 / 12 = 4,333.

**Yuvarlama yalnızca en son adımda.** Toplamlar `yıllıkMinor` tamsayıları
üzerinden yapılır, sonra bir kez bölünür. Her aboneliği ayrı ayrı aylığa çevirip
toplamak 30 abonelikte gözle görülür sapma üretir.

Doğrulama örnekleri (birim testine girecek):

| Girdi | Yıllık | Aylık karşılığı |
|---|---|---|
| Aylık ₺250 | ₺3.000 | ₺250 |
| Yıllık ₺2.400 | ₺2.400 | ₺200 |
| Haftalık ₺50 | ₺2.600 | ₺216,67 |

## Kritik karar 3 — Tarih matematiği

Fatura tarihleri **takvim günü** (`DATE`), anlık (`timestamptz`) değil. Bir
ödeme "12 Ağustos"tur; saat dilimine göre kayan bir an değil. "Bugün" ise
kullanıcının saat diliminde hesaplanır.

**Ay sonu kırpması:** 31 Ocak + 1 ay = 28/29 Şubat.

**Sürüklenme önleme — kritik:** sonraki tarih, bir önceki tarihten değil
**başlangıç tarihinden** hesaplanır:

```
occurrence(n) = start_date + (n × döngü)
```

Zincirleme hesaplarsak: 31 Oca → 28 Şub → 28 Mar (yanlış, 31 Mar olmalı).
Çapadan hesaplarsak: 31 Oca + 2 ay = 31 Mar ✓. Bu, kırpmanın kalıcı hâle
gelmesini engelliyor.

## Kritik karar 4 — `subscription_occurrences` tablosu

Beklenen her ödeme ayrı satır. İki işi birden yapıyor:

1. **Hatırlatma idempotency'si.** `notifications` üzerindeki
   `UNIQUE (user_id, type, occurrence_id)` kısıtı sayesinde aynı ödeme için
   ikinci bildirim **veritabanı seviyesinde** imkânsız. Uygulama katmanında
   "gönderdim mi?" kontrolü yapmıyoruz — o kontrol yarış koşullarında
   sızdırır, kısıt sızdırmaz.
2. **Gelecekteki banka entegrasyonunun bağlantı noktası.** Gerçek işlemler bu
   beklenen ödemelere eşleştirilecek. Bu tablo olmasa banka entegrasyonu
   şema değişikliği ve veri göçü gerektirirdi.

**Üretim ufku:** günlük iş, her aktif abonelik için önümüzdeki **60 günü**
kapsayan occurrence'ların var olmasını sağlar. Sonsuza kadar üretmiyoruz.

## Kritik karar 5 — Çoklu para birimi ve toplamlar

Kur dönüşümü olmadan **"aylık toplam" tek bir sayı değildir**. ₺1.850 ile
$12,99'u toplamak uydurma bir sayı üretir.

MVP: toplamlar **para birimi başına** döner.

```json
"totals": [
  { "currency": "TRY", "monthlyMinor": 185000, "yearlyMinor": 2220000 },
  { "currency": "USD", "monthlyMinor": 1299,   "yearlyMinor": 15588 }
]
```

API sözleşmesi baştan **liste**; kur dönüşümü geldiğinde yanına `converted`
bloğu eklenir, mevcut alanlar değişmez. Skaler dönüp sonradan listeye çevirmek
kırıcı değişiklik olurdu.

## Şema

```prisma
enum BillingCycle    { WEEKLY MONTHLY QUARTERLY HALF_YEARLY YEARLY CUSTOM }
enum SubStatus       { ACTIVE PAUSED CANCELLED EXPIRED }
enum OccurrenceStatus{ SCHEDULED PAID SKIPPED }
enum NotificationType{ PAYMENT_REMINDER PAYMENT_TODAY SPENDING_SUMMARY
                       SUBSCRIPTION_EXPIRED }

model User {
  id              String    @id @default(uuid(7))
  email           String    @unique          // citext
  passwordHash    String
  name            String
  currency        String    @db.Char(3)      // varsayılan para birimi
  timezone        String    @default("Europe/Istanbul")
  locale          String    @default("tr")
  emailVerifiedAt DateTime?
  lastLoginAt     DateTime?
  deletedAt       DateTime?                  // 30 gün sonra kalıcı silinir
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@index([deletedAt])                       // temizlik işi için
}

model Session {
  id         String   @id @default(uuid(7))
  userId     String
  tokenHash  String   @unique                // ham token DB'de DURMAZ
  userAgent  String?
  ipHash     String?
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  @@index([userId])
  @@index([expiresAt])
}

model Category {
  id       String  @id @default(uuid(7))
  userId   String?                           // NULL = sistem kategorisi
  name     String
  slug     String
  icon     String?
  color    String?
  isSystem Boolean @default(false)
  @@unique([userId, slug])
}

model Provider {                              // sistem yönetimli katalog
  id                  String  @id @default(uuid(7))
  name                String
  slug                String  @unique
  logoUrl             String?
  website             String?
  defaultCategoryId   String?
  defaultBillingCycle BillingCycle?
  defaultCurrency     String? @db.Char(3)
  isActive            Boolean @default(true)
}

model Subscription {
  id                  String       @id @default(uuid(7))
  userId              String
  providerId          String?                 // NULL = serbest metin
  name                String
  categoryId          String
  description         String?
  notes               String?

  priceMinor          BigInt                  // > = 0
  currency            String       @db.Char(3)
  billingCycle        BillingCycle
  customIntervalDays  Int?                    // yalnızca CUSTOM için

  startDate           DateTime     @db.Date
  nextPaymentDate     DateTime?    @db.Date   // türetilmiş, önbellek
  endDate             DateTime?    @db.Date
  trialEndsAt         DateTime?    @db.Date
  cancelledAt         DateTime?

  status              SubStatus    @default(ACTIVE)
  paymentMethod       String?
  lastUsedAt          DateTime?    @db.Date   // "kullanılmıyor" analizi

  reminderEnabled     Boolean      @default(true)
  reminderDaysBefore  Int          @default(3)

  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  @@index([userId, status])
  @@index([userId, nextPaymentDate])
  @@index([categoryId])
}

model SubscriptionOccurrence {
  id             String            @id @default(uuid(7))
  subscriptionId String
  dueDate        DateTime          @db.Date
  amountMinor    BigInt                       // o tarihteki fiyat
  currency       String            @db.Char(3)
  status         OccurrenceStatus  @default(SCHEDULED)
  reminderSentAt DateTime?
  @@unique([subscriptionId, dueDate])         // idempotency'nin temeli
  @@index([dueDate, status])
}

model Notification {
  id           String           @id @default(uuid(7))
  userId       String
  type         NotificationType
  title        String
  body         String
  metadata     Json?
  occurrenceId String?
  readAt       DateTime?
  createdAt    DateTime         @default(now())
  @@unique([userId, type, occurrenceId])      // aynı bildirim iki kez oluşamaz
  @@index([userId, createdAt(sort: Desc)])
}

model AuditLog {
  id         String   @id @default(uuid(7))
  userId     String?
  action     String                           // subscription.cancelled …
  entityType String?
  entityId   String?
  metadata   Json?                            // HASSAS VERİ YOK
  ipHash     String?
  createdAt  DateTime @default(now())
  @@index([userId, createdAt(sort: Desc)])
}

model EmailVerificationToken { … tokenHash unique · expiresAt · usedAt }
model PasswordResetToken     { … tokenHash unique · expiresAt · usedAt }
```

## İndeksler ve gerekçeleri

| İndeks | Hangi sorgu |
|---|---|
| `users(email)` unique | Giriş; `citext` ile büyük/küçük harf duyarsız |
| `subscriptions(userId, status)` | Liste ekranının varsayılan sorgusu |
| `subscriptions(userId, nextPaymentDate)` | Dashboard "yaklaşan ödemeler" |
| `occurrences(dueDate, status)` | Günlük işin tarama sorgusu — tüm kullanıcılar |
| `occurrences(subscriptionId, dueDate)` unique | Idempotency + abonelik geçmişi |
| `notifications(userId, createdAt DESC)` | Bildirim listesi, sayfalı |
| `sessions(tokenHash)` unique | Her kimlik doğrulamalı istekte |
| `sessions(expiresAt)` | Süresi dolmuş oturum temizliği |

**Kısmi indeks değerlendirmesi:** `subscriptions(userId, nextPaymentDate)`
için `WHERE status = 'ACTIVE'` eklemek indeksi küçültür. MVP'de eklemiyorum —
kullanıcı başına abonelik sayısı onlarla ifade ediliyor, kazanç ölçülebilir
değil. Ölçüm gösterirse eklenir. **Erken optimizasyon yapmıyoruz.**

## N+1 önlemleri

- Abonelik listesi sağlayıcı ve kategoriyi tek sorguda çeker (`include`)
- Dashboard toplamları tek `GROUP BY currency` sorgusuyla hesaplanır;
  uygulamada döngüyle toplanmaz
- Günlük iş, abonelikleri tek sorguda sayfalar hâlinde okur; abonelik başına
  sorgu atmaz

## Veri saklama

| Veri | Süre |
|---|---|
| Silinen hesap | 30 gün sonra kalıcı silme (geri alınabilir pencere) |
| Audit log | 1 yıl (ücretsiz katmanın 0,5 GB sınırı için) |
| Süresi dolmuş oturum | Günlük temizlik |
| Okunmuş bildirim | 6 ay |
