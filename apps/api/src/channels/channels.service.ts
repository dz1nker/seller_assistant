import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Cache, Database, Events } from "../infrastructure";
import { PrivacyEngine } from "../privacy/privacy.module";
import { TelegramAdapter } from "./gateway.client";
import { MessagesService } from "./messages.service";
import { createHash } from "node:crypto";
import { idSchema, type CurrentUser } from "@sales/shared";
@Injectable()
export class ChannelsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private admin(u: CurrentUser) {
    if (!["OWNER", "ADMIN"].includes(u.role))
      throw new ForbiddenException(
        "Подключением управляет владелец или администратор",
      );
  }
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Cache) private cache: Cache,
    @Inject(Events) private events: Events,
    @Inject(PrivacyEngine) private privacy: PrivacyEngine,
    @Inject(TelegramAdapter) private telegram: TelegramAdapter,
    @Inject(MessagesService) private messages: MessagesService,
  ) {}
  async connection(ws: string, id: string) {
    const c = await this.db.channelConnection.findFirst({
      where: { id: idSchema.parse(id), workspaceId: ws },
    });
    if (!c) throw new NotFoundException("Подключение не найдено");
    return c;
  }
  async list(ws: string) {
    const rows = await this.db.channelConnection.findMany({
      where: { workspaceId: ws },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(
      rows.map(async (c) => {
        if (c.status === "DISCONNECTED")
          return { ...c, capabilities: this.telegram.getCapabilities() };
        try {
          const auth = await this.telegram.status(ws, c.id);
          if (auth.state !== c.status)
            await this.db.channelConnection.update({
              where: { id: c.id },
              data: {
                status: auth.state,
                accountId: auth.accountId ?? c.accountId,
              },
            });
          return {
            ...c,
            status: auth.state,
            auth,
            capabilities: this.telegram.getCapabilities(),
          };
        } catch {
          return {
            ...c,
            auth: { state: "UNAVAILABLE", error: "Нет связи с Gateway" },
            capabilities: this.telegram.getCapabilities(),
          };
        }
      }),
    );
  }
  async setup() {
    try {
      return await this.telegram.request("/configuration");
    } catch {
      return {
        configured: false,
        reason: "Telegram Gateway не настроен или недоступен",
      };
    }
  }
  async start(u: CurrentUser) {
    this.admin(u);
    if (
      (await this.db.channelConnection.count({
        where: { workspaceId: u.workspaceId, status: { not: "DISCONNECTED" } },
      })) >= 5
    )
      throw new ConflictException("Можно подключить до пяти аккаунтов");
    const c = await this.db.channelConnection.create({
      data: {
        workspaceId: u.workspaceId,
        channel: "TELEGRAM",
        status: "STARTING",
      },
    });
    try {
      await this.telegram.connect(u.workspaceId, c.id);
      return { ...c, auth: await this.telegram.status(u.workspaceId, c.id) };
    } catch (e) {
      await this.db.channelConnection.update({
        where: { id: c.id },
        data: { status: "DISCONNECTED" },
      });
      throw e;
    }
  }
  async auth(u: CurrentUser, id: string, kind: string, value: string) {
    this.admin(u);
    await this.connection(u.workspaceId, id);
    if (
      (await this.cache.increment(`telegram-auth:${u.workspaceId}:${id}`, 60)) >
      6
    )
      throw new HttpException("Слишком много попыток. Подождите минуту.", 429);
    const auth = await this.telegram.auth(u.workspaceId, id, kind, value);
    await this.db.channelConnection.update({
      where: { id },
      data: { status: auth.state, accountId: auth.accountId },
    });
    this.events.changed(u.workspaceId, "connection.status_changed", id);
    return auth;
  }
  async sync(u: CurrentUser, id: string) {
    this.admin(u);
    const ws = u.workspaceId;
    const c = await this.connection(ws, id);
    const auth = await this.telegram.status(ws, id);
    if (auth.state !== "READY")
      throw new ConflictException("Завершите авторизацию Telegram");
    await this.db.channelConnection.update({
      where: { id },
      data: { status: "READY", accountId: auth.accountId },
    });
    const chats = await this.telegram.getConversations(ws, id);
    for (const chat of chats) {
      if (chat.type === "secret") continue;
      await this.db.conversation.upsert({
        where: {
          workspaceId_connectionId_externalChatId: {
            workspaceId: ws,
            connectionId: id,
            externalChatId: chat.id,
          },
        },
        create: {
          workspaceId: ws,
          connectionId: id,
          externalChatId: chat.id,
          source: "TELEGRAM",
          title: chat.title,
          username: chat.username,
          chatType: chat.type,
          mode: "CANDIDATE",
          unreadCount: chat.unreadCount,
          lastActivityAt: new Date(chat.lastActivityAt * 1000),
        },
        update: {
          title: chat.title,
          username: chat.username,
          unreadCount: chat.unreadCount,
        },
      });
    }
    await this.allowed(ws, c.id);
    this.events.changed(ws, "conversation.updated");
    return { synced: chats.length };
  }
  async allowed(ws: string, id: string) {
    const chats = await this.db.conversation.findMany({
      where: { workspaceId: ws, connectionId: id, mode: "CLIENT" },
      select: { externalChatId: true },
    });
    await this.telegram.allow(
      ws,
      id,
      chats.flatMap((c) => (c.externalChatId ? [c.externalChatId] : [])),
    );
  }
  async history(ws: string, conversationId: string, cursor?: string) {
    const c = await this.privacy.client(ws, idSchema.parse(conversationId));
    if (c.source !== "TELEGRAM" || !c.connectionId || !c.externalChatId)
      return { synced: 0 };
    await this.allowed(ws, c.connectionId);
    const messages = await this.telegram.getMessages(
      ws,
      c.connectionId,
      c.externalChatId,
      cursor,
    );
    for (const m of messages)
      await this.messages.ingest({
        eventId: `history:${c.externalChatId}:${m.id}:${createHash("sha256").update(m.text).digest("hex")}`,
        workspaceId: ws,
        connectionId: c.connectionId,
        kind: "message",
        historical: true,
        chatId: c.externalChatId,
        messageId: m.id,
        text: m.text,
        messageKind: m.kind,
        direction: m.direction,
        timestamp: m.timestamp,
        replyTo: m.replyTo,
      });
    return { synced: messages.length, cursor: messages.at(-1)?.id ?? null };
  }
  async disconnect(u: CurrentUser, id: string) {
    this.admin(u);
    await this.connection(u.workspaceId, id);
    await this.telegram.disconnect(u.workspaceId, id);
    await this.db.$transaction(async (tx) => {
      const cs = await tx.conversation.findMany({
        where: { workspaceId: u.workspaceId, connectionId: id },
      });
      for (const c of cs) {
        await this.privacy.purge(tx, u.workspaceId, c.id);
        await tx.conversation.update({
          where: { id: c.id },
          data: {
            mode: "EXCLUDED",
            contactId: null,
            version: { increment: 1 },
            unreadCount: 0,
            waitingForReply: false,
          },
        });
      }
      await tx.channelConnection.update({
        where: { id },
        data: { status: "DISCONNECTED", accountId: null },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: u.workspaceId,
          actorId: u.id,
          action: "connection.disconnected",
        },
      });
    });
    this.events.changed(u.workspaceId, "connection.status_changed", id);
    return { disconnected: true };
  }
  private busy = false;
  private activePoll?: Promise<void>;
  private changed = (e: { workspaceId: string; kind: string }) => {
    if (e.kind === "conversation.updated")
      void this.updateAllowed(e.workspaceId);
  };
  private async updateAllowed(ws: string) {
    const rows = await this.db.channelConnection.findMany({
      where: { workspaceId: ws, status: "READY" },
    });
    for (const c of rows) await this.allowed(ws, c.id).catch(() => {});
  }
  onModuleInit() {
    this.events.on("change", this.changed);
    this.timer = setInterval(() => {
      if (this.busy || !this.telegram.configured) return;
      this.busy = true;
      this.activePoll = this.db.channelConnection
        .findMany({ where: { status: { not: "DISCONNECTED" } }, take: 100 })
        .then(async (rows) => {
          for (const c of rows) {
            try {
              await this.telegram.connect(c.workspaceId, c.id);
              const s = await this.telegram.status(c.workspaceId, c.id);
              await this.db.channelConnection.updateMany({
                where: { id: c.id, status: { not: "DISCONNECTED" } },
                data: { status: s.state, accountId: s.accountId },
              });
              if (s.state === "READY") await this.allowed(c.workspaceId, c.id);
            } catch {}
          }
        })
        .finally(() => {
          this.busy = false;
        });
    }, 10000);
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.events.off("change", this.changed);
    await this.activePoll;
  }
}
