import { DatabaseSync } from "node:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdirSync, chmodSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  idSchema,
  type ChannelEvent,
  type SendMessageInput,
  type SendMessageResult,
} from "@sales/shared";
import {
  authState,
  createNative,
  normalizeMessage,
  object,
  safeError,
  text,
  type NativeClient,
  type NativeFactory,
} from "./native";
export interface GatewayOptions {
  root: string;
  masterKey: string;
  apiId?: number;
  apiHash?: string;
  callbackUrl: string;
  token: string;
}
type Receipt = {
  id: string;
  connectionId: string;
  bodyHash: string;
  status: SendMessageResult["status"] | "INTENT";
  attempt: number;
  temporaryId: string | null;
  externalId: string | null;
};
type Session = {
  ws: string;
  id: string;
  client: NativeClient;
  auth: string;
  online: boolean;
  link?: string;
  error?: string;
  accountId?: string;
  allowed: Set<string>;
  early: Map<string, unknown>;
};
export class GatewayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const numberId = (v: string) => {
  if (!/^-?\d+$/.test(v) || !Number.isSafeInteger(Number(v)))
    throw new GatewayError(400, "Некорректный идентификатор Telegram");
  return Number(v);
};
export class TelegramGateway {
  private inflight = new Map<string, Promise<SendMessageResult>>();
  private db: DatabaseSync;
  private sessions = new Map<string, Session>();
  private timer?: NodeJS.Timeout;
  private dispatching = false;
  private closing = false;
  private activeDispatch?: Promise<void>;
  constructor(
    private config: GatewayOptions,
    private factory: NativeFactory = createNative,
  ) {
    if (!/^[a-f0-9]{64}$/i.test(config.masterKey))
      throw new Error("SESSION_MASTER_KEY must contain 32 bytes in hex");
    mkdirSync(config.root, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(config.root, "journal.sqlite"));
    chmodSync(path.join(config.root, "journal.sqlite"), 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,ws TEXT NOT NULL,allowed TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,connectionId TEXT NOT NULL,bodyHash TEXT NOT NULL,status TEXT NOT NULL,attempt INTEGER NOT NULL,temporaryId TEXT,externalId TEXT); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,connectionId TEXT NOT NULL,chatId TEXT,payload TEXT NOT NULL);",
    );
    this.db
      .prepare(
        "UPDATE commands SET status='UNCERTAIN' WHERE status IN ('INTENT','SENDING')",
      )
      .run();
  }
  get configured() {
    return Boolean(this.config.apiId && this.config.apiHash);
  }
  private key(ws: string, id: string) {
    return Buffer.from(
      hkdfSync("sha256", Buffer.from(this.config.masterKey, "hex"), ws, id, 32),
    );
  }
  private encrypt(ws: string, id: string, value: unknown) {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key(ws, id), iv);
    const body = Buffer.concat([
      c.update(JSON.stringify(value), "utf8"),
      c.final(),
    ]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
  }
  private decrypt(ws: string, id: string, value: string) {
    const b = Buffer.from(value, "base64"),
      c = createDecipheriv("aes-256-gcm", this.key(ws, id), b.subarray(0, 12));
    c.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([c.update(b.subarray(28)), c.final()]).toString("utf8"),
    ) as unknown;
  }
  async start() {
    for (const row of this.db.prepare("SELECT id,ws FROM sessions").all()) {
      if (this.configured) await this.connect(String(row.ws), String(row.id));
    }
    this.timer = setInterval(() => {
      if (!this.activeDispatch)
        this.activeDispatch = this.dispatch()
          .catch(() => {})
          .finally(() => {
            this.activeDispatch = undefined;
          });
    }, 500);
  }
  async close() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    await this.activeDispatch;
    await Promise.allSettled([...this.inflight.values()]);
    await Promise.allSettled(
      [...this.sessions.values()].map((s) =>
        s.client.isClosed() ? Promise.resolve() : s.client.close(),
      ),
    );
    this.sessions.clear();
    this.db.close();
  }
  private session(ws: string, id: string) {
    idSchema.parse(ws);
    idSchema.parse(id);
    const s = this.sessions.get(id);
    if (!s || s.ws !== ws) throw new GatewayError(404, "Сессия не найдена");
    return s;
  }
  private emit(
    s: Session,
    data: Omit<ChannelEvent, "eventId" | "workspaceId" | "connectionId">,
  ) {
    const event: ChannelEvent = {
      ...data,
      eventId: randomUUID(),
      workspaceId: s.ws,
      connectionId: s.id,
    };
    this.db
      .prepare(
        "INSERT INTO events(id,connectionId,chatId,payload) VALUES (?,?,?,?)",
      )
      .run(
        event.eventId,
        s.id,
        event.chatId ?? null,
        this.encrypt(s.ws, s.id, event),
      );
  }
  async dispatch() {
    if (this.dispatching || this.closing) return;
    this.dispatching = true;
    try {
      const rows = this.db
        .prepare("SELECT * FROM events ORDER BY seq LIMIT 50")
        .all();
      for (const row of rows) {
        const sid = String(row.connectionId);
        const entry = this.db
          .prepare("SELECT ws FROM sessions WHERE id=?")
          .get(sid);
        if (!entry) {
          this.db
            .prepare("DELETE FROM events WHERE seq=?")
            .run(Number(row.seq));
          continue;
        }
        const body = this.decrypt(String(entry.ws), sid, String(row.payload));
        try {
          const response = await fetch(this.config.callbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.config.token}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) break;
          this.db
            .prepare("DELETE FROM events WHERE seq=?")
            .run(Number(row.seq));
        } catch {
          break;
        }
      }
    } finally {
      this.dispatching = false;
    }
  }
  async connect(ws: string, id: string) {
    idSchema.parse(ws);
    idSchema.parse(id);
    if (this.sessions.has(id)) return this.status(ws, id);
    if (!this.configured)
      throw new GatewayError(
        503,
        "Укажите TELEGRAM_API_ID и TELEGRAM_API_HASH в настройках сервера",
      );
    if (this.sessions.size >= 20)
      throw new GatewayError(409, "Достигнут лимит сессий Gateway");
    const root = path.join(this.config.root, ws, id);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    const prior = this.db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
    if (prior && prior.ws !== ws)
      throw new GatewayError(404, "Сессия не найдена");
    this.db
      .prepare("INSERT OR IGNORE INTO sessions(id,ws,allowed) VALUES (?,?,?)")
      .run(id, ws, "[]");
    const allowed = prior
      ? z.array(z.string()).parse(JSON.parse(String(prior.allowed)))
      : [];
    const client = this.factory({
      apiId: this.config.apiId!,
      apiHash: this.config.apiHash!,
      databaseDirectory: path.join(root, "database"),
      filesDirectory: path.join(root, "files"),
      databaseEncryptionKey: this.key(ws, id).toString("base64"),
    });
    const s: Session = {
      ws,
      id,
      client,
      auth: "STARTING",
      online: true,
      allowed: new Set(allowed),
      early: new Map(),
    };
    this.sessions.set(id, s);
    client.on("error", () => {
      s.error = "Сбой TDLib. Проверьте подключение";
    });
    client.on("update", (u) => {
      void this.update(s, u).catch(() => {
        s.error = "Ошибка обработки события Telegram";
      });
    });
    return this.status(ws, id);
  }
  status(ws: string, id: string) {
    const s = this.session(ws, id);
    return {
      state: s.auth === "READY" && !s.online ? "RECONNECTING" : s.auth,
      ...(s.link ? { link: s.link } : {}),
      ...(s.error ? { error: s.error } : {}),
      ...(s.accountId ? { accountId: s.accountId } : {}),
    };
  }
  async auth(ws: string, id: string, kind: string, value: string) {
    const s = this.session(ws, id);
    const expected: Record<string, string> = {
      phone: "WAIT_PHONE",
      code: "WAIT_CODE",
      password: "WAIT_PASSWORD",
      email: "WAIT_EMAIL",
      emailCode: "WAIT_EMAIL_CODE",
    };
    if (expected[kind] !== s.auth)
      throw new GatewayError(
        409,
        "Шаг авторизации изменился. Обновите состояние подключения",
      );
    let query: Record<string, unknown>;
    switch (kind) {
      case "phone":
        query = { _: "setAuthenticationPhoneNumber", phone_number: value };
        break;
      case "code":
        query = { _: "checkAuthenticationCode", code: value };
        break;
      case "password":
        query = { _: "checkAuthenticationPassword", password: value };
        break;
      case "email":
        query = { _: "setAuthenticationEmailAddress", email_address: value };
        break;
      case "emailCode":
        query = {
          _: "checkAuthenticationEmailCode",
          code: { _: "emailAddressAuthenticationCode", code: value },
        };
        break;
      default:
        throw new GatewayError(400, "Неподдерживаемый шаг");
    }
    try {
      s.error = undefined;
      await s.client.invoke(query);
      return this.status(ws, id);
    } catch (e) {
      s.error = safeError(e);
      throw new GatewayError(400, s.error);
    }
  }
  allow(ws: string, id: string, ids: string[]) {
    const s = this.session(ws, id);
    for (const old of s.allowed)
      if (!ids.includes(old))
        this.db
          .prepare("DELETE FROM events WHERE connectionId=? AND chatId=?")
          .run(id, old);
    s.allowed = new Set(ids);
    this.db
      .prepare("UPDATE sessions SET allowed=? WHERE id=? AND ws=?")
      .run(JSON.stringify(ids), id, ws);
    return { updated: true };
  }
  private async permittedChat(s: Session, id: string) {
    if (!s.allowed.has(id))
      throw new GatewayError(403, "Диалог не выбран для работы");
    const chat = object(
      await s.client.invoke({ _: "getChat", chat_id: numberId(id) }),
    );
    if (object(chat.type)._ === "chatTypeSecret" || chat.has_protected_content)
      throw new GatewayError(403, "Защищённый диалог не поддерживается");
    return chat;
  }
  async chats(ws: string, id: string) {
    const s = this.session(ws, id);
    if (this.status(ws, id).state !== "READY")
      throw new GatewayError(409, "Telegram ещё не подключён");
    try {
      await s.client.invoke({
        _: "loadChats",
        chat_list: { _: "chatListMain" },
        limit: 200,
      });
    } catch {}
    const result = object(
      await s.client.invoke({
        _: "getChats",
        chat_list: { _: "chatListMain" },
        limit: 200,
      }),
    );
    const ids = z.array(z.number()).parse(result.chat_ids);
    const chats = [];
    for (const chatId of ids) {
      const c = object(
        await s.client.invoke({ _: "getChat", chat_id: chatId }),
      );
      const type = text(object(c.type)._);
      if (type === "chatTypeSecret") continue;
      chats.push({
        id: String(chatId),
        title: text(c.title).slice(0, 200),
        type:
          type === "chatTypePrivate"
            ? "private"
            : type === "chatTypeSupergroup"
              ? "supergroup"
              : "group",
        unreadCount: Number(c.unread_count) || 0,
        lastActivityAt:
          Number(object(c.last_message).date) || Math.floor(Date.now() / 1000),
      });
    }
    return chats;
  }
  async history(ws: string, id: string, chatId: string, cursor?: string) {
    const s = this.session(ws, id);
    await this.permittedChat(s, chatId);
    const value = object(
      await s.client.invoke({
        _: "getChatHistory",
        chat_id: numberId(chatId),
        from_message_id: cursor ? numberId(cursor) : 0,
        offset: 0,
        limit: 50,
        only_local: false,
      }),
    );
    return z
      .array(z.unknown())
      .parse(value.messages)
      .map(normalizeMessage)
      .filter((m): m is NonNullable<typeof m> => m !== null && m.id !== cursor);
  }
  receipt(ws: string, id: string, commandId: string) {
    this.session(ws, id);
    const r = this.db
      .prepare("SELECT * FROM commands WHERE id=? AND connectionId=?")
      .get(commandId, id) as Receipt | undefined;
    return r
      ? {
          status: r.status === "INTENT" ? "UNCERTAIN" : r.status,
          ...(r.externalId ? { messageId: r.externalId } : {}),
        }
      : { status: "UNCERTAIN" };
  }
  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const pending = this.inflight.get(input.commandId);
    if (pending) {
      await pending.catch(() => {});
      return this.send(input);
    }
    const operation = this.sendOnce(input);
    this.inflight.set(input.commandId, operation);
    try {
      return await operation;
    } finally {
      this.inflight.delete(input.commandId);
    }
  }
  private async sendOnce(input: SendMessageInput): Promise<SendMessageResult> {
    const s = this.session(input.workspaceId, input.connectionId);
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          chatId: input.chatId,
          text: input.text,
          replyTo: input.replyTo ?? null,
        }),
      )
      .digest("hex");
    const old = this.db
      .prepare("SELECT * FROM commands WHERE id=?")
      .get(input.commandId) as Receipt | undefined;
    if (old) {
      if (old.connectionId !== s.id || old.bodyHash !== digest)
        throw new GatewayError(409, "Ключ команды уже занят");
      if (!(old.status === "FAILED" && input.attempt > old.attempt))
        return {
          status: old.status === "INTENT" ? "UNCERTAIN" : old.status,
          ...(old.externalId ? { messageId: old.externalId } : {}),
        };
    }
    if (!old && input.resume)
      return {
        status: "UNCERTAIN",
        error:
          "Gateway не располагает подтверждением команды. Автоматический повтор запрещён.",
      };
    await this.permittedChat(s, input.chatId);
    if (this.status(s.ws, s.id).state !== "READY")
      throw new GatewayError(409, "Нет подключения к Telegram");
    this.db
      .prepare(
        "INSERT INTO commands(id,connectionId,bodyHash,status,attempt) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,attempt=excluded.attempt,temporaryId=NULL,externalId=NULL",
      )
      .run(input.commandId, s.id, digest, "INTENT", input.attempt);
    try {
      const m = object(
        await s.client.invoke({
          _: "sendMessage",
          chat_id: numberId(input.chatId),
          ...(input.replyTo
            ? {
                reply_to: {
                  _: "inputMessageReplyToMessage",
                  message_id: numberId(input.replyTo),
                },
              }
            : {}),
          input_message_content: {
            _: "inputMessageText",
            text: { _: "formattedText", text: input.text, entities: [] },
            link_preview_options: {
              _: "linkPreviewOptions",
              is_disabled: true,
            },
            clear_draft: true,
          },
        }),
      );
      const failed = object(m.sending_state)._ === "messageSendingStateFailed";
      const pending = Boolean(m.sending_state) && !failed;
      this.db
        .prepare(
          "UPDATE commands SET status=?,temporaryId=?,externalId=? WHERE id=?",
        )
        .run(
          failed ? "FAILED" : pending ? "SENDING" : "SENT",
          String(m.id),
          pending || failed ? null : String(m.id),
          input.commandId,
        );
      if (s.early.has(String(m.id))) {
        const early = s.early.get(String(m.id));
        s.early.delete(String(m.id));
        await this.update(s, early);
      }
      if (!pending && !failed)
        this.emit(s, {
          kind: "send",
          commandId: input.commandId,
          attempt: input.attempt,
          state: "SENT",
          messageId: String(m.id),
        });
      const r = this.receipt(s.ws, s.id, input.commandId);
      return r as SendMessageResult;
    } catch (e) {
      const code = object(e).code;
      const state =
        typeof code === "number" && code >= 400 && code < 500
          ? "FAILED"
          : "UNCERTAIN";
      this.db
        .prepare("UPDATE commands SET status=? WHERE id=?")
        .run(state, input.commandId);
      this.emit(s, {
        kind: "send",
        commandId: input.commandId,
        attempt: input.attempt,
        state,
      });
      return {
        status: state,
        error:
          state === "FAILED"
            ? safeError(e)
            : "Результат отправки неизвестен; автоматический повтор запрещён",
      };
    }
  }
  async disconnect(ws: string, id: string) {
    const s = this.session(ws, id);
    if (!s.client.isClosed() && s.auth === "READY")
      await s.client.invoke({ _: "logOut" });
    if (!s.client.isClosed()) await s.client.close();
    this.sessions.delete(id);
    this.db.prepare("DELETE FROM events WHERE connectionId=?").run(id);
    this.db.prepare("DELETE FROM commands WHERE connectionId=?").run(id);
    this.db.prepare("DELETE FROM sessions WHERE id=?").run(id);
    rmSync(path.join(this.config.root, ws, id), {
      recursive: true,
      force: true,
    });
    return { disconnected: true };
  }
  private async update(s: Session, value: unknown) {
    const u = object(value),
      kind = text(u._);
    if (kind === "updateAuthorizationState") {
      const a = object(u.authorization_state);
      s.auth = authState(a);
      s.link = typeof a.link === "string" ? a.link : undefined;
      s.error = undefined;
      if (s.auth === "READY") {
        const me = object(await s.client.invoke({ _: "getMe" }));
        s.accountId = String(me.id);
      }
      this.emit(s, { kind: "status", state: this.status(s.ws, s.id).state });
      return;
    }
    if (kind === "updateConnectionState") {
      s.online = object(u.state)._ === "connectionStateReady";
      if (s.auth === "READY")
        this.emit(s, { kind: "status", state: this.status(s.ws, s.id).state });
      return;
    }
    if (
      kind === "updateMessageSendSucceeded" ||
      kind === "updateMessageSendFailed"
    ) {
      const receipt = this.db
        .prepare(
          "SELECT * FROM commands WHERE connectionId=? AND temporaryId=?",
        )
        .get(s.id, String(u.old_message_id)) as Receipt | undefined;
      if (!receipt) {
        if (s.early.size < 100) s.early.set(String(u.old_message_id), u);
        return;
      }
      const m = object(u.message),
        success = kind === "updateMessageSendSucceeded";
      this.db
        .prepare("UPDATE commands SET status=?,externalId=? WHERE id=?")
        .run(
          success ? "SENT" : "FAILED",
          success ? String(m.id) : null,
          receipt.id,
        );
      this.emit(s, {
        kind: "send",
        commandId: receipt.id,
        attempt: receipt.attempt,
        state: success ? "SENT" : "FAILED",
        ...(success ? { messageId: String(m.id) } : {}),
      });
      if (success && s.allowed.has(String(m.chat_id))) {
        const n = normalizeMessage(m);
        if (n)
          this.emit(s, {
            kind: "message",
            chatId: String(m.chat_id),
            messageId: n.id,
            text: n.text,
            messageKind: n.kind,
            direction: n.direction,
            timestamp: n.timestamp,
            replyTo: n.replyTo,
          });
      }
      return;
    }
    const m = kind === "updateNewMessage" ? object(u.message) : u;
    const chatId = String(m.chat_id);
    if (!s.allowed.has(chatId)) return;
    if (kind === "updateNewMessage") {
      if (m.sending_state) return;
      const chat = await this.permittedChat(s, chatId);
      if (chat.has_protected_content) return;
      const n = normalizeMessage(m);
      if (n)
        this.emit(s, {
          kind: "message",
          chatId,
          messageId: n.id,
          text: n.text,
          messageKind: n.kind,
          direction: n.direction,
          timestamp: n.timestamp,
          replyTo: n.replyTo,
        });
    }
    if (kind === "updateMessageContent") {
      await this.permittedChat(s, chatId);
      const n = normalizeMessage({ id: u.message_id, content: u.new_content });
      if (n)
        this.emit(s, {
          kind: "edit",
          chatId,
          messageId: String(u.message_id),
          text: n.text,
          messageKind: n.kind,
        });
    }
    if (kind === "updateDeleteMessages" && u.is_permanent === true) {
      for (const id of z.array(z.number()).parse(u.message_ids))
        this.emit(s, { kind: "delete", chatId, messageId: String(id) });
    }
  }
}
