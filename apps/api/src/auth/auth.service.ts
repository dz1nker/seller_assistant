import { ConflictException, HttpException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { CurrentUser, LoginInput, RegisterInput } from '@sales/shared';
import { Prisma, provisionOwner } from '@sales/database';
import { Cache, Database } from '../infrastructure';
import { ACCESS_SECONDS, newTokens, REFRESH_SECONDS, tokenHash } from './tokens';
@Injectable()
export class AuthService {
  constructor(@Inject(Database) private readonly db: Database, @Inject(Cache) private readonly cache: Cache) {}
  async limitIdentity(email: string, ip: string) {
    try {
      const n = await this.cache.increment(`auth:${tokenHash(`${ip}:${email}`)}`, 60);
      if (n > 5) throw new HttpException('Слишком много попыток. Повторите через минуту.', 429);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Сервис авторизации временно недоступен');
    }
  }
  async register(input: RegisterInput) {
    const passwordHash = await hash(input.password, 12);
    const tokens = newTokens();
    try {
      const user = await this.db.$transaction(async tx => {
        const owner = await provisionOwner(tx, { ...input, passwordHash });
        await tx.session.create({ data: {
          userId: owner.user.id, workspaceId: owner.workspaceId,
          accessHash: tokens.accessHash, refreshHash: tokens.refreshHash,
          accessExpiresAt: new Date(Date.now() + ACCESS_SECONDS * 1000),
          refreshExpiresAt: new Date(Date.now() + REFRESH_SECONDS * 1000),
        } });
        return { id: owner.user.id, email: owner.user.email, name: owner.user.name, workspaceId: owner.workspaceId, role: 'OWNER' as const };
      });
      return { user, tokens };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Не удалось создать аккаунт с этим email');
      }
      throw error;
    }
  }
  async login(input: LoginInput) {
    const user = await this.db.user.findUnique({ where: { email: input.email }, include: {
      memberships: { orderBy: { workspace: { createdAt: 'asc' } }, take: 1 },
    } });
    const dummyHash = '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const valid = await compare(input.password, user?.passwordHash ?? dummyHash);
    const member = user?.memberships[0];
    if (!user || !valid || !member) throw new UnauthorizedException('Неверный email или пароль');
    const tokens = newTokens();
    await this.db.$transaction(async tx => {
      await tx.session.create({ data: {
        userId: user.id, workspaceId: member.workspaceId,
        accessHash: tokens.accessHash, refreshHash: tokens.refreshHash,
        accessExpiresAt: new Date(Date.now() + ACCESS_SECONDS * 1000),
        refreshExpiresAt: new Date(Date.now() + REFRESH_SECONDS * 1000),
      } });
      await tx.auditLog.create({ data: { workspaceId: member.workspaceId, actorId: user.id, action: 'auth.login' } });
    });
    return { user: { id: user.id, email: user.email, name: user.name, workspaceId: member.workspaceId, role: member.role }, tokens };
  }
  async authenticate(access: string | undefined): Promise<CurrentUser> {
    if (!access || access.length > 100) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({ where: { accessHash: tokenHash(access) }, include: { user: true, member: true } });
    if (!session || session.accessExpiresAt <= new Date() || session.refreshExpiresAt <= new Date()) throw new UnauthorizedException();
    return { id: session.userId, name: session.user.name, email: session.user.email,
      workspaceId: session.workspaceId, role: session.member.role };
  }
  async refresh(refresh: string | undefined) {
    if (!refresh || refresh.length > 100) throw new UnauthorizedException();
    const tokens = newTokens();
    const changed = await this.db.session.updateMany({
      where: { refreshHash: tokenHash(refresh), refreshExpiresAt: { gt: new Date() } },
      data: { accessHash: tokens.accessHash, refreshHash: tokens.refreshHash,
        accessExpiresAt: new Date(Date.now() + ACCESS_SECONDS * 1000) },
    });
    if (changed.count !== 1) throw new UnauthorizedException();
    // Fixed absolute lifetime: refresh does not extend the original seven days.
    const session = await this.db.session.findUniqueOrThrow({ where: { refreshHash: tokens.refreshHash } });
    return { tokens, refreshMaxAge: Math.max(0, session.refreshExpiresAt.getTime() - Date.now()) };
  }
  async logout(access: string | undefined, refresh: string | undefined) {
    const session = await this.db.session.findFirst({ where: { OR: [
      ...(access ? [{ accessHash: tokenHash(access) }] : []),
      ...(refresh ? [{ refreshHash: tokenHash(refresh) }] : []),
    ] } });
    if (session) await this.db.$transaction(async tx => {
      await tx.session.deleteMany({ where: { id: session.id } });
      await tx.auditLog.create({ data: { workspaceId: session.workspaceId, actorId: session.userId, action: 'auth.logout' } });
    });
  }
}
