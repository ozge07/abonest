import { z } from 'zod';
import { BILLING_CYCLES, CURRENCIES } from '@abonelik/shared';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı');

/**
 * Tutar tamsayı kuruş olarak geliyor.
 *
 * Ondalık kabul etmiyoruz: "299.90" istemciden gelseydi kayan nokta olarak
 * ayrıştırılırdı. İstemci `parseAmount` ile kuruşa çeviriyor (shared paketi),
 * sunucu yalnızca tamsayı görüyor. Üst sınır bir tutarlılık denetimi:
 * 10 milyar kuruş = 100 milyon lira, hiçbir abonelik bu değil.
 */
const priceMinor = z.number().int('Tutar tamsayı kuruş olmalı')
  .min(0, 'Tutar negatif olamaz')
  .max(1_000_000_000_00, 'Tutar makul aralığın dışında');

const base = {
  name: z.string().trim().min(1, 'Ad boş olamaz').max(120),
  categoryId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  description: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
  priceMinor,
  currency: z.enum(CURRENCIES),
  billingCycle: z.enum(BILLING_CYCLES),
  customIntervalDays: z.number().int().min(1).max(3650).optional(),
  startDate: isoDate,
  endDate: isoDate.optional(),
  trialEndsAt: isoDate.optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
};

/**
 * CUSTOM döngüde gün aralığı zorunlu.
 *
 * Bu kural şemada, servis içinde değil: geçersiz veri iş mantığına hiç
 * ulaşmıyor ve hata mesajı alan bazında dönüyor.
 */
const cycleRefinement = (data: {
  billingCycle?: string | undefined;
  customIntervalDays?: number | undefined;
}): boolean => data.billingCycle !== 'CUSTOM' || data.customIntervalDays !== undefined;

export const createSubscriptionSchema = z
  .object(base)
  .refine(cycleRefinement, {
    message: 'Özel döngüde gün aralığı zorunlu',
    path: ['customIntervalDays'],
  })
  .refine(
    (d) => d.endDate === undefined || d.endDate >= d.startDate,
    { message: 'Bitiş tarihi başlangıçtan önce olamaz', path: ['endDate'] },
  );
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const updateSubscriptionSchema = z
  .object({ ...base, lastUsedAt: isoDate.optional() })
  .partial()
  .refine(cycleRefinement, {
    message: 'Özel döngüde gün aralığı zorunlu',
    path: ['customIntervalDays'],
  });
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED']).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  currency: z.enum(CURRENCIES).optional(),
  minPriceMinor: z.coerce.number().int().min(0).optional(),
  maxPriceMinor: z.coerce.number().int().min(0).optional(),
  nextPaymentBefore: isoDate.optional(),
  sort: z.enum(['name', 'priceMinor', 'nextPaymentDate', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().uuid().optional(),
  // Üst sınır bir DoS önlemi: limit=100000 tek istekte veritabanını süpürürdü.
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
