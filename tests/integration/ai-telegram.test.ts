import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../../apps/api/src/bootstrap";
import { Database } from "../../apps/api/src/infrastructure";
import { AppConfig } from "../../apps/api/src/config";
import { migrate } from "../../scripts/migrate.mjs";
import { AiService } from "../../apps/api/src/ai/ai.service";

type Identity = { id: string; workspaceId: string; cookie: string[] };
let app: INestApplication,
  db: Database,
  a: Identity,
  b: Identity,
  server: Server;
let config: AppConfig["values"], endpoint: string;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const get = (path: string, u = a) =>
  request(app.getHttpServer()).get(path).set("Cookie", u.cookie);
const post = (path: string, body: object = {}, u = a) =>
  request(app.getHttpServer())
    .post(path)
    .set("Cookie", u.cookie)
    .set("Origin", origin)
    .send(body);
const del = (path: string, u = a) =>
  request(app.getHttpServer())
    .delete(path)
    .set("Cookie", u.cookie)
    .set("Origin", origin);
const wire: Record<string, unknown>[] = [];
let hold = false,
  received: (() => void) | undefined,
  release: (() => void) | undefined;
async function register(): Promise<Identity> {
  const r = await request(app.getHttpServer())
    .post("/auth/register")
    .set("Origin", origin)
    .send({
      email: `${randomUUID()}@example.test`,
      password: "Synthetic-test-password-123!",
      name: "AI fixture",
      workspaceName: "Synthetic AI fixture",
    })
    .expect(201);
  return {
    ...r.body,
    cookie: (r.headers["set-cookie"] as unknown as string[]).map(
      (s) => s.split(";")[0]!,
    ),
  };
}
async function conversation(
  mode: "CLIENT" | "CANDIDATE" | "EXCLUDED" = "CLIENT",
  owner = a,
) {
  return db.conversation.create({
    data: {
      workspaceId: owner.workspaceId,
      source: "TELEGRAM",
      title: "Synthetic Telegram protocol fixture",
      mode,
      messages:
        mode === "CLIENT"
          ? {
              create: {
                text: "Synthetic request for consultation details",
                direction: "IN",
                status: "SENT",
              },
            }
          : undefined,
    },
  });
}
async function proof() {
  const setup = (await get("/ai/setup").expect(200)).body;
  return {
    sourcePolicyReference: "fixture://source-policy/test-only",
    sourcePolicyVersion: "synthetic-test-policy-v1",
    rightsBasis: "DOCUMENTED_CONSENT",
    rightsReference: "fixture://consent/synthetic-test-only",
    reviewNotes:
      "Synthetic test fixture of a policy review. This is not a real approval.",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    policyReviewed: true,
    rightsVerified: true,
    providerRevision: setup.revision,
  };
}
const authorize = async (id: string) =>
  (
    await post(`/ai/conversations/${id}/authorization`, await proof()).expect(
      201,
    )
  ).body;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!/^[a-z][a-z0-9_]*_test$/.test(url.pathname.slice(1)))
    throw new Error("Dedicated test database required");
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const pg = new Client({ connectionString: admin.toString() });
  await pg.connect();
  try {
    if (
      !(
        await pg.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          url.pathname.slice(1),
        ])
      ).rowCount
    )
      await pg.query(`CREATE DATABASE "${url.pathname.slice(1)}"`);
  } finally {
    await pg.end();
  }
  await migrate(url.toString());
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  db = app.get(Database);
  config = app.get(AppConfig).values;
  config.GATEWAY_TOKEN = "";
  a = await register();
  b = await register();
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<
      string,
      any
    >;
    wire.push(body);
    if (hold) {
      received?.();
      await new Promise<void>((r) => {
        release = r;
      });
    }
    const data =
      body.response_format?.json_schema?.name === "connection_test"
        ? { ok: true }
        : {
            summary: "Synthetic provider analysis",
            facts: [],
            needs: ["Уточнить задачу"],
            objections: [],
            missing_information: [],
            intent: "product_interest",
            stage_suggestion: "Выявление потребности",
            recommended_action: "clarify_need",
            reasoning_summary: "Синтетический тестовый результат",
            responses: [
              { tone: "warm", text: "Расскажите о вашей задаче." },
              {
                tone: "confident",
                text: "Уточним задачу и подходящий формат.",
              },
              { tone: "short", text: "Какая у вас задача?" },
            ],
          };
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(data) } }],
        usage: { prompt_tokens: 120, completion_tokens: 40 },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  config.AI_PROVIDER = "openai";
  config.AI_API_KEY = "synthetic-fixture-api-key";
  config.AI_BASE_URL = endpoint;
  config.AI_MODEL = "fixture-model";
  config.AI_PROXY_URL = undefined;
});
afterAll(async () => {
  hold = false;
  release?.();
  if (db && a && b) {
    await db.workspace.deleteMany({
      where: { id: { in: [a.workspaceId, b.workspaceId] } },
    });
    await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
  await app?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
describe("Telegram AI with scoped, documented authorization", () => {
  it("reports provider setup without secrets and tests with synthetic service data only", async () => {
    const setup = (await get("/ai/setup").expect(200)).body;
    expect(setup.configured).toBe(true);
    expect(JSON.stringify(setup)).not.toContain(config.AI_API_KEY);
    await post("/ai/test").expect(201);
    expect(JSON.stringify(wire.at(-1))).not.toContain(
      "Synthetic request for consultation details",
    );
  });
  it("denies real Telegram by default before any external request and rejects incomplete evidence", async () => {
    const c = await conversation();
    const before = wire.length;
    expect(
      (await get(`/ai/conversations/${c.id}/access`).expect(200)).body.allowed,
    ).toBe(false);
    await post("/ai/analyze", { conversationId: c.id }).expect(403);
    const p = await proof();
    for (const change of [
      { rightsReference: "" },
      { rightsVerified: false },
      { policyReviewed: false },
      { allowTelegramAi: true },
      { approvedBy: b.id },
    ])
      await post(`/ai/conversations/${c.id}/authorization`, {
        ...p,
        ...change,
      }).expect(400);
    expect(wire.length).toBe(before);
  });
  it("allows only the selected client conversation and records the authorization on its analysis", async () => {
    const c = await conversation();
    const unrelated = await conversation();
    const foreign = await conversation("CLIENT", b);
    const access = await authorize(c.id);
    expect(access.allowed).toBe(true);
    expect(JSON.stringify(access)).not.toContain("fixture://consent");
    const analysis = (
      await post("/ai/analyze", { conversationId: c.id }).expect(201)
    ).body;
    expect(analysis.authorizationId).toBe(access.authorization.id);
    expect(analysis.suggestions).toHaveLength(3);
    expect(analysis.usage[0].inputTokens).toBe(120);
    const ctx = JSON.parse((wire.at(-1) as any).messages[1].content);
    const messageIds = (
      await db.message.findMany({ where: { conversationId: c.id } })
    ).map((m) => m.id);
    expect(ctx.source).toBe("AUTHORIZED_TELEGRAM");
    expect(ctx.messages.map((m: { id: string }) => m.id)).toEqual(messageIds);
    expect(JSON.stringify(ctx)).not.toContain("fixture://consent");
    const before = wire.length;
    await post("/ai/analyze", { conversationId: unrelated.id }).expect(403);
    await post("/ai/analyze", { conversationId: foreign.id }).expect(404);
    await get(`/ai/conversations/${c.id}/access`, b).expect(404);
    await post(
      `/ai/conversations/${c.id}/authorization`,
      await proof(),
      b,
    ).expect(404);
    await del(`/ai/conversations/${c.id}/authorization`, b).expect(404);
    expect(wire.length).toBe(before);
    await expect(
      db.aiAnalysis.create({
        data: {
          workspaceId: a.workspaceId,
          conversationId: unrelated.id,
          authorizationId: access.authorization.id,
          contextVersion: "fixture",
          provider: "fixture",
          promptVersion: "fixture",
          result: {},
        },
      }),
    ).rejects.toThrow();
  });
  it("rejects candidate/excluded chats and grants with invalid expiry or stale provider review", async () => {
    for (const mode of ["CANDIDATE", "EXCLUDED"] as const) {
      const c = await conversation(mode);
      await post(
        `/ai/conversations/${c.id}/authorization`,
        await proof(),
      ).expect(403);
    }
    const c = await conversation();
    const p = await proof();
    await post(`/ai/conversations/${c.id}/authorization`, {
      ...p,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }).expect(400);
    await post(`/ai/conversations/${c.id}/authorization`, {
      ...p,
      providerRevision: "0".repeat(64),
    }).expect(400);
    expect(
      await db.aiAuthorization.count({ where: { conversationId: c.id } }),
    ).toBe(0);
  });
  it("revokes access, deletes generated derivatives and preserves CRM messages", async () => {
    const c = await conversation();
    const first = await authorize(c.id);
    await post("/ai/analyze", { conversationId: c.id }).expect(201);
    const result = (
      await del(`/ai/conversations/${c.id}/authorization`).expect(200)
    ).body;
    expect(result.allowed).toBe(false);
    expect(await db.aiAnalysis.count({ where: { conversationId: c.id } })).toBe(
      0,
    );
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(1);
    const before = wire.length;
    await post("/ai/analyze", { conversationId: c.id }).expect(403);
    await get(`/ai/conversations/${c.id}`).expect(403);
    expect(wire.length).toBe(before);
    const second = await authorize(c.id);
    expect(second.authorization.id).not.toBe(first.authorization.id);
    expect(
      (
        await db.aiAuthorization.findUniqueOrThrow({
          where: { id: first.authorization.id },
        })
      ).revokedAt,
    ).not.toBeNull();
  });
  it("rechecks authorization under the send transaction lock after a concurrent revocation", async () => {
    const c = await conversation();
    const connection = await db.channelConnection.create({
      data: {
        workspaceId: a.workspaceId,
        channel: "TELEGRAM",
        status: "READY",
      },
    });
    await db.conversation.update({
      where: { id: c.id },
      data: { connectionId: connection.id, externalChatId: "42" },
    });
    await authorize(c.id);
    const analysis = (
      await post("/ai/analyze", { conversationId: c.id }).expect(201)
    ).body;
    const service = app.get(AiService);
    const original = service.suggestion.bind(service);
    const spy = vi
      .spyOn(service, "suggestion")
      .mockImplementationOnce(async (...args) => {
        const validated = await original(...args);
        await del(`/ai/conversations/${c.id}/authorization`).expect(200);
        return validated;
      });
    try {
      await post(`/conversations/${c.id}/messages`, {
        key: randomUUID(),
        text: analysis.suggestions[0].text,
        suggestionId: analysis.suggestions[0].id,
      }).expect(403);
      expect(
        await db.messageCommand.count({ where: { conversationId: c.id } }),
      ).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it("requires a new review after model or provider changes and rejects expired grants", async () => {
    const c = await conversation();
    const authorization = (await authorize(c.id)).authorization;
    const before = wire.length;
    config.AI_MODEL = "changed-fixture-model";
    try {
      expect(
        (await get(`/ai/conversations/${c.id}/access`).expect(200)).body
          .allowed,
      ).toBe(false);
      await post("/ai/analyze", { conversationId: c.id }).expect(403);
    } finally {
      config.AI_MODEL = "fixture-model";
    }
    await db.aiAuthorization.update({
      where: { id: authorization.id },
      data: {
        createdAt: new Date(Date.now() - 2 * 86400000),
        expiresAt: new Date(Date.now() - 86400000),
      },
    });
    expect(
      (await get(`/ai/conversations/${c.id}/access`).expect(200)).body.reason,
    ).toContain("истёк");
    await post("/ai/analyze", { conversationId: c.id }).expect(403);
    expect(wire.length).toBe(before);
  });
  it("checks live reviewer roles and prevents member grants, revocations and provider tests", async () => {
    const c = await conversation();
    await authorize(c.id);
    await db.workspaceMember.update({
      where: {
        workspaceId_userId: { workspaceId: a.workspaceId, userId: a.id },
      },
      data: { role: "MEMBER" },
    });
    try {
      expect(
        (await get(`/ai/conversations/${c.id}/access`).expect(200)).body
          .allowed,
      ).toBe(false);
      await post("/ai/analyze", { conversationId: c.id }).expect(403);
      await post(
        `/ai/conversations/${c.id}/authorization`,
        await proof(),
      ).expect(403);
      await del(`/ai/conversations/${c.id}/authorization`).expect(403);
      await post("/ai/test").expect(403);
    } finally {
      await db.workspaceMember.update({
        where: {
          workspaceId_userId: { workspaceId: a.workspaceId, userId: a.id },
        },
        data: { role: "OWNER" },
      });
    }
  });
  it("does not save an in-flight provider result after authorization is revoked", async () => {
    const c = await conversation();
    await authorize(c.id);
    hold = true;
    const started = new Promise<void>((r) => {
      received = r;
    });
    const pending = post("/ai/analyze", { conversationId: c.id }).then(
      (r) => r,
    );
    try {
      await started;
      await del(`/ai/conversations/${c.id}/authorization`).expect(200);
    } finally {
      hold = false;
      release?.();
    }
    expect((await pending).status).toBe(403);
    expect(await db.aiAnalysis.count({ where: { conversationId: c.id } })).toBe(
      0,
    );
    received = undefined;
    release = undefined;
  });
  it("serializes parallel reviews and removes authorizations when the chat is excluded", async () => {
    const c = await conversation();
    const p = await proof();
    await Promise.all([
      post(`/ai/conversations/${c.id}/authorization`, p).expect(201),
      post(`/ai/conversations/${c.id}/authorization`, p).expect(201),
    ]);
    expect(
      await db.aiAuthorization.count({
        where: { conversationId: c.id, revokedAt: null },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .patch(`/conversations/${c.id}/policy`)
      .set("Origin", origin)
      .set("Cookie", a.cookie)
      .send({ mode: "EXCLUDED" })
      .expect(200);
    expect(
      await db.aiAuthorization.count({ where: { conversationId: c.id } }),
    ).toBe(0);
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(0);
    expect(
      await db.auditLog.count({
        where: {
          workspaceId: a.workspaceId,
          action: "ai.authorization_granted",
        },
      }),
    ).toBeGreaterThan(0);
  });
});
