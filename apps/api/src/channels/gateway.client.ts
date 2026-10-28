import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { z } from "zod";
import { AppConfig } from "../config";
import type {
  ChannelAdapter,
  SendMessageInput,
  SendMessageResult,
} from "@sales/shared";
export const gatewayStatusSchema = z.object({
  state: z.string(),
  link: z.string().optional(),
  error: z.string().optional(),
  accountId: z.string().optional(),
});
export const gatewayChatSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  username: z.string().nullable().optional(),
  type: z.string(),
  unreadCount: z.number().int().nonnegative(),
  lastActivityAt: z.number(),
});
export const gatewayMessageSchema = z.object({
  id: z.string(),
  text: z.string().max(4096),
  kind: z.string(),
  direction: z.enum(["IN", "OUT"]),
  timestamp: z.number(),
  replyTo: z.string().optional(),
});
@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  constructor(@Inject(AppConfig) private config: AppConfig) {}
  getCapabilities() {
    return { text: true, replies: true, attachments: false };
  }
  get configured() {
    return Boolean(this.config.values.GATEWAY_TOKEN);
  }
  async request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
  ): Promise<unknown> {
    if (!this.config.values.GATEWAY_TOKEN)
      throw new ServiceUnavailableException("Telegram Gateway не настроен");
    try {
      const r = await fetch(
        this.config.values.GATEWAY_URL.replace(/\/$/, "") + path,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.config.values.GATEWAY_TOKEN}`,
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!r.ok) {
        const e = z
          .object({ message: z.string().max(300) })
          .safeParse(await r.json());
        throw new HttpException(
          e.success ? e.data.message : "Telegram Gateway временно недоступен",
          r.status >= 400 && r.status < 500 ? r.status : 503,
        );
      }
      return await r.json();
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new ServiceUnavailableException("Нет связи с Telegram Gateway");
    }
  }
  prefix(ws: string, id: string) {
    return `/sessions/${ws}/${id}`;
  }
  connect(ws: string, id: string) {
    return this.request(this.prefix(ws, id), {});
  }
  async disconnect(ws: string, id: string) {
    await this.request(this.prefix(ws, id), undefined, "DELETE");
  }
  status(ws: string, id: string) {
    return this.request(this.prefix(ws, id) + "/status").then((v) =>
      gatewayStatusSchema.parse(v),
    );
  }
  auth(ws: string, id: string, kind: string, value: string) {
    return this.request(this.prefix(ws, id) + "/auth", { kind, value }).then(
      (v) => gatewayStatusSchema.parse(v),
    );
  }
  getConversations(ws: string, id: string) {
    return this.request(this.prefix(ws, id) + "/chats").then((v) =>
      z.array(gatewayChatSchema).parse(v),
    );
  }
  getMessages(ws: string, id: string, chatId: string, cursor?: string) {
    return this.request(
      this.prefix(ws, id) +
        `/history?chatId=${encodeURIComponent(chatId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    ).then((v) => z.array(gatewayMessageSchema).parse(v));
  }
  allow(ws: string, id: string, chatIds: string[]) {
    return this.request(this.prefix(ws, id) + "/allowed", { chatIds });
  }
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    return z
      .object({
        status: z.enum(["SENDING", "SENT", "FAILED", "UNCERTAIN"]),
        messageId: z.string().optional(),
        error: z.string().optional(),
      })
      .parse(
        await this.request(
          this.prefix(input.workspaceId, input.connectionId) + "/send",
          input,
        ),
      );
  }
}
