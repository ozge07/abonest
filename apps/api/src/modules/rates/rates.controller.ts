import { Controller, Get } from '@nestjs/common';
import { RatesService } from './rates.service.js';

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  /**
   * Güncel kurlar.
   *
   * `@VerifiedEmail()` yok: kur kişisel veri değil ve arayüz bunu abonelik
   * listesiyle birlikte istiyor. Oturum yine gerekiyor — uygulamanın dışına
   * açık bir uç tutmanın sebebi yok.
   */
  @Get()
  async latest() {
    return this.rates.latest();
  }
}
