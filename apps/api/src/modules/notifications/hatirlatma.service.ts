import { Injectable, Inject } from '@nestjs/common';
import { daysBetween, toCalendarDate, toISODate } from '@abonelik/shared';
import type { Logger } from 'pino';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { EmailSender } from '../../infra/email/email-sender.js';
import { LOGGER } from '../../infra/logger/logger.token.js';
import { UYGULAMA_ADI } from '../../infra/marka.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Ödeme hatırlatmaları.
 *
 * Günlük işten ayrı bir servis, çünkü **iki tetikleyicisi** var: her sabah
 * koşan iş ve abonelik eklenmesi. Mantığın iki kopyası zamanla ayrışır ve
 * ayrıştığında fark "hatırlatma gelmedi" olarak, yani sessizce görünür.
 */
@Injectable()
export class HatirlatmaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailSender,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Hatırlatma penceresine giren ödemeler için bildirim ve e-posta.
   *
   * İki yerden çağrılıyor: her sabah günlük iş bütün abonelikler için,
   * bir de **abonelik eklendiği anda** yalnızca o abonelik için.
   *
   * İkincisi olmadan, ödemesine bir gün kalan bir abonelik eklendiğinde
   * kullanıcı "yarın" hatırlatmasını hiç almıyordu: ilk çalıştırma ertesi
   * sabahtı ve o zaman ödeme çoktan "bugün" olmuştu.
   *
   * Tekrar çağrılması zararsız: bildirim `(userId, type, occurrenceId)`
   * kısıtıyla bir kez yazılıyor, e-posta da `reminderSentAt` sayesinde
   * günde bir gidiyor. Yani ekleme anındaki çağrı, sabahki işin aynı
   * postayı ikinci kez göndermesine yol açmıyor.
   */
  async calistir(
    bugun: Date,
    subscriptionId?: string,
  ): Promise<{
    yeniBildirim: number;
    gonderilen: number;
    basarisiz: number;
  }> {
    // En geniş pencere kadar ileriye bakıp abonelik bazında eliyoruz; her
    // abonelik için ayrı sorgu atmaktansa tek sorgu.
    const enGenisPencere = 30;
    const sinir = new Date(bugun.getTime() + enGenisPencere * 86_400_000);

    const odemeler = await this.prisma.subscriptionOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        dueDate: { gte: bugun, lte: sinir },
        // Silinmiş abonelik için hatırlatma göndermek, kullanıcıya artık
        // takip etmediği bir şeyi hatırlatmak olur.
        subscription: { status: 'ACTIVE', reminderEnabled: true, deletedAt: null },
        // Tek abonelik için çağrıldığında yalnızca onunkiler.
        ...(subscriptionId !== undefined ? { subscriptionId } : {}),
      },
      include: {
        subscription: {
          select: {
            id: true,
            userId: true,
            name: true,
            reminderDaysBefore: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    let yeniBildirim = 0;
    let gonderilen = 0;
    let basarisiz = 0;

    for (const odeme of odemeler) {
      const sub = odeme.subscription;
      const kalanGun = daysBetween(bugun, toCalendarDate(odeme.dueDate));

      if (kalanGun > sub.reminderDaysBefore) {
        continue;
      }

      const tur = kalanGun === 0 ? 'PAYMENT_TODAY' : 'PAYMENT_REMINDER';
      const metin = hatirlatmaMetni(sub.name, kalanGun, odeme);

      const olustu = await this.notifications.createIfAbsent({
        userId: sub.userId,
        type: tur,
        title: metin.baslik,
        body: metin.govde,
        occurrenceId: odeme.id,
        metadata: {
          subscriptionId: sub.id,
          dueDate: toISODate(toCalendarDate(odeme.dueDate)),
          amountMinor: Number(odeme.amountMinor),
          currency: odeme.currency,
        },
      });
      if (olustu) {
        yeniBildirim += 1;
      }

      /*
       * E-posta **her gün** gidiyor; uygulama içi bildirim bir kez.
       *
       * Ödemeye üç gün kala tek bir posta atıp susmak, o postayı kaçıran
       * kullanıcı için hiç atmamakla aynı. Bildirim zilini de her gün yeni
       * bir satırla doldurmak ise gürültü olurdu — aynı ödeme için dört
       * satır kimseye bir şey söylemiyor.
       *
       * `reminderSentAt` "en son hangi gün gönderildi" bilgisini taşıyor.
       * Bugün gönderilmişse geçiyoruz; dünkü ya da boşsa gönderiyoruz. Bu
       * aynı zamanda gönderim hatasını da çözüyor: başarısız olursa alan
       * boş kalıyor ve bir sonraki tur tekrar deniyor.
       */
      const bugunGonderildi =
        odeme.reminderSentAt !== null &&
        toCalendarDate(odeme.reminderSentAt).getTime() >= bugun.getTime();

      if (bugunGonderildi) {
        continue;
      }

      try {
        await this.email.send({
          to: sub.user.email,
          subject: metin.baslik,
          text: `Merhaba ${sub.user.name},\n\n${metin.govde}\n\n${UYGULAMA_ADI}`,
        });
        await this.prisma.subscriptionOccurrence.update({
          where: { id: odeme.id },
          /*
           * İşin **günü** yazılıyor, duvar saati değil.
           *
           * Alanın tek işi "bugün gönderdik mi" sorusunu cevaplamak ve o
           * karşılaştırma `bugun` ile yapılıyor. Gerçek saati yazmak, işin
           * günü parametreyle verildiğinde (testlerde ve geçmişe dönük
           * çalıştırmalarda) iki değerin farklı takvimlerden gelmesi
           * demekti — kontrol sessizce hep "gönderilmemiş" diyordu.
           */
          data: { reminderSentAt: bugun },
        });
        gonderilen += 1;
      } catch (hata) {
        basarisiz += 1;
        this.logger.warn(
          { hata, occurrenceId: odeme.id },
          'Hatırlatma e-postası gönderilemedi; yarın tekrar denenecek',
        );
      }
    }

    return { yeniBildirim, gonderilen, basarisiz };
  }
}

function hatirlatmaMetni(
  ad: string,
  kalanGun: number,
  odeme: { amountMinor: bigint; currency: string; dueDate: Date },
): { baslik: string; govde: string } {
  const tutar = paraMetni(Number(odeme.amountMinor), odeme.currency);
  const tarih = tarihMetni(toCalendarDate(odeme.dueDate));

  if (kalanGun === 0) {
    return {
      baslik: `${ad} ödemesi bugün`,
      govde: `${ad} aboneliğinin ${tutar} tutarındaki ödemesi bugün alınacak.`,
    };
  }

  const ne = kalanGun === 1 ? 'yarın' : `${kalanGun} gün sonra`;
  return {
    baslik: `${ad} ödemesi ${ne}`,
    govde: `${ad} aboneliğinin ${tutar} tutarındaki ödemesi ${ne} (${tarih}) alınacak.`,
  };
}

/**
 * Sunucu tarafı tarih metni — `14/08/2026`.
 *
 * `2026-08-14` yazıyordu; makine biçimi, kullanıcıya gösterilecek bir şey
 * değil. Arayüzdeki `Intl` biçimlendiricisi burada kullanılamıyor: bu
 * metin e-postaya gidiyor ve **okuyan istemcinin yerelini biz
 * seçmiyoruz** — sunucunun `Intl` verisi eksikse sessizce İngilizce bir
 * tarih çıkardı. Elle biçimlendirmek bu belirsizliği kaldırıyor.
 */
function tarihMetni(tarih: Date): string {
  const gun = String(tarih.getUTCDate()).padStart(2, '0');
  const ay = String(tarih.getUTCMonth() + 1).padStart(2, '0');
  return `${gun}/${ay}/${tarih.getUTCFullYear()}`;
}

/**
 * Sunucu tarafı para metni.
 *
 * Arayüzdekinden ayrı çünkü bu metin e-postaya gidiyor ve tarayıcının
 * `Intl` yerelinden bağımsız olmalı; e-postayı okuyan istemciyi biz
 * seçmiyoruz.
 */
function paraMetni(minor: number, currency: string): string {
  const tam = Math.floor(minor / 100);
  const kurus = String(minor % 100).padStart(2, '0');
  return `${tam},${kurus} ${currency}`;
}
