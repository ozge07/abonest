import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma istemcisinin uygulama yaşam döngüsüne bağlanmış hâli.
 *
 * **Prisma 7'de sürücü adaptörü zorunlu.** Bağlantı adresi artık şema
 * dosyasında değil; istemci `PrismaPg` adaptörüyle kuruluyor. Bu, Prisma'nın
 * kendi Rust motoru yerine standart `pg` sürücüsünü kullanmasını sağlıyor —
 * paket boyutu küçülüyor ve bağlantı havuzu davranışı öngörülebilir oluyor.
 *
 * Nest kapanırken bağlantı kapatılıyor; aksi hâlde testlerde ve yeniden
 * başlatmalarda bağlantı sızıyor.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (connectionString === undefined) {
      // Normalde loadConfig() bunu açılışta yakalıyor; burada da kontrol
      // ediyoruz çünkü bu sınıf testlerde doğrudan kurulabiliyor.
      throw new Error('DATABASE_URL tanımlı değil.');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
