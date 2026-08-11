import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7'de bağlantı adresi şema dosyasından buraya taşındı.
 * Değer .env'den geliyor; .env git'e girmiyor (bkz. .env.example).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
