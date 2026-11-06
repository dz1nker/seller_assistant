import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import {
  AiProvider,
  aiProviderFingerprint,
  aiSetup,
  aiTransportMessage,
} from "../../apps/api/src/ai/provider";
import type { AppConfig } from "../../apps/api/src/config";
import { aiAuthorizationSchema } from "@sales/shared";

const servers: Server[] = [],
  providers: AiProvider[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}
afterEach(async () => {
  for (const p of providers.splice(0)) await p.onModuleDestroy();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
function config(base: string, proxy?: string) {
  return {
    values: {
      AI_PROVIDER: "openai",
      AI_API_KEY: "fixture-private-ai-key",
      AI_BASE_URL: base,
      AI_MODEL: "fixture-model",
      AI_PROXY_URL: proxy,
    },
  } as AppConfig;
}
function provider(c: AppConfig) {
  const p = new AiProvider(c);
  providers.push(p);
  return p;
}
describe("AI provider transport and permission input", () => {
  it("tunnels AI through an authenticated HTTP proxy without forwarding proxy credentials to the provider", async () => {
    let providerAuthorization: unknown,
      leakedProxyAuthorization: unknown,
      proxyAuthorization: unknown,
      target: unknown;
    const port = await listen(
      createServer(async (req, res) => {
        for await (const _ of req) {
        }
        providerAuthorization = req.headers.authorization;
        leakedProxyAuthorization = req.headers["proxy-authorization"];
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
        );
      }),
    );
    const proxy = createServer((_req, res) => {
      res.writeHead(500);
      res.end();
    });
    proxy.on("connect", (req, socket, head) => {
      target = req.url;
      proxyAuthorization = req.headers["proxy-authorization"];
      const upstream = net.createConnection({ host: "127.0.0.1", port }, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      socket.on("error", () => upstream.destroy());
      upstream.on("error", () => socket.destroy());
      socket.on("close", () => upstream.destroy());
      upstream.on("close", () => socket.destroy());
    });
    const proxyPort = await listen(proxy);
    // This hostname cannot resolve: a passing request demonstrates proxy routing.
    const c = config(
      "http://ai-fixture.invalid/v1",
      `http://proxy-user:proxy-pass%40%23@127.0.0.1:${proxyPort}`,
    );
    const result = await provider(c).test();
    expect(result.ok).toBe(true);
    expect(target).toBe("ai-fixture.invalid:80");
    expect(proxyAuthorization).toBe(
      `Basic ${Buffer.from("proxy-user:proxy-pass@#").toString("base64")}`,
    );
    expect(providerAuthorization).toBe("Bearer fixture-private-ai-key");
    expect(leakedProxyAuthorization).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-private|proxy-pass|proxy-user/,
    );
  });
  it("reports HTTP proxy authentication failures without exposing credentials", async () => {
    const proxy = createServer();
    proxy.on("connect", (_req, socket) =>
      socket.end(
        "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n",
      ),
    );
    const port = await listen(proxy);
    await expect(
      provider(
        config(
          "https://ai-fixture.invalid/v1",
          `http://private-user:private-password@127.0.0.1:${port}`,
        ),
      ).test(),
    ).rejects.toThrow("требует логин и пароль");
  });
  it.each([
    [401, "API-ключ"],
    [403, "запретил"],
    [404, "модель"],
    [429, "квоте"],
    [500, "Structured Outputs"],
  ])(
    "returns a useful, redacted provider error for HTTP %i",
    async (status, message) => {
      const port = await listen(
        createServer((_req, res) => {
          res.writeHead(Number(status));
          res.end("private-upstream-body private-api-key");
        }),
      );
      let error: unknown;
      try {
        await provider(config(`http://127.0.0.1:${port}/v1`)).test();
      } catch (e) {
        error = e;
      }
      expect(String(error)).toContain(message);
      expect(String(error)).not.toContain("private-upstream");
      expect(String(error)).not.toContain("private-api-key");
    },
  );
  it("never follows a provider redirect carrying conversation context", async () => {
    let forwarded = 0;
    const target = await listen(
      createServer((_req, res) => {
        forwarded++;
        res.end("wrong-destination");
      }),
    );
    const port = await listen(
      createServer((_req, res) => {
        res.writeHead(307, { Location: `http://127.0.0.1:${target}/steal` });
        res.end();
      }),
    );
    await expect(
      provider(config(`http://127.0.0.1:${port}/v1`)).complete({
        messages: [{ role: "user", content: "synthetic conversation data" }],
      }),
    ).rejects.toThrow("перенаправление");
    expect(forwarded).toBe(0);
  });
  it.each([
    [{ name: "TimeoutError", message: "private-value" }, "25 секунд"],
    [
      { cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: "private-proxy" } },
      "время подключения",
    ],
    [{ cause: { code: "ENOTFOUND", message: "private-host" } }, "найти сервер"],
    [
      { cause: { code: "ECONNRESET", message: "private-password" } },
      "соединение",
    ],
    [
      { cause: { code: "CERT_HAS_EXPIRED", message: "private-certificate" } },
      "TLS",
    ],
    [{ message: "private-unknown-value" }, "Нет связи"],
  ])("does not echo transport errors", (error, message) => {
    expect(aiTransportMessage(error)).toContain(message);
    expect(aiTransportMessage(error)).not.toContain("private-");
  });
  it("binds consent to endpoint and model while allowing API key rotation", () => {
    const c = config(
      "https://api.example/v1",
      "http://private:secret@proxy.example:8080",
    );
    const first = aiProviderFingerprint(c);
    c.values.AI_API_KEY = "rotated-private-key";
    expect(aiProviderFingerprint(c)).toBe(first);
    c.values.AI_MODEL = "another-model";
    expect(aiProviderFingerprint(c)).not.toBe(first);
    expect(JSON.stringify(aiSetup(c))).not.toMatch(/secret|private|rotated/);
  });
  it("requires source review, documented rights and the provider revision rather than a universal toggle", () => {
    const proof = {
      sourcePolicyReference: "Synthetic policy reference",
      sourcePolicyVersion: "fixture-v1",
      rightsBasis: "DOCUMENTED_CONSENT",
      rightsReference: "Synthetic consent record",
      reviewNotes:
        "Synthetic test evidence of a source policy and rights review.",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      policyReviewed: true,
      rightsVerified: true,
      providerRevision: "a".repeat(64),
    };
    expect(aiAuthorizationSchema.safeParse(proof).success).toBe(true);
    for (const change of [
      { rightsReference: "" },
      { policyReviewed: false },
      { rightsVerified: false },
      { allowTelegramAi: true },
      { workspaceId: "other" },
      { providerRevision: "" },
    ])
      expect(
        aiAuthorizationSchema.safeParse({ ...proof, ...change }).success,
      ).toBe(false);
  });
});
