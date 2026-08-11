import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { Public } from '../auth/auth.decorators.js';

/**
 * Sağlık uçları. İkisi ayrı şeyler ölçüyor:
 *
 * - `/health`  → süreç ayakta mı? Yük dengeleyici bunu görüp örneği canlı sayar.
 * - `/ready`   → istek karşılamaya hazır mı? Veritabanı erişilemiyorsa hayır.
 *
 * Ayrım pratik: veritabanı geçici olarak düşerse süreç öldürülmemeli (health
 * başarılı), ama trafik de gönderilmemeli (ready başarısız).
 *
 * Kimlik doğrulama gerektirmiyor — altyapı bunları oturum açmadan çağırıyor.
 * `@Public()` bunun için şart: kimlik guard'ı global ve işaret olmadan bu
 * uçlar da 401 dönüyor. O hâlde yük dengeleyici ayakta olan uygulamayı ölü
 * sayar ve örneği sürekli yeniden başlatır.
 */
@Controller()
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  @HttpCode(200)
  health(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  @Get('ready')
  @HttpCode(200)
  async ready(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch {
      // Ayrıntı istemciye gitmiyor; log'da zaten var.
      throw new ServiceUnavailableException('Veritabanına erişilemiyor');
    }
  }
}
