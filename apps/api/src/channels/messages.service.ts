import {
  ConflictException,
  Inject,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { sendSchema, type ChannelEvent, type CurrentUser } from "@sales/shared";
import { Database, Events } from "../infrastructure";
import { PrivacyEngine } from "../privacy/privacy.module";
import { AiService } from "../ai/ai.service";
import { TelegramAdapter } from "./gateway.client";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
@Injectable()
export class MessagesService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Events) private events: Events,
    @Inject(PrivacyEngine) private privacy: PrivacyEngine,
    @Inject(AiService) private ai: AiService,
    @Inject(TelegramAdapter) private telegram: TelegramAdapter,
  ) {}
  async send(u: CurrentUser, conversationId: string, body: unknown) {
    const d = sendSchema.parse(body),
      ws = u.workspaceId;
    const digest = hash({
      conversationId,
      text: d.text,
      replyTo: d.replyToExternalId ?? null,
      suggestionId: d.suggestionId ?? null,
    });
    const existing = await this.db.messageCommand.findUnique({
      where: { workspaceId_key: { workspaceId: ws, key: d.key } },
    });
    if (existing) {
      if (existing.bodyHash !== digest)
        throw new ConflictException(
          "Этот ключ уже использован для другого сообщения",
        );
      return this.result(ws, existing.id);
    }
    if (d.suggestionId)
      await this.ai.suggestion(ws, d.suggestionId, conversationId);
    // Serialize command creation with policy changes and incoming updates.
    try {
      const command = await this.db.$transaction(async (tx) => {
        const c = await this.privacy.client(ws, conversationId, tx, true);
        if (c.source === "TELEGRAM") {
          const conn = await tx.channelConnection.findFirst({
            where: { id: c.connectionId!, workspaceId: ws, status: "READY" },
          });
          if (!conn)
            throw new ConflictException("Подключите Telegram перед отправкой");
        }
        const commandId = randomUUID(),
          messageId = randomUUID();
        const command = await tx.messageCommand.create({
          data: {
            id: commandId,
            workspaceId: ws,
            conversationId,
            messageId,
            key: d.key,
            bodyHash: digest,
          },
        });
        await tx.message.create({
          data: {
            id: messageId,
            commandId,
            workspaceId: ws,
            conversationId,
            direction: "OUT",
            text: d.text,
            status: "PENDING",
            suggestionId: d.suggestionId,
            replyToExternalId: d.replyToExternalId,
          },
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            version: { increment: 1 },
            lastActivityAt: new Date(),
            waitingForReply: false,
          },
        });
        await tx.auditLog.create({
          data: {
            workspaceId: ws,
            actorId: u.id,
            action: "message.command_created",
          },
        });
        return command;
      });
      this.events.changed(ws, "message.created", conversationId);
      return this.result(ws, command.id);
    } catch (e) {
      const prior = await this.db.messageCommand.findUnique({
        where: { workspaceId_key: { workspaceId: ws, key: d.key } },
      });
      if (prior) {
        if (prior.bodyHash !== digest)
          throw new ConflictException("Ключ уже занят");
        return this.result(ws, prior.id);
      }
      throw e;
    }
  }
  async result(ws: string, id: string) {
    const c = await this.db.messageCommand.findFirst({
      where: { id, workspaceId: ws },
    });
    if (!c) throw new NotFoundException();
    const message = await this.db.message.findFirst({
      where: { id: c.messageId, workspaceId: ws },
    });
    return { commandId: c.id, status: c.status, message };
  }
  async retry(u: CurrentUser, id: string) {
    const c = await this.db.messageCommand.findFirst({
      where: { id, workspaceId: u.workspaceId },
    });
    if (!c) throw new NotFoundException();
    await this.privacy.client(u.workspaceId, c.conversationId);
    if (c.status === "UNCERTAIN")
      throw new ConflictException(
        "Результат неизвестен. Сначала проверьте сообщение в Telegram; слепая повторная отправка запрещена.",
      );
    if (c.status !== "FAILED") return this.result(u.workspaceId, id);
    await this.db.$transaction(async (tx) => {
      const changed = await tx.messageCommand.updateMany({
        where: { id, workspaceId: u.workspaceId, status: "FAILED" },
        data: { status: "PENDING", error: null, attempts: { increment: 1 } },
      });
      if (changed.count)
        await tx.message.updateMany({
          where: { id: c.messageId, workspaceId: u.workspaceId },
          data: { status: "PENDING", error: null },
        });
    });
    this.events.changed(
      u.workspaceId,
      "message.send_status_changed",
      c.conversationId,
    );
    return this.result(u.workspaceId, id);
  }
  async deliver(id: string) {
    const command = await this.db.messageCommand.findUnique({ where: { id } });
    if (!command || !["PENDING", "SENDING"].includes(command.status)) return;
    const message = await this.db.message.findFirst({
      where: { id: command.messageId, workspaceId: command.workspaceId },
    });
    const conversation = await this.db.conversation.findFirst({
      where: {
        id: command.conversationId,
        workspaceId: command.workspaceId,
        mode: "CLIENT",
      },
    });
    if (!message || !conversation) {
      await this.db.messageCommand.update({
        where: { id },
        data: {
          status: "FAILED",
          error: "История очищена или разрешение отозвано",
        },
      });
      return;
    }
    const changed = await this.db.messageCommand.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENDING", startedAt: new Date() },
    });
    if (!changed.count && command.status !== "SENDING") return;
    await this.db.message.updateMany({
      where: { id: message.id, workspaceId: command.workspaceId },
      data: { status: "SENDING", error: null },
    });
    this.events.changed(
      command.workspaceId,
      "message.send_status_changed",
      conversation.id,
    );
    try {
      const result =
        conversation.source === "DEMO"
          ? { status: "SENT" as const, messageId: `demo-${message.id}` }
          : await this.telegram.sendMessage({
              workspaceId: command.workspaceId,
              connectionId: conversation.connectionId!,
              chatId: conversation.externalChatId!,
              commandId: id,
              attempt: command.attempts,
              resume: command.status === "SENDING",
              text: message.text,
              replyTo: message.replyToExternalId ?? undefined,
            });
      await this.confirm(
        command.workspaceId,
        id,
        result.status,
        result.messageId,
        result.error,
        command.attempts,
      );
    } catch (error) {
      const rejected =
        error instanceof HttpException &&
        error.getStatus() >= 400 &&
        error.getStatus() < 500;
      await this.confirm(
        command.workspaceId,
        id,
        rejected ? "FAILED" : "UNCERTAIN",
        undefined,
        rejected
          ? "Gateway отклонил команду до отправки. Проверьте подключение и разрешение диалога."
          : "Нет подтверждения Telegram. Проверьте исходящее сообщение перед повтором.",
        command.attempts,
      );
    }
  }
  async confirm(
    ws: string,
    id: string,
    status: "SENDING" | "SENT" | "FAILED" | "UNCERTAIN",
    externalId?: string,
    error?: string,
    attempt?: number,
  ) {
    const c = await this.db.messageCommand.findFirst({
      where: { id, workspaceId: ws },
    });
    if (!c) return;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM message_commands WHERE id=${id}::uuid AND "workspaceId"=${ws}::uuid FOR UPDATE`;
      const current = await tx.messageCommand.findUniqueOrThrow({
        where: { id },
      });
      if (
        current.status === "SENT" ||
        (attempt !== undefined && current.attempts !== attempt)
      )
        return;
      if (
        (current.status === "FAILED" &&
          ["SENDING", "UNCERTAIN"].includes(status)) ||
        (current.status === "UNCERTAIN" && status === "SENDING")
      )
        return;
      // A worker response cannot regress a separately confirmed TDLib event.
      await tx.messageCommand.update({
        where: { id },
        data: { status, externalMessageId: externalId, error: error ?? null },
      });
      const conv = await tx.conversation.findFirst({
        where: { id: c.conversationId, workspaceId: ws, mode: "CLIENT" },
      });
      if (!conv) return;
      if (externalId && conv.connectionId) {
        const duplicate = await tx.message.findFirst({
          where: {
            workspaceId: ws,
            connectionId: conv.connectionId,
            externalChatId: conv.externalChatId,
            externalMessageId: externalId,
            id: { not: c.messageId },
          },
        });
        if (duplicate) await tx.message.delete({ where: { id: duplicate.id } });
      }
      await tx.message.updateMany({
        where: { id: c.messageId, workspaceId: ws },
        data: {
          status,
          error: error ?? null,
          ...(externalId
            ? {
                externalMessageId: externalId,
                connectionId: conv.connectionId,
                externalChatId: conv.externalChatId,
              }
            : {}),
          ...(status === "SENT" ? { sentAt: new Date() } : {}),
        },
      });
      if (status === "SENT") {
        const m = await tx.message.findFirst({
          where: { id: c.messageId, workspaceId: ws },
        });
        if (m?.suggestionId) {
          const s = await tx.aiSuggestion.findFirst({
            where: { id: m.suggestionId, workspaceId: ws },
          });
          if (s)
            await tx.aiSuggestion.update({
              where: { id: s.id },
              data: { feedback: "SENT", edited: m.text !== s.text },
            });
        }
        await tx.conversation.update({
          where: { id: conv.id },
          data: {
            version: { increment: 1 },
            lastActivityAt: new Date(),
            waitingForReply: false,
          },
        });
      }
    });
    this.events.changed(ws, "message.send_status_changed", c.conversationId);
  }
  async ingest(event: ChannelEvent) {
    const ws = event.workspaceId;
    const conn = await this.db.channelConnection.findFirst({
      where: { id: event.connectionId, workspaceId: ws },
    });
    if (!conn || conn.status === "DISCONNECTED") return { ignored: true };
    if (event.kind === "status") {
      await this.db.channelConnection.update({
        where: { id: conn.id },
        data: { status: event.state ?? "ERROR" },
      });
      this.events.changed(ws, "connection.status_changed", conn.id);
      return { received: true };
    }
    if (event.kind === "send" && event.commandId) {
      const cmd = await this.db.messageCommand.findFirst({
        where: { id: event.commandId, workspaceId: ws },
      });
      if (!cmd) return { ignored: true };
      const conv = await this.db.conversation.findFirst({
        where: {
          id: cmd.conversationId,
          workspaceId: ws,
          connectionId: conn.id,
        },
      });
      if (!conv) return { ignored: true };
      if (
        !["SENDING", "SENT", "FAILED", "UNCERTAIN"].includes(event.state ?? "")
      )
        return { ignored: true };
      await this.confirm(
        ws,
        cmd.id,
        event.state as "SENDING" | "SENT" | "FAILED" | "UNCERTAIN",
        event.messageId,
        undefined,
        event.attempt,
      );
      return { received: true };
    }
    const conv = await this.db.conversation.findFirst({
      where: {
        workspaceId: ws,
        connectionId: conn.id,
        externalChatId: event.chatId,
      },
    });
    if (!conv) return { ignored: true };
    await this.db.$transaction(async (tx) => {
      const c = await this.privacy.conversation(ws, conv.id, tx, true);
      const inserted = await tx.integrationEvent.createMany({
        data: [
          {
            workspaceId: ws,
            connectionId: conn.id,
            externalId: event.eventId,
            kind: event.kind,
          },
        ],
        skipDuplicates: true,
      });
      if (!inserted.count || c.mode !== "CLIENT") return;
      if (event.kind === "delete") {
        await tx.message.deleteMany({
          where: {
            workspaceId: ws,
            conversationId: c.id,
            externalMessageId: event.messageId,
          },
        });
        await tx.aiAnalysis.deleteMany({
          where: { workspaceId: ws, conversationId: c.id },
        });
      } else if (event.kind === "edit") {
        await tx.message.updateMany({
          where: {
            workspaceId: ws,
            conversationId: c.id,
            externalMessageId: event.messageId,
          },
          data: { text: event.text ?? "", editedAt: new Date() },
        });
        await tx.aiAnalysis.deleteMany({
          where: { workspaceId: ws, conversationId: c.id },
        });
      } else if (event.kind === "message" && event.messageId) {
        const previous = await tx.message.findFirst({
          where: {
            workspaceId: ws,
            connectionId: conn.id,
            externalChatId: event.chatId,
            externalMessageId: event.messageId,
          },
        });
        if (
          previous &&
          previous.text === (event.text ?? "") &&
          previous.kind === (event.messageKind ?? "unsupported")
        )
          return;
        await tx.message.upsert({
          where: {
            workspaceId_connectionId_externalChatId_externalMessageId: {
              workspaceId: ws,
              connectionId: conn.id,
              externalChatId: event.chatId!,
              externalMessageId: event.messageId,
            },
          },
          create: {
            workspaceId: ws,
            conversationId: c.id,
            connectionId: conn.id,
            externalChatId: event.chatId,
            externalMessageId: event.messageId,
            direction: event.direction ?? "IN",
            text: event.text ?? "",
            kind: event.messageKind ?? "unsupported",
            status: "SENT",
            sentAt: event.timestamp
              ? new Date(event.timestamp * 1000)
              : new Date(),
            replyToExternalId: event.replyTo,
          },
          update: {
            text: event.text ?? "",
            kind: event.messageKind ?? "unsupported",
          },
        });
      }
      await tx.conversation.update({
        where: { id: c.id },
        data: {
          version: { increment: 1 },
          ...(event.historical ? {} : { lastActivityAt: new Date() }),
          ...(!event.historical &&
          event.kind === "message" &&
          event.direction === "IN"
            ? { waitingForReply: true, unreadCount: { increment: 1 } }
            : !event.historical &&
                event.kind === "message" &&
                event.direction === "OUT"
              ? { waitingForReply: false }
              : {}),
        },
      });
    });
    this.events.changed(
      ws,
      event.kind === "message" ? "message.created" : "message.updated",
      conv.id,
    );
    return { received: true };
  }
}
