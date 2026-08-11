import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/session.service.js';
import { CatalogService } from './catalog.service.js';

const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı').optional(),
});

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Sağlayıcı kataloğu: sistem yönetimli, salt okunur. */
  @Get('providers')
  async providers(@Query('q') q?: string) {
    return this.catalog.listProviders(q);
  }

  /** Sistem kategorileri + kullanıcının kendi kategorileri. */
  @Get('categories')
  async categories(@CurrentUser() user: SessionUser) {
    return this.catalog.listCategories(user.id);
  }

  @Post('categories')
  @HttpCode(201)
  async createCategory(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(categorySchema))
    body: { name: string; icon?: string; color?: string },
  ) {
    return this.catalog.createCategory(user.id, body);
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(categorySchema.partial())) body: { name?: string },
  ) {
    return this.catalog.updateCategory(user.id, id, body);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async deleteCategory(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.catalog.deleteCategory(user.id, id);
  }
}
