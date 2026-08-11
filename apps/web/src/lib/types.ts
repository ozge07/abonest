/**
 * API'nin döndürdüğü şekiller.
 *
 * Elle yazılıyor çünkü backend'in DTO'ları Nest'e ve Prisma'ya bağlı; onları
 * paylaşmak arayüzü sunucunun iç tiplerine bağlardı. Sözleşme
 * `docs/api.md` içinde ve burada onun karşılığı duruyor.
 */

export type BillingCycle =
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'HALF_YEARLY'
  | 'YEARLY'
  | 'CUSTOM';

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'PAUSED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface Kategori {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
}

export interface Saglayici {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  website: string | null;
  defaultCategoryId: string | null;
  defaultBillingCycle: BillingCycle | null;
  defaultCurrency: string | null;
}

export interface Abonelik {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  priceMinor: number;
  currency: string;
  billingCycle: BillingCycle;
  customIntervalDays: number | null;
  monthlyEquivalentMinor: number;
  yearlyMinor: number;
  startDate: string;
  nextPaymentDate: string | null;
  endDate: string | null;
  trialEndsAt: string | null;
  lastUsedAt: string | null;
  status: SubscriptionStatus;
  paymentMethod: string | null;
  reminderEnabled: boolean;
  reminderDaysBefore: number;
  category: { id: string; name: string };
  provider: { id: string; name: string; logoUrl: string | null } | null;
  createdAt: string;
}

export interface Sayfa<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Ozet {
  activeCount: number;
  totals: { currency: string; monthlyMinor: number; yearlyMinor: number }[];
  upcoming: {
    subscriptionId: string;
    name: string;
    amountMinor: number;
    currency: string;
    dueDate: string;
    daysUntil: number;
  }[];
  byCategory: {
    categoryId: string;
    name: string;
    currency: string;
    monthlyMinor: number;
    share: number;
  }[];
  cancelledThisMonth: number;
}

export interface Kullanici {
  id: string;
  email: string;
  name: string;
  currency: string;
  emailVerifiedAt: string | null;
}
