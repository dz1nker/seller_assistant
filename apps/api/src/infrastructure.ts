import { Global, Inject, Injectable, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@sales/database';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from './config';
@Injectable()
export class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(AppConfig) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.values.DATABASE_URL }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
@Injectable()
export class Cache implements OnModuleInit, OnModuleDestroy {
  readonly redis: Redis;
  constructor(@Inject(AppConfig) config: AppConfig) {
    this.redis = new Redis(config.values.REDIS_URL, {
      lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000,
      retryStrategy: times => Math.min(times * 200, 3000),
    });
    this.redis.on('error', () => {});
  }
  async onModuleInit() { await this.redis.connect(); await this.redis.ping(); }
  async onModuleDestroy() { this.redis.disconnect(); }
  async increment(key: string, ttl: number): Promise<number> {
    return Number(await this.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
      1, key, ttl,
    ));
  }
}
@Global()
@Module({ providers: [AppConfig, Database, Cache], exports: [AppConfig, Database, Cache] })
export class InfrastructureModule {}
