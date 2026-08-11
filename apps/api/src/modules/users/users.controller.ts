import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import type { SessionUser } from '../auth/session.service.js';
import { SessionService } from '../auth/session.service.js';
import { changePasswordSchema, updateProfileSchema } from '../auth/auth.dto.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  async profile(@CurrentUser() user: SessionUser) {
    return this.users.profile(user.id);
  }

  @Patch()
  @UsePipes(new ZodValidationPipe(updateProfileSchema))
  async update(
    @CurrentUser() user: SessionUser,
    @Body() body: { name?: string; currency?: string; timezone?: string; locale?: string },
  ) {
    return this.users.update(user.id, body);
  }

  @Patch('password')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(changePasswordSchema))
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Req() request: AuthenticatedRequest,
    @Body() body: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    await this.users.changePassword(user.id, body.currentPassword, body.newPassword);
    // Mevcut oturum ayakta kalıyor, diğerleri düşüyor: şifre değiştirmenin
    // amacı zaten başkasının açık oturumunu kapatmak.
    await this.sessions.revokeAll(user.id, request.sessionToken);
  }

  @Delete()
  @HttpCode(202)
  async deleteAccount(@CurrentUser() user: SessionUser): Promise<{ purgeAt: string }> {
    const purgeAt = await this.users.softDelete(user.id);
    await this.sessions.revokeAll(user.id);
    return { purgeAt: purgeAt.toISOString() };
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: SessionUser) {
    return this.sessions.list(user.id);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revokeSession(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<void> {
    // `revokeById` içinde userId koşulu var: başkasının oturumunu kapatmak
    // mümkün değil. Bulunamazsa da 204 dönüyoruz — varlık bilgisi sızmasın.
    await this.sessions.revokeById(user.id, id);
  }
}
