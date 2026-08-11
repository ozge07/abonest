import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service.js';

/**
 * Kullanıcıya kapsanmış veri erişimi — IDOR'a karşı **yapısal** önlem.
 *
 * ## Sorun
 *
 * Yetki kontrolünü denetleyicide `if (kayit.userId !== kullanici.id)` diye
 * yazmak işe yarar, ta ki bir yerde unutulana kadar. Unutulduğunda hiçbir şey
 * kırılmaz: testler geçer, tip denetimi susar, kod incelemesinde satır masum
 * görünür. Sonuç, bir kullanıcının başkasının abonelik verisini okuması olur.
 *
 * ## Çözüm
 *
 * Sorgu kurma işi bu sınıfa alınıyor ve `userId` filtresini **sınıf**
 * ekliyor, çağıran değil. Çağıran yalnızca kalan koşulları veriyor:
 *
 * ```ts
 * // Kullanıcı kimliği geçilmiyor; kapsam nesnesi zaten ona bağlı.
 * const abonelik = await kapsam.findUnique(id);
 * ```
 *
 * Kapsam nesnesi ancak oturum sahibinin kimliğiyle üretilebildiği için,
 * "filtresiz sorgu" yazmanın yolu yok. Unutmak mümkün değil çünkü unutulacak
 * bir adım kalmıyor.
 *
 * ## Bulunamadı ve başkasına ait aynı şey
 *
 * Her ikisi de `null` dönüyor; denetleyici ikisini de 404'e çeviriyor. 403
 * dönmek "bu kimlik var ama senin değil" bilgisini sızdırırdı.
 */
export class ScopedSubscriptionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userId: string,
  ) {}

  /** Kapsam içindeki temel koşul. Her sorgu bununla başlıyor. */
  private get scope(): { userId: string } {
    return { userId: this.userId };
  }

  async findMany(args: {
    where?: Omit<Prisma.SubscriptionWhereInput, 'userId'>;
    orderBy?: Prisma.SubscriptionOrderByWithRelationInput;
    take?: number;
    cursor?: { id: string };
    skip?: number;
  }) {
    return this.prisma.subscription.findMany({
      // Yayılma sırası önemli: `scope` sonda, böylece çağıran `userId`
      // geçirmeye çalışsa bile ezilir. Tip de zaten buna izin vermiyor.
      where: { ...args.where, ...this.scope },
      include: { category: true, provider: true },
      ...(args.orderBy !== undefined ? { orderBy: args.orderBy } : {}),
      ...(args.take !== undefined ? { take: args.take } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
      ...(args.skip !== undefined ? { skip: args.skip } : {}),
    });
  }

  async count(where?: Omit<Prisma.SubscriptionWhereInput, 'userId'>) {
    return this.prisma.subscription.count({
      where: { ...where, ...this.scope },
    });
  }

  /**
   * Tek kayıt. `findUnique` yerine `findFirst` kullanılıyor: `findUnique`
   * yalnızca tekil alanlarla çalışıyor ve `userId` koşulunu eklememize izin
   * vermiyor — yani kapsamı zorlayamıyoruz.
   */
  async findById(id: string) {
    return this.prisma.subscription.findFirst({
      where: { id, ...this.scope },
      include: { category: true, provider: true },
    });
  }

  async create(data: Omit<Prisma.SubscriptionUncheckedCreateInput, 'userId'>) {
    return this.prisma.subscription.create({
      data: { ...data, ...this.scope },
      include: { category: true, provider: true },
    });
  }

  /**
   * Güncelleme `updateMany` ile yapılıyor.
   *
   * `update` tekil anahtar istiyor ve `userId` koşulu ekleyemiyoruz; başka
   * kullanıcının kaydını güncellememek için önce okuyup kontrol etmek
   * gerekirdi — o da tam kaçındığımız "unutulabilir kontrol". `updateMany`
   * koşulu sorguya gömüyor ve etkilenen satır sayısını döndürüyor.
   */
  async update(
    id: string,
    data: Omit<Prisma.SubscriptionUncheckedUpdateInput, 'userId' | 'id'>,
  ): Promise<boolean> {
    const result = await this.prisma.subscription.updateMany({
      where: { id, ...this.scope },
      data,
    });
    return result.count > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.prisma.subscription.deleteMany({
      where: { id, ...this.scope },
    });
    return result.count > 0;
  }

  /** Abonelik bu kullanıcıya aitse ödeme kayıtlarını döndürüyor. */
  async occurrences(subscriptionId: string) {
    return this.prisma.subscriptionOccurrence.findMany({
      // İlişki üzerinden kapsam: occurrence'ın kendisinde userId yok, ama
      // bağlı olduğu aboneliğinkine bakabiliyoruz.
      where: { subscriptionId, subscription: this.scope },
      orderBy: { dueDate: 'asc' },
    });
  }
}

/**
 * Kapsam üreticisi.
 *
 * Denetleyici bunu oturum sahibinin kimliğiyle çağırıyor; başka bir kimlikle
 * çağırmanın meşru bir sebebi yok ve kod incelemesinde hemen göze çarpar.
 */
export function scopeTo(
  prisma: PrismaService,
  userId: string,
): ScopedSubscriptionRepository {
  return new ScopedSubscriptionRepository(prisma, userId);
}
