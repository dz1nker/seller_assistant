import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@sales/database";
import Redis from "ioredis";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppConfig } from "./config";
import { EventEmitter } from "node:events";
@Injectable()
export class Events extends EventEmitter {
  changed(workspaceId: string, kind: string, id?: string) {
    this.emit("change", { workspaceId, kind, id });
  }
}
@Injectable()
export class Database
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(@Inject(AppConfig) config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.values.DATABASE_URL }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
@Injectable()
export class Cache implements OnModuleInit, OnApplicationShutdown {
  readonly redis: Redis;
  constructor(@Inject(AppConfig) config: AppConfig) {
    this.redis = new Redis(config.values.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });
    this.redis.on("error", () => {});
  }
  async onModuleInit() {
    await this.redis.connect();
    await this.redis.ping();
  }
  async onApplicationShutdown() {
    this.redis.disconnect();
  }
  async increment(key: string, ttl: number): Promise<number> {
    return Number(
      await this.redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
        1,
        key,
        ttl,
      ),
    );
  }
}
@Global()
@Module({
  providers: [AppConfig, Database, Cache, Events],
  exports: [AppConfig, Database, Cache, Events],
})
export class InfrastructureModule {}
