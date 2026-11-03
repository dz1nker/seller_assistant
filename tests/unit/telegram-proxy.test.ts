import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseTelegramProxy,
  proxyQuery,
} from "../../apps/telegram-gateway/src/proxy";
import { createNative, object } from "../../apps/telegram-gateway/src/native";

describe("Telegram proxy configuration", () => {
  it.each([undefined, "", "   "])(
    "disables proxy for an empty setting: %s",
    (value) => {
      expect(parseTelegramProxy(value)).toBeUndefined();
      expect(proxyQuery(parseTelegramProxy(value))).toEqual({
        _: "disableProxy",
      });
    },
  );
  it.each(["https://t.me/proxy", "tg://proxy", "https://telegram.me/proxy/"])(
    "accepts MTProto sharing links: %s",
    (base) => {
      expect(
        parseTelegramProxy(
          `${base}?server=proxy.example&port=443&secret=${"ee" + "a".repeat(64)}`,
        ),
      ).toEqual({
        server: "proxy.example",
        port: 443,
        type: { _: "proxyTypeMtproto", secret: "ee" + "a".repeat(64) },
      });
    },
  );
  it.each(["https://t.me/socks", "tg://socks"])(
    "accepts SOCKS sharing links with encoded credentials: %s",
    (base) => {
      expect(
        parseTelegramProxy(
          `${base}?server=proxy.example&port=1080&user=user%40name&pass=p%24%26%23%2B`,
        ),
      ).toEqual({
        server: "proxy.example",
        port: 1080,
        type: {
          _: "proxyTypeSocks5",
          username: "user@name",
          password: "p$&#+",
        },
      });
    },
  );
  it("accepts SOCKS5, HTTP CONNECT and local Docker host URLs", () => {
    expect(
      parseTelegramProxy("socks5://u:p%40%24@host.docker.internal:1080"),
    ).toEqual({
      server: "host.docker.internal",
      port: 1080,
      type: { _: "proxyTypeSocks5", username: "u", password: "p@$" },
    });
    expect(parseTelegramProxy("http://proxy.example:80")).toEqual({
      server: "proxy.example",
      port: 80,
      type: {
        _: "proxyTypeHttp",
        username: "",
        password: "",
        http_only: false,
      },
    });
    expect(parseTelegramProxy("socks5://[::1]:1080")?.server).toBe("::1");
  });
  it.each([
    "private-secret-not-a-url",
    "https://untrusted.example/proxy?server=x&port=443&secret=private-secret",
    "socks5://u:%XX@proxy.example:1080",
    "socks5://proxy.example:0",
    "socks5://proxy.example:65536",
    "socks5://proxy.example",
    "https://t.me/proxy?server=x&port=443",
    "https://t.me/proxy?server=x&port=443&secret=private-secret&server=y",
    "tg://socks?server=x&port=1e3",
    "tg://proxy?server=x/path&port=443&secret=private-secret",
    "socks5://u:private-secret%00@proxy.example:1080",
    "http://proxy.example/path",
    "https://t.me/proxy?server=x&port=443&secret=private-secret\n",
    "x".repeat(4097),
  ])(
    "rejects invalid configuration without revealing the input (#%#)",
    (value) => {
      let caught: unknown;
      try {
        parseTelegramProxy(value);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      const error = caught as Error;
      expect(error.message).toContain("Invalid TELEGRAM_PROXY_URL");
      expect(error.stack).not.toContain(value);
      expect(error.stack).not.toContain("private-secret");
      expect(error.cause).toBeUndefined();
    },
  );
  it("applies all supported proxy types to the installed native TDLib before login", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "sales-native-proxy-"));
    const client = createNative({
      apiId: 123,
      apiHash: "b".repeat(32),
      databaseDirectory: path.join(root, "database"),
      filesDirectory: path.join(root, "files"),
      databaseEncryptionKey: Buffer.alloc(32, 1).toString("base64"),
    });
    // No phone, account credentials, or real proxy is used in this native contract check.
    client.on("error", () => {});
    try {
      for (const value of [
        "socks5://127.0.0.1:1",
        "http://127.0.0.1:1",
        `tg://proxy?server=127.0.0.1&port=1&secret=${"a".repeat(32)}`,
      ]) {
        const result = object(
          await client.invoke(proxyQuery(parseTelegramProxy(value))),
        );
        expect(result._).toBe("addedProxy");
        expect(object(result.proxy).server).toBe("127.0.0.1");
        expect(result.is_enabled).toBe(true);
      }
      expect(object(await client.invoke(proxyQuery()))._).toBe("ok");
      const proxies = object(await client.invoke({ _: "getProxies" }))
        .proxies as { is_enabled: boolean }[];
      expect(proxies.every((proxy) => !proxy.is_enabled)).toBe(true);
    } finally {
      await client.close();
      rmSync(root, { recursive: true, force: true });
    }
  }, 15000);
});
