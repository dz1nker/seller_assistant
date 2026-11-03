import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TelegramGateway } from "../../apps/telegram-gateway/src/gateway";
import {
  nativeInfo,
  normalizeMessage,
  type NativeClient,
  type TdObject,
} from "../../apps/telegram-gateway/src/native";

// Explicit protocol fixture, never presented as a real Telegram connection.
class FakeNative implements NativeClient {
  listeners = new Map<string, (v: unknown) => void>();
  sent: TdObject[] = [];
  closed = false;
  reject?: unknown;
  authOperation?: () => Promise<unknown>;
  on(event: "update" | "error", listener: (v: unknown) => void) {
    this.listeners.set(event, listener);
  }
  isClosed() {
    return this.closed;
  }
  async close() {
    this.closed = true;
  }
  update(v: unknown) {
    this.listeners.get("update")?.(v);
  }
  async invoke(q: TdObject) {
    if (q._ === "getMe") return { id: 123 };
    if (q._ === "getChat") return { id: 42, type: { _: "chatTypePrivate" } };
    if (q._ === "setAuthenticationPhoneNumber" && this.authOperation)
      return this.authOperation();
    if (q._ === "checkAuthenticationCode" && q.code === "wrong")
      throw { code: 400, message: "PHONE_CODE_INVALID sensitive-value" };
    if (q._ === "sendMessage") {
      this.sent.push(q);
      if (this.reject) throw this.reject;
      return { id: -10, sending_state: { _: "messageSendingStatePending" } };
    }
    return {};
  }
}
const roots: string[] = [];
const gateways: TelegramGateway[] = [];
afterEach(async () => {
  for (const g of gateways.splice(0)) await g.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture(root?: string) {
  root ??= mkdtempSync(path.join(tmpdir(), "sales-telegram-test-"));
  if (!roots.includes(root)) roots.push(root);
  const client = new FakeNative();
  const gateway = new TelegramGateway(
    {
      root,
      masterKey: "a".repeat(64),
      apiId: 123,
      apiHash: "b".repeat(32),
      callbackUrl: "http://127.0.0.1:1/events",
      token: "test-only-token",
    },
    () => client,
  );
  gateways.push(gateway);
  return { gateway, client, root, ws: randomUUID(), id: randomUUID() };
}
async function ready(f: ReturnType<typeof fixture>) {
  await f.gateway.connect(f.ws, f.id);
  f.client.update({
    _: "updateAuthorizationState",
    authorization_state: { _: "authorizationStateReady" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  f.gateway.allow(f.ws, f.id, ["42"]);
}
const message = (id: number) => ({
  id,
  chat_id: 42,
  date: 1700000000,
  is_outgoing: true,
  content: { _: "messageText", text: { text: "Тестовый ответ" } },
});
describe("TDLib adapter and durable journal", () => {
  it("loads the installed native TDLib library", () => {
    expect(nativeInfo().version).toMatch(/^1\.8\./);
  });
  it("supports code, 2FA, email and device confirmation states; redacts errors", async () => {
    const f = fixture();
    await f.gateway.connect(f.ws, f.id);
    for (const [native, state] of [
      ["WaitPhoneNumber", "WAIT_PHONE"],
      ["WaitCode", "WAIT_CODE"],
      ["WaitPassword", "WAIT_PASSWORD"],
      ["WaitEmailAddress", "WAIT_EMAIL"],
      ["WaitEmailCode", "WAIT_EMAIL_CODE"],
      ["WaitOtherDeviceConfirmation", "WAIT_DEVICE"],
    ]) {
      f.client.update({
        _: "updateAuthorizationState",
        authorization_state: { _: `authorizationState${native}` },
      });
      expect(f.gateway.status(f.ws, f.id).state).toBe(state);
    }
    f.client.update({
      _: "updateAuthorizationState",
      authorization_state: { _: "authorizationStateWaitCode" },
    });
    expect((await f.gateway.auth(f.ws, f.id, "code", "wrong")).state).toBe(
      "AUTHORIZING",
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.gateway.status(f.ws, f.id).error).toBe("Неверный код Telegram");
    expect(JSON.stringify(f.gateway.status(f.ws, f.id))).not.toContain(
      "sensitive-value",
    );
    await expect(
      f.gateway.auth(f.ws, f.id, "password", "private"),
    ).rejects.toThrow("Шаг авторизации изменился");
  });
  it("returns a pending auth status without waiting for TDLib and submits the step only once", async () => {
    const f = fixture();
    await f.gateway.connect(f.ws, f.id);
    f.client.update({
      _: "updateAuthorizationState",
      authorization_state: { _: "authorizationStateWaitPhoneNumber" },
    });
    let complete!: (v: unknown) => void;
    let count = 0;
    f.client.authOperation = () => {
      count++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    };
    expect(
      (await f.gateway.auth(f.ws, f.id, "phone", "fixture-phone")).state,
    ).toBe("AUTHORIZING");
    await expect(
      f.gateway.auth(f.ws, f.id, "phone", "fixture-phone"),
    ).rejects.toThrow("ещё выполняется");
    expect(count).toBe(1);
    f.client.update({
      _: "updateAuthorizationState",
      authorization_state: { _: "authorizationStateWaitCode" },
    });
    complete({});
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.gateway.status(f.ws, f.id).state).toBe("WAIT_CODE");
  });
  it("reports a delayed native auth failure without storing credentials or logging raw errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const f = fixture();
      await f.gateway.connect(f.ws, f.id);
      f.client.update({
        _: "updateAuthorizationState",
        authorization_state: { _: "authorizationStateWaitPhoneNumber" },
      });
      let fail!: (v: unknown) => void;
      f.client.authOperation = () =>
        new Promise((_r, reject) => {
          fail = reject;
        });
      await f.gateway.auth(f.ws, f.id, "phone", "private-phone-value");
      fail({ code: 400, message: "API_ID_INVALID private-hash-value" });
      await new Promise((resolve) => setImmediate(resolve));
      const status = f.gateway.status(f.ws, f.id);
      expect(status.state).toBe("WAIT_PHONE");
      expect(status.error).toContain("API ID/API hash");
      expect(warn).toHaveBeenCalledWith(
        JSON.stringify({
          event: "telegram_auth_failed",
          step: "phone",
          code: 400,
          reason: "API_ID_INVALID",
        }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        "private-hash-value",
      );
      expect(JSON.stringify(status)).not.toContain("private-phone-value");
      expect(
        readFileSync(path.join(f.root, "journal.sqlite-wal")).toString(),
      ).not.toContain("private-phone-value");
    } finally {
      warn.mockRestore();
    }
  });
  it("reports native network states using only known labels", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const f = fixture();
      await f.gateway.connect(f.ws, f.id);
      f.client.update({
        _: "updateConnectionState",
        state: { _: "connectionStateConnecting" },
      });
      f.client.update({
        _: "updateConnectionState",
        state: { _: "private-phone-or-api-hash" },
      });
      expect(info).toHaveBeenCalledWith(
        JSON.stringify({
          event: "telegram_connection_state",
          state: "connectionStateConnecting",
        }),
      );
      expect(info).toHaveBeenCalledWith(
        JSON.stringify({
          event: "telegram_connection_state",
          state: "UNKNOWN",
        }),
      );
      expect(JSON.stringify(info.mock.calls)).not.toContain(
        "private-phone-or-api-hash",
      );
    } finally {
      info.mockRestore();
    }
  });
  it("serializes duplicate commands and waits for TDLib success before SENT", async () => {
    const f = fixture();
    await ready(f);
    const input = {
      workspaceId: f.ws,
      connectionId: f.id,
      chatId: "42",
      commandId: randomUUID(),
      attempt: 0,
      resume: false,
      text: "Тестовый ответ",
    };
    const results = await Promise.all([
      f.gateway.send(input),
      f.gateway.send(input),
    ]);
    expect(f.client.sent).toHaveLength(1);
    expect(results.every((r) => r.status !== "SENT")).toBe(true);
    f.client.update({
      _: "updateMessageSendSucceeded",
      old_message_id: -10,
      message: message(100),
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.gateway.receipt(f.ws, f.id, input.commandId)).toEqual({
      status: "SENT",
      messageId: "100",
    });
    await expect(
      f.gateway.send({ ...input, text: "Другой ответ" }),
    ).rejects.toThrow("Ключ команды уже занят");
    expect((await f.gateway.send(input)).status).toBe("SENT");
    expect(f.client.sent).toHaveLength(1);
  });
  it("preserves uncertainty across restart and never resends a missing receipt", async () => {
    const f = fixture();
    await ready(f);
    const input = {
      workspaceId: f.ws,
      connectionId: f.id,
      chatId: "42",
      commandId: randomUUID(),
      attempt: 0,
      resume: false,
      text: "Ответ",
    };
    await f.gateway.send(input);
    await f.gateway.close();
    gateways.splice(gateways.indexOf(f.gateway), 1);
    const second = fixture(f.root);
    await second.gateway.connect(f.ws, f.id);
    expect((await second.gateway.send({ ...input, resume: true })).status).toBe(
      "UNCERTAIN",
    );
    expect(
      (
        await second.gateway.send({
          ...input,
          commandId: randomUUID(),
          resume: true,
        })
      ).status,
    ).toBe("UNCERTAIN");
    expect(second.client.sent).toHaveLength(0);
  });
  it("allows explicit retry only after a known failure; unknown failures remain uncertain", async () => {
    const f = fixture();
    await ready(f);
    const input = {
      workspaceId: f.ws,
      connectionId: f.id,
      chatId: "42",
      commandId: randomUUID(),
      attempt: 0,
      resume: false,
      text: "Ответ",
    };
    f.client.reject = { code: 400, message: "CHAT_WRITE_FORBIDDEN" };
    expect((await f.gateway.send(input)).status).toBe("FAILED");
    f.client.reject = undefined;
    expect((await f.gateway.send(input)).status).toBe("FAILED");
    expect(f.client.sent).toHaveLength(1);
    expect((await f.gateway.send({ ...input, attempt: 1 })).status).toBe(
      "SENDING",
    );
    expect(f.client.sent).toHaveLength(2);
    f.client.reject = new Error("network unavailable");
    expect(
      (await f.gateway.send({ ...input, commandId: randomUUID() })).status,
    ).toBe("UNCERTAIN");
  });
  it("requires a whitelist, isolates sessions and encrypts queued message content", async () => {
    const f = fixture();
    await ready(f);
    f.gateway.allow(f.ws, f.id, []);
    await expect(f.gateway.history(f.ws, f.id, "42")).rejects.toThrow(
      "Диалог не выбран",
    );
    expect(() => f.gateway.status(randomUUID(), f.id)).toThrow(
      "Сессия не найдена",
    );
    f.client.update({ _: "updateNewMessage", message: message(200) });
    f.gateway.allow(f.ws, f.id, ["42"]);
    f.client.update({ _: "updateNewMessage", message: message(201) });
    await new Promise((resolve) => setImmediate(resolve));
    const raw = readFileSync(
      path.join(f.root, "journal.sqlite-wal"),
    ).toString();
    expect(raw).not.toContain("Тестовый ответ");
    await f.gateway.disconnect(f.ws, f.id);
    expect(() => f.gateway.status(f.ws, f.id)).toThrow("Сессия не найдена");
  });
  it("does not normalize secret or self-destructing messages", () => {
    expect(normalizeMessage({ ...message(1), is_secret: true })).toBeNull();
    expect(
      normalizeMessage({
        ...message(1),
        self_destruct_type: { _: "messageSelfDestructTypeTimer" },
      }),
    ).toBeNull();
    expect(
      normalizeMessage({ ...message(1), content: { _: "messagePhoto" } })?.text,
    ).toBe("[Неподдерживаемое вложение]");
  });
});
