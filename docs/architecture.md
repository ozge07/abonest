# Mimari

## Sistem görünümü

```
┌──────────────────────────────────────────────────────────┐
│  web — React 19 + Vite 8 (SPA)                           │
│  statik dosya; Cloudflare Pages / Netlify                │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTPS
                            │ cookie (tarayıcı) · Bearer (mobil)
┌───────────────────────────▼──────────────────────────────┐
│  api — NestJS 11                                         │
│                                                          │
│  auth · users · subscriptions · billing · catalog        │
│  notifications · analytics · audit                       │
│                                                          │
│  ortak: config · logger · errors · guards · prisma       │
└──────┬────────────────────────────────┬──────────────────┘
       │                                │
┌──────▼───────────────┐    ┌───────────▼──────────────────┐
│ PostgreSQL 17        │    │ e-posta sağlayıcısı          │
│ · uygulama verisi    │    │ (EmailSender arayüzü ardında)│
│ · oturumlar          │    │ yerel: Mailpit               │
│ · iş kuyruğu (pg-boss)│   └──────────────────────────────┘
└──────▲───────────────┘
       │
┌──────┴───────────────┐
│ worker               │  pg-boss tüketicisi: hatırlatma taraması,
│ (aynı image, ayrı    │  occurrence üretimi, hesap temizliği
│  süreç)              │
└──────▲───────────────┘
       │ günlük tetik
┌──────┴───────────────┐
│ GitHub Actions cron  │  her gün 05:00 UTC → korumalı uca istek
└──────────────────────┘
```

**Neden worker ayrı süreç:** uzun süren bir iş, istek işleyen sürecin olay
döngüsünü meşgul ederse API gecikmesi bozulur. Aynı image, farklı giriş noktası.

**Neden zamanlayıcı dışarıda:** ücretsiz barındırma katmanları boştayken uykuya
geçiyor; sunucunun içindeki bir cron o sırada tetiklenmez. GitHub Actions
uygulamadan bağımsız çalışır ve barındırma sağlayıcısını değiştirmemizi
etkilemez.

## Modüler monolit

Microservice yok: tek ekip, tek veritabanı, tek deploy. Dağıtık sistem
maliyetini (ağ hataları, dağıtık işlem, sürüm uyumu) ödemeden aynı modülerliği
elde ediyoruz. Sınırlar net çizilirse ileride ayırmak mümkün.

### Modüller ve bağımlılık yönü

```
                    ┌──────────┐
                    │ billing  │  saf domain: para + döngü matematiği
                    └────▲─────┘  hiçbir modüle, IO'ya, veritabanına bağlı DEĞİL
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────┴─────┐   ┌──────┴───────┐  ┌─────┴──────┐
   │ catalog  │◄──┤ subscriptions│  │ analytics  │  (yalnızca okur)
   └──────────┘   └──────┬───────┘  └────────────┘
                         │ olay yayınlar
                    ┌────▼──────────┐
                    │ notifications │
                    └───────────────┘

   auth ──► users        audit ◄── (tüm modüller olay yayınlar)
```

**Kurallar:**

1. Bir modül başka modülün **repository'sine** dokunamaz; yalnızca servis
   arayüzüne. Prisma erişimi modülün kendi repository'si üzerinden.
2. `billing` en içte ve saftır: girdi alır, sonuç döner. Veritabanı, tarih
   "şimdi"si, ağ yok. Bu sayede para ve döngü matematiği hiçbir kurulum
   gerektirmeden test edilebilir — projenin en kritik mantığı burada.
3. `subscriptions`, `notifications`'ı doğrudan çağırmaz; olay yayınlar
   (`subscription.created`, `occurrence.due_soon`). Bildirimi ileride ayrı
   servise taşımak tek modüllük iş olur.
4. `analytics` yalnızca okuma yapar; yazma yolu yoktur.
5. `audit` olay dinler, kimse `audit`'i çağırmaz.

### Modül sorumlulukları

