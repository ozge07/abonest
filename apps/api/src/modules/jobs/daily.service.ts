import { Inject, Injectable } from '@nestjs/common';
import { daysBetween, toCalendarDate, toISODate } from '@abonelik/shared';
import type { Logger } from 'pino';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { EmailSender } from '../../infra/email/email-sender.js';
import { LOGGER } from '../../infra/logger/logger.token.js';
import { AuditService } from '../../infra/audit/audit.service.js';
import { UYGULAMA_ADI } from '../../infra/marka.js';
import { HatirlatmaService } from '../notifications/hatirlatma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { OccurrenceService, today } from '../subscriptions/occurrence.service.js';
import { RatesService } from '../rates/rates.service.js';
import { PURGE_AFTER_DAYS } from '../users/users.service.js';

/**
 * Bir turda en fazla kaç abonelik işlenir.
 *
 * Sınırsız taramak, kullanıcı sayısı büyüdüğünde tek bir isteği dakikalarca
 * açık tutar ve tetikleyici zaman aşımına uğrar. Sınıra dayanılırsa iş
 * "bitmedi" diye raporluyor ve tetikleyici tekrar çağırabiliyor — işlemler
 * idempotent olduğu için tekrar çağırmak zararsız.
 */
const BATCH = 500;

export interface GunlukSonuc {
  uretilenOdeme: number;
  suresiDolan: number;
  yeniBildirim: number;
  temizlenenHesap: number;
  temizlenenAbonelik: number;
  gonderilenEposta: number;
  basarisizEposta: number;
  islenenAbonelik: number;
  guncellenenKur: number;
  tamamlandi: boolean;
}

/**
 * Günlük bakım işi.
 *
 * Dışarıdan (GitHub Actions cron) tetikleniyor ve **istek içinde senkron**
 * çalışıyor — arkada bir kuyruk işçisi beklemiyor. Gerekçe ADR-0015'te:
 * ücretsiz barındırma yanıt verildikten sonra süreci uyutabiliyor, dolayısıyla
 * "kuyruğa at, işçi alsın" deseni işin hiç koşmamasıyla sonuçlanabilir.
 *
 * Her adım **idempotent**: iş günde beş kez çalışsa da sonuç aynı. Bu, hata
 * durumunda "tekrar dene" demeyi güvenli kılıyor.
 */
