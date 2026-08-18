/**
 * Başlangıç verisi: sistem kategorileri ve sağlayıcı kataloğu.
 *
 * **Tekrar çalıştırılabilir.** Her kayıt slug üzerinden `upsert` ediliyor, yani
 * script iki kez koşarsa ikinci koşu hiçbir şeyi bozmuyor. Bu önemli: tohum
 * verisi kurulum adımı değil, güncellenen bir katalog — yeni bir sağlayıcı
 * eklendiğinde script yeniden çalıştırılacak.
 *
 * Kullanıcı verisine dokunulmuyor. Buradaki kategoriler `userId = NULL` ile
 * yazılıyor; kullanıcının kendi kategorileri ayrı satırlar.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { type BillingCycle, PrismaClient } from '@prisma/client';
import 'dotenv/config';

const connectionString = process.env['DATABASE_URL'];
if (connectionString === undefined) {
  throw new Error('DATABASE_URL tanımlı değil.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * İndirilmiş logoların künyesi (`tool/logo-indir.sh` üretiyor).
 *
 * Burada slug → yol eşlemesi var; dosyalar arayüzün kendi origin'inden
 * sunuluyor. Künye yoksa tohumlama yine çalışıyor, yalnızca logolar boş
 * kalıyor ve arayüz harf karosuna düşüyor — logo, uygulamanın çalışması için
 * gerekli bir veri değil.
 */
function logoKunyesi(): Record<string, string> {
  try {
    const ham = readFileSync(join(import.meta.dirname, 'logolar.json'), 'utf8');
    return JSON.parse(ham) as Record<string, string>;
  } catch {
    console.warn('logolar.json okunamadı; logolar boş bırakılıyor.');
    return {};
  }
}

const LOGOLAR = logoKunyesi();

interface KategoriTohumu {
  slug: string;
  name: string;
  icon: string;
  color: string;
}

/**
 * Sistem kategorileri.
 *
 * Renkler tek bir paletten seçildi; arayüzde rozet arka planı olarak
 * kullanılacaklar, o yüzden hepsi koyu metinle okunabilecek tonda.
 */
const KATEGORILER: KategoriTohumu[] = [
  { slug: 'video', name: 'Video ve Dizi', icon: 'clapperboard', color: '#E11D48' },
  { slug: 'muzik', name: 'Müzik', icon: 'music', color: '#7C3AED' },
  { slug: 'oyun', name: 'Oyun', icon: 'gamepad-2', color: '#2563EB' },
  { slug: 'yazilim', name: 'Yazılım ve Araçlar', icon: 'code', color: '#0891B2' },
  { slug: 'bulut', name: 'Bulut Depolama', icon: 'cloud', color: '#0D9488' },
  { slug: 'haber', name: 'Haber ve Yayın', icon: 'newspaper', color: '#B45309' },
  { slug: 'spor', name: 'Spor ve Sağlık', icon: 'dumbbell', color: '#16A34A' },
  { slug: 'egitim', name: 'Eğitim', icon: 'graduation-cap', color: '#CA8A04' },
  { slug: 'internet', name: 'İnternet ve Telefon', icon: 'wifi', color: '#4F46E5' },
  { slug: 'fatura', name: 'Faturalar', icon: 'receipt', color: '#57534E' },
  { slug: 'diger', name: 'Diğer', icon: 'ellipsis', color: '#6B7280' },
];

interface SaglayiciTohumu {
  slug: string;
  name: string;
  kategori: string;
  website: string;
  /**
   * Yalnızca Türkiye'de TL ile faturalandırdığından emin olduğum
   * sağlayıcılarda dolu. Emin olmadığım yerlerde boş bırakıyorum; form o
   * durumda kullanıcının varsayılan para birimini kullanıyor. Yanlış bir
   * varsayılan, kullanıcının fark etmeden yanlış para biriminde kayıt
   * açmasına yol açar.
   */
  currency?: string;
  cycle?: BillingCycle;
  /**
   * Markanın ana rengi.
   *
   * Yalnızca emin olduklarım dolu. Emin olmadığım markalarda boş bırakıyorum;
   * arayüz o zaman adından türettiği kararlı bir renk kullanıyor. Uydurma bir
   * marka rengi, uydurma bir logo adresi kadar yanlış olurdu.
   */
  color?: string;
}

