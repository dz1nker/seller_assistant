import { Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from "@nestjs/websockets";
import type { Server } from "socket.io";
import { parse } from "cookie";
import { AppConfig } from "../config";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { tokenHash } from "../auth/tokens";
import { Database, Events, Cache } from "../infrastructure";
@WebSocketGateway({ path: "/socket.io", cors: { origin: false } })
export class RealtimeGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private timers = new Set<NodeJS.Timeout>();
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(Database) private db: Database,
    @Inject(Events) private events: Events,
    @Inject(Cache) private cache: Cache,
    @Inject(AppConfig) private config: AppConfig,
  ) {}
  private changed = (event: {
    workspaceId: string;
    kind: string;
    id?: string;
  }) =>
    this.server
      .to(`workspace:${event.workspaceId}`)
      .emit(event.kind, { id: event.id });
  private revoked = (id: string) =>
    this.server.in(`session:${id}`).disconnectSockets(true);
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        if (
          (socket.handshake.headers.origin ??
            (socket.handshake.headers.referer
              ? new URL(socket.handshake.headers.referer).origin
              : undefined)) !== this.config.values.WEB_ORIGIN
        )
          throw new Error();
        if (
          (await this.cache.increment(
            `socket:${tokenHash(new URL(this.config.values.DATABASE_URL).pathname)}:${tokenHash(socket.handshake.address)}`,
            60,
          )) > 30
        )
          throw new Error();
        const access = parse(socket.handshake.headers.cookie ?? "").sc_access;
        const user = await this.auth.authenticate(access);
        const session = await this.db.session.findUniqueOrThrow({
          where: { accessHash: tokenHash(access!) },
        });
        await socket.join(`workspace:${user.workspaceId}`);
        await socket.join(`session:${session.id}`);
        const timer = setTimeout(
          () => socket.disconnect(true),
          Math.max(
            0,
            Math.min(
              session.accessExpiresAt.getTime(),
              session.refreshExpiresAt.getTime(),
            ) - Date.now(),
          ),
        );
        this.timers.add(timer);
        socket.on("disconnect", () => {
          clearTimeout(timer);
          this.timers.delete(timer);
        });
        next();
      } catch {
        next(new Error("Необходим повторный вход"));
      }
    });
    this.events.on("change", this.changed);
    this.events.on("session.revoked", this.revoked);
  }
  onModuleDestroy() {
    this.events.off("change", this.changed);
    this.events.off("session.revoked", this.revoked);
    for (const t of this.timers) clearTimeout(t);
  }
}
@Module({ imports: [AuthModule], providers: [RealtimeGateway] })
export class RealtimeModule {}
