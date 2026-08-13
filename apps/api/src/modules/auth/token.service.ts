import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * Oturum ve tek kullanımlık token üretimi.
 *
 * **Ham token veritabanına yazılmıyor, yalnızca SHA-256 özeti.** Veritabanı
 * sızarsa saldırgan özetleri görür ama onlarla oturum açamaz — tıpkı şifreler
 * gibi.
 *
 * Şifrelerin aksine burada Argon2 kullanmıyoruz: token 256 bit rastgele, yani
 * sözlük saldırısına konu değil. Her istekte Argon2 doğrulaması yapmak, oturum
 * kontrolünü 40 ms'e çıkarırdı. SHA-256 hem yeterli hem hızlı.
 */
@Injectable()
export class TokenService {
  /** Kullanıcıya verilen ham token ve veritabanına yazılan özeti. */
  generate(): { token: string; hash: string } {
    // 32 bayt = 256 bit. Tahmin edilemez olması için gereken tek şey bu.
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  /**
   * Elle girilecek 6 haneli kod.
   *
   * Kullanıcı uzun jetonu telefondan bilgisayara elle yazamıyor; şikâyet
   * buydu. Kısa kodun bedeli tahmin edilebilirlik: 10^6 ihtimal, kaba
   * kuvvete açık. Bu yüzden kod **tek başına yeterli değil** — yalnızca
   * oturum sahibi kendi kodunu deneyebiliyor ve deneme sayısı sınırlı.
   * Bağlantıdaki jeton uzun kalmaya devam ediyor, çünkü o oturumsuz
   * çalışıyor.
   *
   * `randomInt` kriptografik: `Math.random()` tahmin edilebilir bir dizi
   * üretiyor ve doğrulama kodunda bu, kodun kendisini tahmin edilebilir
   * yapardı.
   */
  generateCode(): { code: string; hash: string } {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    return { code, hash: this.hash(code) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  /**
   * Sabit zamanlı karşılaştırma.
   *
   * Oturum doğrulamasında özet üzerinden veritabanı araması yaptığımız için
   * bu gerekmiyor; ama CSRF token'ı gibi bellekte karşılaştırılan değerlerde
   * gerekiyor — `===` karakter karakter kısa devre yapıyor ve yanıt süresinden
   * doğru önek okunabiliyor.
   */
  safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    // Uzunluk farkı zaten sızıyor; timingSafeEqual eşit uzunluk istiyor.
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
