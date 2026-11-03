import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { TelegramAdapter } from "../../apps/api/src/channels/gateway.client";
import { AppConfig } from "../../apps/api/src/config";
import {
  safeError,
  telegramErrorInfo,
} from "../../apps/telegram-gateway/src/native";
const secret = "private-phone-code-api-hash";
const adapter = () =>
  new TelegramAdapter({
    values: {
      GATEWAY_URL: "http://gateway:4101",
      GATEWAY_TOKEN: "fixture-token",
    },
  } as unknown as AppConfig);
beforeEach(() =>
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {}),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Telegram errors without credential disclosure", () => {
  it.each([
    ["API_ID_INVALID", "API ID/API hash"],
    ["PHONE_NUMBER_BANNED", "заблокировал"],
    ["PHONE_CODE_EXPIRED", "истёк"],
    ["UPDATE_APP_TO_LOGIN", "TDLib"],
    ["FLOOD_WAIT_60", "частоту"],
    ["Timeout expired", "дождаться"],
  ])("classifies %s", (reason, text) => {
    const info = telegramErrorInfo({
      code: 400,
      message: `${reason} ${secret}`,
    });
    expect(info.message).toContain(text);
    expect(JSON.stringify(info)).not.toContain(secret);
    expect(safeError({ code: 400, message: `${reason} ${secret}` })).toBe(
      info.message,
    );
  });
  it("does not expose arbitrary upstream text or malformed error codes", () => {
    const info = telegramErrorInfo({
      code: secret,
      message: secret,
      stack: secret,
    });
    expect(info.reason).toBe("UNCLASSIFIED");
    expect(info.code).toBeUndefined();
    expect(JSON.stringify(info)).not.toContain(secret);
  });
  it.each([
    ["ECONNREFUSED", "CONNECTION_REFUSED", "не принимает"],
    ["ENOTFOUND", "DNS_ERROR", "не может найти"],
    ["UND_ERR_SOCKET", "CONNECTION_CLOSED", "закрыто"],
  ])(
    "distinguishes %s from an authorization error",
    async (code, reason, text) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error(secret), {
              cause: { code, message: secret },
            }),
          ),
      );
      await expect(adapter().request("/configuration")).rejects.toThrow(text);
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        JSON.stringify({ event: "gateway_request_failed", reason }),
      );
      expect(
        JSON.stringify(vi.mocked(Logger.prototype.warn).mock.calls),
      ).not.toContain(secret);
    },
  );
  it("labels an HTTP timeout without claiming the Gateway is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error(secret), { name: "TimeoutError" }),
        ),
    );
    await expect(adapter().request("/configuration")).rejects.toThrow(
      "не ответил вовремя",
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      JSON.stringify({
        event: "gateway_request_failed",
        reason: "REQUEST_TIMEOUT",
      }),
    );
  });
  it("reports an internal token mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "Доступ запрещён" }), {
            status: 403,
          }),
        ),
    );
    await expect(adapter().request("/configuration")).rejects.toThrow(
      "Служебные ключи",
    );
  });
  it("does not mislabel a chat permission denial as an internal token mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: "Диалог не выбран для работы" }),
            { status: 403 },
          ),
        ),
    );
    await expect(adapter().request("/sessions/test/history")).rejects.toThrow(
      "Диалог не выбран",
    );
    expect(Logger.prototype.warn).not.toHaveBeenCalled();
  });
  it("distinguishes malformed JSON from a connection failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not JSON", { status: 200 })),
    );
    await expect(adapter().request("/configuration")).rejects.toThrow(
      "некорректный ответ",
    );
  });
  it("preserves the safe TDLib error returned by the gateway", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "Неверный код Telegram" }), {
            status: 400,
          }),
        ),
    );
    await expect(
      adapter().auth("workspace", "connection", "code", "fixture-code"),
    ).rejects.toThrow("Неверный код Telegram");
    expect(Logger.prototype.warn).not.toHaveBeenCalled();
  });
});
