import { z } from 'zod';
import { CURRENCIES } from '@abonelik/shared';

/**
 * Şifre kuralları.
 *
 * Uzunluk tek başına karmaşıklık kurallarından daha etkili: "en az bir büyük
 * harf, bir rakam, bir sembol" gibi kurallar kullanıcıyı `Parola1!` yazmaya
 * itiyor — tahmin edilmesi kolay bir kalıp. 12 karakter alt sınır, NIST'in
 * güncel önerisiyle uyumlu.
 *
 * Üst sınır bir DoS önlemi: Argon2 girdiyi bellekte işliyor, megabaytlık bir
 * "şifre" sunucuyu meşgul edebilirdi.
 */
const password = z
  .string()
  .min(12, 'Şifre en az 12 karakter olmalı')
  .max(200, 'Şifre çok uzun');

const email = z
  .string()
  .email('Geçerli bir e-posta adresi gir')
  .max(254) // RFC 5321 üst sınırı
  .transform((value) => value.trim().toLowerCase());

export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1, 'Ad boş olamaz').max(100),
  currency: z.enum(CURRENCIES).default('TRY'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  // Girişte uzunluk kuralı **yok**: kurallar sıkılaşırsa eski şifreliler
  // giriş yapamaz hâle gelirdi.
  password: z.string().min(1, 'Şifre boş olamaz').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.string().min(1).max(64).optional(),
  locale: z.enum(['tr', 'en']).optional(),
});