const SAGLAYICILAR: SaglayiciTohumu[] = [
  // Video
  { slug: 'netflix', name: 'Netflix', kategori: 'video', website: 'https://www.netflix.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#E50914' },
  { slug: 'disney-plus', name: 'Disney+', kategori: 'video', website: 'https://www.disneyplus.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#113CCF' },
  { slug: 'amazon-prime-video', name: 'Amazon Prime Video', kategori: 'video', website: 'https://www.primevideo.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#00A8E1' },
  { slug: 'blutv', name: 'BluTV', kategori: 'video', website: 'https://www.blutv.com', currency: 'TRY', cycle: 'MONTHLY' },
  { slug: 'exxen', name: 'Exxen', kategori: 'video', website: 'https://www.exxen.com', currency: 'TRY', cycle: 'MONTHLY' },
  { slug: 'youtube-premium', name: 'YouTube Premium', kategori: 'video', website: 'https://www.youtube.com/premium', currency: 'TRY', cycle: 'MONTHLY' , color: '#FF0000' },
  { slug: 'mubi', name: 'MUBI', kategori: 'video', website: 'https://mubi.com', cycle: 'MONTHLY' },

  // Müzik
  { slug: 'spotify', name: 'Spotify', kategori: 'muzik', website: 'https://www.spotify.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#1DB954' },
  { slug: 'apple-music', name: 'Apple Music', kategori: 'muzik', website: 'https://music.apple.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#FA243C' },
  { slug: 'fizy', name: 'fizy', kategori: 'muzik', website: 'https://fizy.com', currency: 'TRY', cycle: 'MONTHLY' },
  { slug: 'deezer', name: 'Deezer', kategori: 'muzik', website: 'https://www.deezer.com', cycle: 'MONTHLY' , color: '#A238FF' },

  // Oyun
  { slug: 'xbox-game-pass', name: 'Xbox Game Pass', kategori: 'oyun', website: 'https://www.xbox.com/xbox-game-pass', currency: 'TRY', cycle: 'MONTHLY' , color: '#107C10' },
  { slug: 'playstation-plus', name: 'PlayStation Plus', kategori: 'oyun', website: 'https://www.playstation.com/ps-plus', currency: 'TRY', cycle: 'MONTHLY' , color: '#003791' },
  { slug: 'nintendo-switch-online', name: 'Nintendo Switch Online', kategori: 'oyun', website: 'https://www.nintendo.com/switch/online', cycle: 'YEARLY' , color: '#E60012' },

  // Yazılım ve araçlar
  { slug: 'adobe-creative-cloud', name: 'Adobe Creative Cloud', kategori: 'yazilim', website: 'https://www.adobe.com/creativecloud.html', cycle: 'MONTHLY' },
  { slug: 'microsoft-365', name: 'Microsoft 365', kategori: 'yazilim', website: 'https://www.microsoft.com/microsoft-365', currency: 'TRY', cycle: 'YEARLY' , color: '#D83B01' },
  { slug: 'canva', name: 'Canva Pro', kategori: 'yazilim', website: 'https://www.canva.com', cycle: 'MONTHLY' , color: '#00C4CC' },
  { slug: 'notion', name: 'Notion', kategori: 'yazilim', website: 'https://www.notion.so', currency: 'USD', cycle: 'MONTHLY' , color: '#000000' },
  { slug: 'github', name: 'GitHub', kategori: 'yazilim', website: 'https://github.com', currency: 'USD', cycle: 'MONTHLY' , color: '#181717' },
  { slug: 'chatgpt-plus', name: 'ChatGPT Plus', kategori: 'yazilim', website: 'https://chat.openai.com', currency: 'USD', cycle: 'MONTHLY' , color: '#10A37F' },
  { slug: 'claude-pro', name: 'Claude Pro', kategori: 'yazilim', website: 'https://claude.ai', currency: 'USD', cycle: 'MONTHLY' , color: '#D97757' },
  /*
   * Play Store tek bir servis değil, faturalama kanalı: Android'de alınan
   * pek çok abonelik buradan çekiliyor ve ekstrede "Google Play" olarak
   * görünüyor. Kullanıcı hangi uygulamaya ödediğini not olarak yazabilsin
   * diye tek bir kalem olarak duruyor.
   *
   * Ad "Google Play Store": seçicideki arama yalnızca ada bakıyor, bu ad
   * hem "play" hem "store" hem "google" yazana çıkıyor.
   */
  { slug: 'google-play', name: 'Google Play Store', kategori: 'yazilim', website: 'https://play.google.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#01875F' },

  // Bulut depolama
  { slug: 'icloud-plus', name: 'iCloud+', kategori: 'bulut', website: 'https://www.icloud.com', currency: 'TRY', cycle: 'MONTHLY' },
  { slug: 'google-one', name: 'Google One', kategori: 'bulut', website: 'https://one.google.com', currency: 'TRY', cycle: 'MONTHLY' , color: '#4285F4' },
  { slug: 'dropbox', name: 'Dropbox', kategori: 'bulut', website: 'https://www.dropbox.com', cycle: 'MONTHLY' , color: '#0061FF' },

  // Spor ve eğitim
  { slug: 'strava', name: 'Strava', kategori: 'spor', website: 'https://www.strava.com', cycle: 'MONTHLY' , color: '#FC4C02' },
  { slug: 'duolingo-super', name: 'Duolingo Super', kategori: 'egitim', website: 'https://www.duolingo.com', cycle: 'YEARLY' , color: '#58CC02' },
  { slug: 'udemy', name: 'Udemy', kategori: 'egitim', website: 'https://www.udemy.com', cycle: 'MONTHLY' , color: '#A435F0' },

  // İnternet ve telefon
  { slug: 'turk-telekom', name: 'Türk Telekom', kategori: 'internet', website: 'https://www.turktelekom.com.tr', currency: 'TRY', cycle: 'MONTHLY' },
  { slug: 'turkcell', name: 'Turkcell', kategori: 'internet', website: 'https://www.turkcell.com.tr', currency: 'TRY', cycle: 'MONTHLY' , color: '#FFC900' },
  { slug: 'vodafone', name: 'Vodafone', kategori: 'internet', website: 'https://www.vodafone.com.tr', currency: 'TRY', cycle: 'MONTHLY' , color: '#E60000' },
];

