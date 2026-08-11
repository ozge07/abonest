import { z } from 'zod';

/** ISO takvim günü: `2026-01-31`. Saat bileşeni kabul edilmiyor. */
const isoGun = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-AA-GG bekleniyor');

export const spendingQuerySchema = z
  .object({
    from: isoGun,
    to: isoGun,
    groupBy: z.enum(['month', 'category']).default('month'),
  })
  // Ters aralık sessizce boş liste döndürürdü; kullanıcı da "harcamam yok"
  // sanırdı. Hata vermek daha dürüst.
  .refine((d) => d.from <= d.to, {
    message: 'Başlangıç, bitişten sonra olamaz',
    path: ['from'],
  });

export type SpendingQuery = z.infer<typeof spendingQuerySchema>;

export const unusedQuerySchema = z.object({
  thresholdDays: z.coerce.number().int().min(1).max(365).default(30),
});

export type UnusedQuery = z.infer<typeof unusedQuerySchema>;
