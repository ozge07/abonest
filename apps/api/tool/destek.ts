/**
 * Destek aracı — operatörün müdahale yolu.
 *
 *   npm run destek -w @abonelik/api -- <komut> [argüman]
 *
 * ## Neden bir komut satırı aracı, yönetici paneli değil
 *
 * Yönetici rolü, bu sistemdeki **en değerli hedef** olurdu: herkesin
 * finansal verisini okuyabilen tek bir hesap. Proje boyunca yetkilendirmeyi
 * derleyiciye bağladık ve IDOR'u yapısal olarak kapattık; üstüne "her şeyi
 * görebilen bir rol" koymak o işin çoğunu geri alır. Bir de o hesabın
 * şifresi, oturumu ve kurtarma akışı yeni saldırı yüzeyi demek.
 *
 * Bu araç veritabanı erişimiyle çalışıyor. Zaten veritabanına erişebilen
 * biri her şeyi yapabilir; araç yeni bir yetki açmıyor, yalnızca elle SQL
 * yazmanın hata payını kaldırıyor.
 *
 * ## Yazma işlemleri onay istiyor
 *
 * Silme ve geri getirme `--onayla` olmadan çalışmıyor. Yanlış kullanıcıda
 * çalıştırılan bir komut, düzeltmeye çalıştığı sorundan büyük olabilir.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env['DATABASE_URL'];
if (connectionString === undefined) {
  console.error('DATABASE_URL tanımlı değil.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const [, , komut, ...argumanlar] = process.argv;
const onayli = argumanlar.includes('--onayla');
const girdi = argumanlar.filter((a) => !a.startsWith('--'));

const KULLANIM = `
Destek aracı

  npm run destek -w @abonelik/api -- <komut> [argüman]

Okuma komutları:
  kullanici <e-posta>          Hesabı ve özetini gösterir
  abonelikler <e-posta>        Aboneliklerini listeler (silinmişler dahil)
  gecmis <e-posta>             Denetim kaydını gösterir (son 20 olay)

Yazma komutları (--onayla gerektirir):
  geri-getir <abonelik-id>     Silinmiş aboneliği geri getirir
  hesap-geri-getir <e-posta>   Silinmiş hesabı geri getirir
  hesap-sil <e-posta>          Hesabı siler (30 gün sonra kalıcı)

Örnek:
  npm run destek -w @abonelik/api -- abonelikler ozge@ornek.com
  npm run destek -w @abonelik/api -- geri-getir 019ff... --onayla
`;

function para(minor: bigint | number, currency: string): string {
  const tam = Math.floor(Number(minor) / 100);
  const kurus = String(Number(minor) % 100).padStart(2, '0');
  return `${tam},${kurus} ${currency}`;
}

function gun(tarih: Date | null): string {
  return tarih === null ? '—' : tarih.toISOString().slice(0, 10);
}

async function kullaniciBul(eposta: string) {
  const user = await prisma.user.findUnique({ where: { email: eposta } });
  if (user === null) {
    console.error(`Kullanıcı bulunamadı: ${eposta}`);
    process.exit(1);
  }
  return user;
}

/** Yazma komutlarında onay yoksa durduruyor. */
function onayIste(ne: string): void {
  if (!onayli) {
    console.error(`Bu işlem geri alınamaz olabilir: ${ne}`);
    console.error('Emin olduğunda komutun sonuna --onayla ekle.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  switch (komut) {
    case 'kullanici': {
      const user = await kullaniciBul(girdi[0] ?? '');
      const aktif = await prisma.subscription.count({
        where: { userId: user.id, status: 'ACTIVE', deletedAt: null },
      });
      const silinmis = await prisma.subscription.count({
        where: { userId: user.id, deletedAt: { not: null } },
      });

      console.log(`E-posta      : ${user.email}`);
      console.log(`Kimlik       : ${user.id}`);
      console.log(`Ad           : ${user.name}`);
      console.log(`Kayıt        : ${gun(user.createdAt)}`);
      console.log(`Son giriş    : ${gun(user.lastLoginAt)}`);
      console.log(`E-posta doğr.: ${user.emailVerifiedAt === null ? 'HAYIR' : 'evet'}`);
      console.log(
        `Hesap silme  : ${user.deletedAt === null ? '—' : `${gun(user.deletedAt)} (30 gün sonra kalıcı)`}`,
      );
      console.log(`Abonelik     : ${aktif} aktif, ${silinmis} çöp kutusunda`);
      break;
    }

    case 'abonelikler': {
      const user = await kullaniciBul(girdi[0] ?? '');
      const abonelikler = await prisma.subscription.findMany({
        where: { userId: user.id },
        include: { category: true },
        orderBy: [{ deletedAt: 'asc' }, { name: 'asc' }],
      });

      if (abonelikler.length === 0) {
        console.log('Hiç abonelik yok.');
        break;
      }

      for (const abonelik of abonelikler) {
        const durum =
          abonelik.deletedAt !== null
            ? `SİLİNDİ ${gun(abonelik.deletedAt)}`
            : abonelik.status;
        console.log(
          `${abonelik.id}  ${abonelik.name.padEnd(22)} ${para(abonelik.priceMinor, abonelik.currency).padStart(14)}  ${durum}`,
        );
      }
      console.log('');
      console.log('Silinmiş bir aboneliği geri getirmek için:');
      console.log('  npm run destek -w @abonelik/api -- geri-getir <kimlik> --onayla');
      break;
    }

    case 'gecmis': {
      const user = await kullaniciBul(girdi[0] ?? '');
      const kayitlar = await prisma.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (kayitlar.length === 0) {
        console.log('Denetim kaydı yok.');
        break;
      }
      for (const kayit of kayitlar) {
        const ne = kayit.entityId === null ? '' : ` ${kayit.entityId}`;
        console.log(
          `${kayit.createdAt.toISOString().slice(0, 19)}  ${kayit.action}${ne}`,
        );
      }
      break;
    }

    case 'geri-getir': {
      const id = girdi[0] ?? '';
      const abonelik = await prisma.subscription.findUnique({ where: { id } });

      if (abonelik === null) {
        console.error(`Abonelik bulunamadı: ${id}`);
        process.exit(1);
      }
      if (abonelik.deletedAt === null) {
        console.log('Bu abonelik zaten silinmemiş; yapılacak bir şey yok.');
        break;
      }

      onayIste(`${abonelik.name} geri getirilecek`);
      await prisma.subscription.update({
        where: { id },
        data: { deletedAt: null },
      });
      console.log(`Geri getirildi: ${abonelik.name}`);
      console.log(
        'Not: ödemeleri bir sonraki günlük işte yeniden üretilecek. Hemen ' +
          'istersen işi elle tetikle (bkz. README, "Günlük iş").',
      );
      break;
    }

    case 'hesap-geri-getir': {
      const user = await kullaniciBul(girdi[0] ?? '');
      if (user.deletedAt === null) {
        console.log('Bu hesap silinmemiş; yapılacak bir şey yok.');
        break;
      }

      onayIste(`${user.email} hesabı geri getirilecek`);
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: null },
      });
      console.log(`Geri getirildi: ${user.email}`);
      console.log('Kullanıcı yeniden giriş yapabilir.');
      break;
    }

    case 'hesap-sil': {
      const user = await kullaniciBul(girdi[0] ?? '');
      if (user.deletedAt !== null) {
        console.log(`Bu hesap zaten ${gun(user.deletedAt)} tarihinde silinmiş.`);
        break;
      }

      onayIste(`${user.email} hesabı silinecek`);
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });
      // Oturumlar hemen düşüyor; silinmiş hesabın açık oturumu kalmamalı.
      await prisma.session.deleteMany({ where: { userId: user.id } });
      console.log(`Silindi: ${user.email}`);
      console.log('30 gün içinde `hesap-geri-getir` ile geri alınabilir.');
      break;
    }

    default:
      console.log(KULLANIM);
      if (komut !== undefined) {
        process.exit(1);
      }
  }
}

main()
  .catch((hata: unknown) => {
    console.error('Hata:', hata);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
