import { z } from 'zod';
import {
  adAlani,
  CURRENCIES,
  epostaAlani,
  SIFRE_MAX,
  sifreAlani,
} from '@abonelik/shared';

/*
 * Alan kuralları ortak pakette (`packages/shared/src/validation.ts`), çünkü
 * arayüz de aynılarını kullanıyor. Kopyalansaydı biri değiştiğinde diğeri
 * sessizce eski kalırdı.
 *
 * Buradaki doğrulama **güvenlik kararı**; arayüzdeki yalnızca kullanıcı
 * deneyimi.
 */
const password = sifreAlani;
const email = epostaAlani;

export const registerSchema = z.object({
  email,
  password,
  name: adAlani,
  currency: z.enum(CURRENCIES).default('TRY'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  // Girişte uzunluk kuralı **yok**: kurallar sıkılaşırsa eski şifreliler
  // giriş yapamaz hâle gelirdi.
  password: z.string().min(1, 'Şifre boş olamaz').max(SIFRE_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(SIFRE_MAX),
  newPassword: password,
});

export const updateProfileSchema = z.object({
  name: adAlani.optional(),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.string().min(1).max(64).optional(),
  locale: z.enum(['tr', 'en']).optional(),
});
