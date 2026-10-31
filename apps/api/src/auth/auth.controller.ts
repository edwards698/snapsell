import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type LoginInput,
  loginSchema,
  type MeResponse,
  type ResetPasswordInput,
  resetPasswordSchema,
} from '@snapsell/shared';
import type { Request, Response } from 'express';
import { Public } from '../common/public.decorator.js';
import { clientIp, userAgent } from '../common/request.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { Auth } from './auth.decorator.js';
import { AuthService } from './auth.service.js';
import { type AuthContext, CSRF_COOKIE, SESSION_COOKIE } from './auth.types.js';

@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const result = await this.auth.login(body.email, body.password, {
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    const maxAge = Math.floor((result.expiresAt.getTime() - Date.now()) / 1000);
    const adapter = this.adapterHost.httpAdapter;
    const base = { path: '/', sameSite: 'lax' as const, secure: this.config.cookieSecure, maxAge };
    adapter.setCookie!(res, SESSION_COOKIE, result.token, { ...base, httpOnly: true });
    // Readable by the admin UI so it can echo the token in the x-csrf-token header.
    adapter.setCookie!(res, CSRF_COOKIE, result.csrfToken, { ...base, httpOnly: false });
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @Post('logout')
  @HttpCode(204)
  logout(
    @Auth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.logout(auth.sessionId, auth.user.id, clientIp(req));
    this.clearCookies(res);
  }

  @Get('me')
  me(@Auth() auth: AuthContext): MeResponse {
    return { user: auth.user, csrfToken: auth.csrfToken };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(
    @Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    this.auth.forgotPassword(body.email, { ip: clientIp(req), userAgent: userAgent(req) });
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.resetPassword(body.token, body.password, {
      ip: clientIp(req),
      userAgent: userAgent(req),
    });
    this.clearCookies(res);
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Auth() auth: AuthContext,
    @Req() req: Request,
  ) {
    await this.auth.changePassword(
      auth.user.id,
      auth.sessionId,
      body.currentPassword,
      body.newPassword,
      clientIp(req),
    );
    return { ok: true };
  }

  private clearCookies(res: Response) {
    const adapter = this.adapterHost.httpAdapter;
    adapter.clearCookie!(res, SESSION_COOKIE, { path: '/' });
    adapter.clearCookie!(res, CSRF_COOKIE, { path: '/' });
  }
}