@Injectable()
export class DailyJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occurrences: OccurrenceService,
    private readonly hatirlatmalar: HatirlatmaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailSender,
    private readonly audit: AuditService,
    private readonly rates: RatesService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async run(bugun = today()): Promise<GunlukSonuc> {
    const sonuc: GunlukSonuc = {
      uretilenOdeme: 0,
      suresiDolan: 0,
      yeniBildirim: 0,
      temizlenenHesap: 0,
      temizlenenAbonelik: 0,
      gonderilenEposta: 0,
      basarisizEposta: 0,
      islenenAbonelik: 0,
      guncellenenKur: 0,
      tamamlandi: true,
    };

    // Kur çekilemezse iş düşmüyor: hatırlatmalar kurdan bağımsız ve elde
    // zaten son bilinen kur var.
    sonuc.guncellenenKur = await this.rates.refresh();

    sonuc.suresiDolan = await this.bitmisAbonelikleriKapat(bugun);
    sonuc.temizlenenHesap = await this.silinenHesaplariTemizle();
    sonuc.temizlenenAbonelik = await this.silinenAbonelikleriTemizle();

    const abonelikler = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH + 1,
    });

    if (abonelikler.length > BATCH) {
      sonuc.tamamlandi = false;
      abonelikler.length = BATCH;
    }

    for (const { id } of abonelikler) {
      // Tek aboneliğin hatası bütün turu düşürmemeli: bir kullanıcının bozuk
      // verisi yüzünden herkesin hatırlatması kaçmasın.
      try {
        sonuc.uretilenOdeme += await this.occurrences.syncFor(id, bugun);
        sonuc.islenenAbonelik += 1;
      } catch (hata) {
        sonuc.tamamlandi = false;
        this.logger.error({ hata, subscriptionId: id }, 'Ödeme üretilemedi');
      }
    }

    const hatirlatma = await this.hatirlatmalar.calistir(bugun);
    sonuc.yeniBildirim = hatirlatma.yeniBildirim;
    sonuc.gonderilenEposta = hatirlatma.gonderilen;
    sonuc.basarisizEposta = hatirlatma.basarisiz;

    this.logger.info({ sonuc }, 'Günlük iş tamamlandı');
    return sonuc;
  }

  /**
   * Silinme talebi üzerinden bekleme süresi geçmiş hesapları **kalıcı**
   * siliyor.
   *
   * Hesap silme yumuşak: `deletedAt` işaretleniyor ve kullanıcıya kaç gün
   * sonra kalıcı silineceği söyleniyor. Bu vaadi tutan kod buydu ve yoktu —
   * yani veri süresiz duruyordu. Bir kullanıcıya verisinin sileneceğini
   * söyleyip silmemek, teknik bir eksiklik değil, sözü tutmamak.
   *
   * Silme ilişkiler üzerinden akıyor (`onDelete: Cascade`): abonelikler,
   * ödemeler, oturumlar, bildirimler gidiyor. Denetim kayıtları
   * `onDelete: SetNull` ile kalıyor ama kime ait oldukları kalmıyor.
   */
  private async silinenHesaplariTemizle(): Promise<number> {
    const sinir = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000);

    const sonuc = await this.prisma.user.deleteMany({
      where: { deletedAt: { not: null, lt: sinir } },
    });

    if (sonuc.count > 0) {
      // Kimliği yazmıyoruz: kullanıcı artık yok, kaydın kime ait olduğunu
      // saklamak silmenin amacına aykırı olurdu.
      await this.audit.record({
        action: 'account.purged',
        metadata: { count: sonuc.count },
      });
    }

    return sonuc.count;
  }

  /**
   * Bekleme süresi dolmuş silinmiş abonelikleri **kalıcı** siliyor.
   *
   * Silme geri alınabilir: kullanıcı yanlışlıkla sildiğinde veri anında yok
   * olmuyor. Bu iş, pencereyi kapatıp kaydı gerçekten kaldırıyor; ödeme
   * kayıtları ilişki üzerinden gidiyor.
   */
  private async silinenAbonelikleriTemizle(): Promise<number> {
    const sinir = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000);

    const sonuc = await this.prisma.subscription.deleteMany({
      where: { deletedAt: { not: null, lt: sinir } },
    });
    return sonuc.count;
  }

  /**
   * Bitiş tarihi geçmiş abonelikleri `EXPIRED` yapıyor.
   *
   * Durum geçişinin kendisi tekillik koruması: `updateMany` yalnızca hâlâ
   * `ACTIVE` olan satırı güncelliyor, dolayısıyla iki iş aynı anda koşsa bile
   * yalnızca biri "1 satır güncelledim" diyor ve bildirimi yalnızca o
   * oluşturuyor.
   *
   * Bu bildirimde `occurrenceId` yok, yani `(userId, type, occurrenceId)`
   * kısıtı NULL yüzünden koruma sağlamıyor — koruma buradaki geçişten
   * geliyor.
   */
  private async bitmisAbonelikleriKapat(bugun: Date): Promise<number> {
    const adaylar = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', endDate: { lt: bugun }, deletedAt: null },
      select: { id: true, userId: true, name: true },
    });

    let sayi = 0;
    for (const aday of adaylar) {
      const guncellendi = await this.prisma.subscription.updateMany({
        where: { id: aday.id, status: 'ACTIVE' },
        data: { status: 'EXPIRED', nextPaymentDate: null },
      });
      if (guncellendi.count === 0) {
        continue;
      }

      sayi += 1;
      await this.notifications.createIfAbsent({
        userId: aday.userId,
        type: 'SUBSCRIPTION_EXPIRED',
        title: `${aday.name} aboneliği sona erdi`,
        body: `${aday.name} aboneliğinin bitiş tarihi geçti; artık takip edilmiyor.`,
        metadata: { subscriptionId: aday.id },
      });
    }

    return sayi;
  }
}
