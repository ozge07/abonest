import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Şifre özetleme.
 *
 * **Argon2id**, bcrypt değil. İki somut sebep:
 *
 * 1. bcrypt girdiyi 72 bayta kırpıyor — uzun parolalar sessizce kısalıyor ve
 *    kullanıcı fark etmiyor.
 * 2. Argon2 bellek-zor: GPU ile paralel kırma denemesi bellek darboğazına
 *    takılıyor. bcrypt yalnızca CPU-zor.
 *
 * Parametreler kütüphanenin varsayılanları (64 MB, 3 tur, 4 paralel) —
 * OWASP'ın önerdiği aralıkta ve bu makinede ~42 ms sürüyor. Daha yükseği
 * girişi yavaşlatır, daha düşüğü kırmayı ucuzlatır.
 */
@Injectable()
export class PasswordService {
  private readonly options = { type: argon2.argon2id } as const;

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Bozuk ya da tanınmayan özet biçimi: doğrulama başarısız sayılıyor,
      // istisna yukarı taşınmıyor. Aksi hâlde bozuk tek bir kayıt giriş
      // ucunu 500 döndürür hâle getirirdi.
      return false;
    }
  }

  /**
   * Kullanıcı bulunamadığında da bir özet doğrulaması yapılıyor.
   *
   * Amaç zamanlama sızıntısını kapatmak: var olmayan e-posta için hemen
   * dönmek, yanıt süresinden hangi adreslerin kayıtlı olduğunu okumayı
   * mümkün kılar. Bu çağrı sonucu kullanılmadan atılıyor, yalnızca süreyi
   * eşitliyor.
   */
  async wasteTime(): Promise<void> {
    await argon2.hash('zamanlama-esitleme', this.options);
  }
}
