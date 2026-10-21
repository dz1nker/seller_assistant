import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { Cache, Database } from '../infrastructure';
import { Public } from '../security';
@Public() @Controller('health')
class HealthController {
  constructor(@Inject(Database) private db: Database, @Inject(Cache) private cache: Cache) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.cache.redis.ping()]);
      return { status: 'ok', database: 'up', redis: 'up' };
    } catch { throw new ServiceUnavailableException('Dependency unavailable'); }
  }
}
@Module({ controllers: [HealthController] })
export class HealthModule {}
