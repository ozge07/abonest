import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { DailyJobService, type GunlukSonuc } from './daily.service.js';

const CRON_HEADER = 'x-cron-secret';

/**
 * Zamanlanmış işlerin tetikleyicisi.
 *
 * Kullanıcı oturumuyla değil, **paylaşılan sırla** korunuyor: bu ucu çağıran
 * GitHub Actions, bir insan değil. `@Public()` burada "herkese açık" demek
 * değil; "oturum guard'ı devrede olmasın" demek — yetki kontrolü aşağıda,
 * elle yapılıyor.
 */
@Controller('internal/jobs')
@Public()
export class JobsController {
  constructor(private readonly daily: DailyJobService) {}

  @Post('daily')
  @HttpCode(200)
  async runDaily(
    @Headers(CRON_HEADER) gelenSir?: string,
  ): Promise<GunlukSonuc> {
    assertCronSecret(gelenSir);
    return this.daily.run();
  }
}

/**
 * Sırrı sabit zamanda karşılaştırıyor.
 *
 * Doğrudan `===` karşılaştırması ilk farklı karakterde dönüyor ve yanıt
 * süresinden sır karakter karakter tahmin edilebiliyor. Uzunluklar farklı
 * olabildiği için önce özet alınıyor: `timingSafeEqual` eşit uzunluk istiyor
 * ve uzunluğun kendisi de bir ipucu.
 */
function assertCronSecret(gelen: string | undefined): void {
  const beklenen = process.env['CRON_SECRET'];
  if (beklenen === undefined || gelen === undefined) {
    throw new ForbiddenException('Yetkisiz');
  }

  const a = createHash('sha256').update(gelen).digest();
  const b = createHash('sha256').update(beklenen).digest();
  if (!timingSafeEqual(a, b)) {
    throw new ForbiddenException('Yetkisiz');
  }
}