async function main(): Promise<void> {
  const kategoriKimlikleri = await tohumlaKategoriler();
  const saglayiciSayisi = await tohumlaSaglayicilar(kategoriKimlikleri);

  console.log(
    `Tohumlama tamam: ${kategoriKimlikleri.size} kategori, ${saglayiciSayisi} sağlayıcı.`,
  );
}

/**
 * Kategorileri yazıp slug → id eşlemesini döndürüyor.
 *
 * `upsert` yerine önce arayıp sonra yazıyoruz: `upsert` tekil bir anahtar
 * istiyor, sistem kategorilerinin tekilliği ise kısmi indeksle sağlanıyor ve
 * Prisma o indeksi bilmiyor.
 */
async function tohumlaKategoriler(): Promise<Map<string, string>> {
  const eslesme = new Map<string, string>();

  for (const kategori of KATEGORILER) {
    const mevcut = await prisma.category.findFirst({
      where: { userId: null, slug: kategori.slug },
    });

    const satir =
      mevcut === null
        ? await prisma.category.create({
            data: { ...kategori, userId: null, isSystem: true },
          })
        : await prisma.category.update({
            where: { id: mevcut.id },
            data: { name: kategori.name, icon: kategori.icon, color: kategori.color },
          });

    eslesme.set(kategori.slug, satir.id);
  }

  return eslesme;
}

async function tohumlaSaglayicilar(
  kategoriKimlikleri: Map<string, string>,
): Promise<number> {
  for (const saglayici of SAGLAYICILAR) {
    const kategoriId = kategoriKimlikleri.get(saglayici.kategori);
    if (kategoriId === undefined) {
      throw new Error(
        `${saglayici.slug}: '${saglayici.kategori}' kategorisi tanımlı değil.`,
      );
    }

    // Logo adresleri bilerek boş: elimde barındırdığım bir logo seti yok ve
    // üçüncü taraf CDN adresi uydurmak kırık görsel demek. Arayüz logo
    // yokken kategori simgesini gösteriyor.
    const alanlar = {
      name: saglayici.name,
      website: saglayici.website,
      color: saglayici.color ?? null,
      logoUrl: LOGOLAR[saglayici.slug] ?? null,
      defaultCategoryId: kategoriId,
      defaultCurrency: saglayici.currency ?? null,
      defaultBillingCycle: saglayici.cycle ?? null,
      isActive: true,
    };

    await prisma.provider.upsert({
      where: { slug: saglayici.slug },
      create: { slug: saglayici.slug, ...alanlar },
      update: alanlar,
    });
  }

  return SAGLAYICILAR.length;
}

main()
  .catch((hata: unknown) => {
    console.error('Tohumlama başarısız:', hata);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
