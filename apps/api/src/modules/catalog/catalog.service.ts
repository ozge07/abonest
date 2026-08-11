import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/database/prisma.service.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(q?: string) {
    return this.prisma.provider.findMany({
      where: {
        isActive: true,
        ...(q !== undefined && q !== ''
          ? { name: { contains: q, mode: 'insensitive' as const } }
          : {}),
      },
      select: {
        id: true, name: true, slug: true, logoUrl: true, website: true,
        defaultCategoryId: true, defaultBillingCycle: true, defaultCurrency: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Sistem kategorileri (`userId = null`) herkeste görünüyor; kullanıcının
   * kendi kategorileri yalnızca kendisinde. Bu OR koşulu, kapsamı sorguya
   * gömüyor — başkasının kategorisi hiçbir durumda dönmüyor.
   */
  async listCategories(userId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, slug: true, icon: true, color: true, isSystem: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createCategory(userId: string, input: { name: string; icon?: string; color?: string }) {
    const slug = slugify(input.name);

    // Kullanıcının aynı adlı ikinci kategorisi olamaz; veritabanı kısıtı da
    // var, burada anlaşılır bir mesaj için önden bakıyoruz.
    const mevcut = await this.prisma.category.findFirst({
      where: { userId, slug },
      select: { id: true },
    });
    if (mevcut !== null) {
      throw new ConflictException('Bu adda bir kategorin zaten var');
    }

    return this.prisma.category.create({
      data: { userId, name: input.name, slug, isSystem: false, ...input.icon !== undefined ? { icon: input.icon } : {}, ...input.color !== undefined ? { color: input.color } : {} },
      select: { id: true, name: true, slug: true, icon: true, color: true, isSystem: true },
    });
  }

  async updateCategory(userId: string, id: string, data: { name?: string; icon?: string; color?: string }) {
    await this.assertOwnCategory(userId, id);
    return this.prisma.category.update({
      where: { id },
      data: { ...data, ...(data.name !== undefined ? { slug: slugify(data.name) } : {}) },
      select: { id: true, name: true, slug: true, icon: true, color: true, isSystem: true },
    });
  }

  async deleteCategory(userId: string, id: string): Promise<void> {
    await this.assertOwnCategory(userId, id);

    // Kullanımdaki kategoriyi silmek aboneliği sahipsiz bırakırdı. Veritabanı
    // da zaten yabancı anahtarla engelliyor; burada anlaşılır mesaj veriyoruz.
    const kullanim = await this.prisma.subscription.count({ where: { categoryId: id } });
    if (kullanim > 0) {
      throw new ConflictException(
        `Bu kategori ${kullanim} abonelikte kullanılıyor; önce onları taşı`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }

  /** Sistem kategorisi değiştirilemez, başkasınınki görünmez. */
  private async assertOwnCategory(userId: string, id: string): Promise<void> {
    const kategori = await this.prisma.category.findUnique({
      where: { id },
      select: { userId: true, isSystem: true },
    });

    if (kategori === null || (kategori.userId !== null && kategori.userId !== userId)) {
      // Başkasının kategorisi de "yok" sayılıyor: varlık bilgisi sızmasın.
      throw new NotFoundException('Kategori bulunamadı');
    }
    if (kategori.isSystem) {
      throw new ForbiddenException('Sistem kategorileri değiştirilemez');
    }
  }
}

function slugify(value: string): string {
  const tr: Record<string, string> = { ç:'c', ğ:'g', ı:'i', ö:'o', ş:'s', ü:'u' };
  return value.toLowerCase()
    .replace(/[çğıöşü]/g, (c) => tr[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