| Modül | Sorumluluk |
|---|---|
| `auth` | Kayıt, giriş, çıkış, oturum, şifre sıfırlama/değiştirme, e-posta doğrulama |
| `users` | Profil, tercihler (para birimi, saat dilimi, dil), hesap silme |
| `subscriptions` | Abonelik CRUD, durum geçişleri, occurrence üretimi tetikleme |
| `billing` | Para gösterimi, döngü normalizasyonu, sonraki ödeme tarihi hesabı |
| `catalog` | Sağlayıcı kataloğu (sistem), kategoriler (sistem + kullanıcı) |
| `notifications` | Bildirim üretimi/okunması, e-posta gönderimi |
| `analytics` | Dashboard metrikleri, harcama analizi, trendler |
| `audit` | Kritik işlemlerin denetim kaydı |

## Klasör yapısı

```
abonelik-takip/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/          controller · service · repository · dto
│   │   │   │   ├── users/
│   │   │   │   ├── subscriptions/
│   │   │   │   ├── billing/       saf fonksiyonlar, IO yok
│   │   │   │   ├── catalog/
│   │   │   │   ├── notifications/
│   │   │   │   ├── analytics/
│   │   │   │   └── audit/
│   │   │   ├── infra/
│   │   │   │   ├── config/        Zod ile doğrulanan env
│   │   │   │   ├── database/      Prisma servisi
│   │   │   │   ├── logger/        pino
│   │   │   │   ├── errors/        RFC 9457 filtresi
│   │   │   │   ├── queue/         pg-boss sarmalayıcı
│   │   │   │   └── email/         EmailSender arayüzü + sağlayıcılar
│   │   │   ├── common/            guard · decorator · pipe
│   │   │   ├── main.ts            API giriş noktası
│   │   │   └── worker.ts          worker giriş noktası
│   │   ├── prisma/schema.prisma
│   │   └── test/
│   └── web/
│       └── src/
│           ├── pages/             yönlendirme seviyesindeki ekranlar
│           ├── features/          abonelik · dashboard · bildirim …
│           ├── components/ui/     yeniden kullanılabilir bileşenler
│           ├── lib/               api istemcisi · query anahtarları
│           └── hooks/
├── packages/
│   └── shared/                    api + web ortak: para, döngü, Zod şemaları
├── docs/
└── .github/workflows/
```

**`packages/shared` neden var:** para ve döngü tipleri ile doğrulama şemaları
tek yerde durur. Frontend'in `₺` biçimlendirmesiyle backend'in hesabı
ayrışamaz. Zod şeması hem istemcide form doğrulaması hem sunucuda giriş
doğrulaması olarak kullanılır — **ama sunucu istemciye güvenmez**, kendi
doğrulamasını her zaman çalıştırır.

## Kesişen konular

| Konu | Karar |
|---|---|
| Yapılandırma | Zod ile doğrulanan env. Eksik/geçersiz değişkende **açılışta** çök |
| Loglama | pino, JSON. Her isteğe `requestId`. Şifre/token/cookie asla loglanmaz |
| Hata | RFC 9457 Problem Details. Beklenmeyen hatada istemciye iç ayrıntı gitmez |
| Kimlik | Opak oturum token'ı, Postgres'te. Cookie (web) / Bearer (mobil) |
| Yetki | Repository katmanında zorunlu `userId` filtresi — controller'a bırakılmaz |
| Rate limit | Bellek içi sayaç (tek sunucu). Çok sunucuya geçilirse Postgres'e taşınır |
| Sağlık | `/health` (süreç ayakta) · `/ready` (veritabanı erişilebilir) |
| Zaman | Fatura tarihleri `DATE`; "bugün" kullanıcının saat diliminde hesaplanır |

## Ölçek varsayımları

Bu mimari **10.000 kullanıcı / 200.000 abonelik** ölçeğine kadar tek sunucuda
çalışacak şekilde tasarlandı. O eşiğin ötesinde sırasıyla: okuma replikası,
Redis cache, worker'ın yatay ölçeklenmesi. Bunların hiçbiri bugün gerekli değil
ve hiçbiri mimariyi değiştirmiyor — bu yüzden şimdi yapılmıyor.
