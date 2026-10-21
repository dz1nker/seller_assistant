import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { CurrentUser } from '@sales/shared';
import { AppConfig } from './config';
import { Cache } from './infrastructure';
import { AuthService } from './auth/auth.service';
import { tokenHash } from './auth/tokens';
export interface AuthRequest extends Request { currentUser: CurrentUser }
export const Public = () => SetMetadata('public', true);
export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(@Inject(AppConfig) private config: AppConfig, @Inject(Cache) private cache: Cache) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== this.config.values.WEB_ORIGIN) {
      throw new ForbiddenException('Недопустимый источник запроса');
    }
    if (req.path.startsWith('/health/')) return true;
    try {
      const n = await this.cache.increment(`requests:${tokenHash(req.ip ?? 'unknown')}`, 60);
      if (n > 180) throw new HttpException('Слишком много запросов. Повторите через минуту.', 429);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Сервис временно недоступен');
    }
    return true;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector, @Inject(AuthService) private auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    req.currentUser = await this.auth.authenticate(readCookie(req, 'sc_access'));
    return true;
  }
}
