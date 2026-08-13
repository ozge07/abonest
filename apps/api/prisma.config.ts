import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7'de bağlantı adresi şema dosyasından buraya taşındı.
 * Değer .env'den geliyor; .env git'e girmiyor (bkz. .env.example).
 *
 * ## Neden `env()` yardımcısı değil de doğrudan okuma
 *
 * Prisma'nın `env('DATABASE_URL')` yardımcısı değişken **tanımsızsa bu
 * dosyayı yüklerken çöküyor** — hangi komut çalıştırılırsa çalıştırılsın.
 * Oysa `prisma generate` veritabanına hiç bağlanmıyor; yalnızca şemadan
 * istemci üretiyor.
 *
 * Sonucu ölçtük: temiz bir klonda `npm run prisma:generate` "Cannot resolve
 * environment variable: DATABASE_URL" diyerek düşüyordu. Aynı sebeple
 * konteyner imajı da derlenemezdi — derleme aşamasında veritabanı adresi
 * yok ve olmamalı da (adres bir sır, imaja gömülmemeli).
 *
 * Bu yüzden değer doğrudan okunuyor ve yoksa **derleme zamanı için**
 * anlamsız ama geçerli biçimde bir yer tutucu kullanılıyor. Gerçekten
 * bağlanan komutlar (`migrate`, `db push`, `studio`) yer tutucuyla
 * çalışmıyor; onlar zaten adres verilmeden kullanılmıyor.
 */
const YER_TUTUCU = 'postgresql://derleme@localhost:5432/derleme';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? YER_TUTUCU },
});
