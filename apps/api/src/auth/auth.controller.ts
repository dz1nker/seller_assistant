import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { loginSchema, registerSchema } from '@sales/shared';
import { AppConfig } from '../config';
import { type AuthRequest, Public, readCookie } from '../security';
import { AuthService } from './auth.service';
import { ACCESS_SECONDS, REFRESH_SECONDS } from './tokens';
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private auth: AuthService, @Inject(AppConfig) private config: AppConfig) {}
  private options(maxAge: number): CookieOptions {
    return { httpOnly: true, secure: this.config.secureCookies, sameSite: 'strict', path: '/api', maxAge };
  }
  private setCookies(res: Response, tokens: { access: string; refresh: string }, refreshMaxAge = REFRESH_SECONDS * 1000) {
    res.cookie('sc_access', tokens.access, this.options(ACCESS_SECONDS * 1000));
    res.cookie('sc_refresh', tokens.refresh, this.options(refreshMaxAge));
  }
  @Public() @Post('register')
  async register(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const input = registerSchema.parse(body);
    await this.auth.limitIdentity(input.email, req.ip ?? 'unknown');
    const result = await this.auth.register(input);
    this.setCookies(res, result.tokens);
    return result.user;
  }
  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const input = loginSchema.parse(body);
    await this.auth.limitIdentity(input.email, req.ip ?? 'unknown');
    const result = await this.auth.login(input);
    this.setCookies(res, result.tokens);
    return result.user;
  }
  @Public() @Post('refresh') @HttpCode(204)
  async refresh(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.refresh(readCookie(req, 'sc_refresh'));
    this.setCookies(res, result.tokens, result.refreshMaxAge);
  }
  @Public() @Post('logout') @HttpCode(204)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readCookie(req, 'sc_access'), readCookie(req, 'sc_refresh'));
    res.clearCookie('sc_access', this.options(0));
    res.clearCookie('sc_refresh', this.options(0));
  }
  @Get('me') me(@Req() req: AuthRequest) { return req.currentUser; }
}
