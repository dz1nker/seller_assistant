import "reflect-metadata";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { Client } from "pg";
import type { INestApplication } from "@nestjs/common";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../../apps/api/src/bootstrap";
import { Database, Events } from "../../apps/api/src/infrastructure";
import { AppConfig } from "../../apps/api/src/config";
import { MessagesService } from "../../apps/api/src/channels/messages.service";
import { AutomationService } from "../../apps/api/src/channels/automation.service";
import { migrate } from "../../scripts/migrate.mjs";

type Identity = { id: string; workspaceId: string; cookie: string[] };
let app: INestApplication, db: Database, a: Identity, b: Identity;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const get = (p: string, u = a) =>
  request(app.getHttpServer()).get(p).set("Cookie", u.cookie);
const post = (p: string, body: object = {}, u = a) =>
  request(app.getHttpServer())
    .post(p)
    .set("Origin", origin)
    .set("Cookie", u.cookie)
    .send(body);
const patch = (p: string, body: object, u = a) =>
  request(app.getHttpServer())
    .patch(p)
    .set("Origin", origin)
    .set("Cookie", u.cookie)
    .send(body);
const del = (p: string, u = a) =>
  request(app.getHttpServer())
    .delete(p)
    .set("Origin", origin)
    .set("Cookie", u.cookie);
async function register() {
  const r = await request(app.getHttpServer())
    .post("/auth/register")
    .set("Origin", origin)
    .send({
      email: `${randomUUID()}@example.test`,
      password: "Test-only-password-123!",
      name: "Тест",
      workspaceName: "MVP test",
    })
    .expect(201);
  return {
    ...r.body,
    cookie: (r.headers["set-cookie"] as unknown as string[]).map(
      (s) => s.split(";")[0]!,
    ),
  } as Identity;
}
async function contact(name = "Клиент") {
  return (await post("/contacts", { name }).expect(201)).body;
}
async function conversation() {
  const c = await contact();
  return (
    await post("/conversations", {
      title: "Явный демодиалог",
      contactId: c.id,
    }).expect(201)
  ).body;
}
async function pipeline() {
  return (
    await post("/pipelines", {
      name: `Воронка ${randomUUID().slice(0, 8)}`,
    }).expect(201)
  ).body;
}
async function waitFor(check: () => Promise<boolean>) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Condition did not become true");
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  if (!/^[a-z][a-z0-9_]*_test$/.test(name))
    throw new Error("Test database required");
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const pg = new Client({ connectionString: admin.toString() });
  await pg.connect();
  try {
    if (
      !(await pg.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
        .rowCount
    )
      await pg.query(`CREATE DATABASE "${name}"`);
  } finally {
    await pg.end();
  }
  await migrate(url.toString());
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  db = app.get(Database);
  app.get(AppConfig).values.AI_PROVIDER = "demo";
  a = await register();
  b = await register();
});
afterAll(async () => {
  if (db && a && b) {
    await db.workspace.deleteMany({
      where: { id: { in: [a.workspaceId, b.workspaceId] } },
    });
    await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
  await app?.close();
});
describe("MVP using real PostgreSQL, Redis, BullMQ and HTTP", () => {
  it("persists product details, expert profile and knowledge; isolates edits", async () => {
    const product = (
      await post("/products", {
        name: "Консультация",
        description: "Разбор задачи",
        amount: "1250.50",
        limitations: "Без гарантий результата",
      }).expect(201)
    ).body;
    expect(product.amount).toBe("1250.5");
    await patch(
      `/products/${product.id}`,
      { name: "Чужое изменение" },
      b,
    ).expect(404);
    await patch("/business", {
      specialization: "Консультант",
      forbidden: "Гарантированный доход",
    }).expect(200);
    await post("/knowledge", {
      title: "Условия",
      text: "Оплата после согласования формата",
    }).expect(201);
    const business = (await get("/business").expect(200)).body;
    expect(business.profile.specialization).toBe("Консультант");
    expect(business.knowledge).toHaveLength(1);
    expect((await get("/products", b)).body).toEqual([]);
  });
  it("preserves the existing amount and currency on a partial deal edit", async () => {
    const c = await contact(),
      p = await pipeline();
    const deal = (
      await post("/deals", {
        title: "Стоимость без изменений",
        contactId: c.id,
        pipelineId: p.id,
        stageId: p.stages[0].id,
        amount: "2500.25",
        currency: "USD",
      }).expect(201)
    ).body;
    const updated = (
      await patch(`/deals/${deal.id}`, {
        version: deal.version,
        priority: "HIGH",
      }).expect(200)
    ).body;
    expect(updated.priority).toBe("HIGH");
    expect(updated.amount).toBe("2500.25");
    expect(updated.currency).toBe("USD");
    const cleared = (
      await patch(`/deals/${deal.id}`, {
        version: updated.version,
        amount: null,
      }).expect(200)
    ).body;
    expect(cleared.amount).toBeNull();
    expect(cleared.currency).toBe("USD");
  });
  it("rejects tenant injection and all cross-workspace associations", async () => {
    const c = await contact();
    const p = await pipeline();
    const foreign = (await get("/pipelines", b)).body[0];
    await post("/contacts", {
      name: "Injected",
      workspaceId: b.workspaceId,
    }).expect(400);
    await patch(`/contacts/${c.id}`, { name: "Other" }, b).expect(404);
    await post("/deals", {
      contactId: c.id,
      pipelineId: foreign.id,
      stageId: foreign.stages[0].id,
      title: "Bad",
    }).expect(404);
    await post("/deals", {
      contactId: c.id,
      pipelineId: p.id,
      stageId: foreign.stages[0].id,
      title: "Bad",
    }).expect(404);
    await post("/conversations", { title: "Bad", contactId: c.id }, b).expect(
      404,
    );
  });
  it("moves deals with optimistic concurrency, explicit WON confirmation and history", async () => {
    const c = await contact();
    const p = await pipeline();
    let d = (
      await post("/deals", {
        contactId: c.id,
        pipelineId: p.id,
        stageId: p.stages[0].id,
        title: "Реальная сделка",
        amount: null,
      }).expect(201)
    ).body;
    const won = p.stages.find((s: { kind: string }) => s.kind === "WON");
    await post(`/deals/${d.id}/move`, {
      stageId: won.id,
      version: d.version,
    }).expect(400);
    d = (
      await post(`/deals/${d.id}/move`, {
        stageId: p.stages[1].id,
        version: d.version,
      }).expect(201)
    ).body;
    expect(d.history).toHaveLength(2);
    expect(d.status).toBe("OPEN");
    await patch(`/deals/${d.id}`, {
      title: "Stale",
      version: d.version - 1,
    }).expect(409);
    const second = await pipeline();
    d = (
      await post(`/deals/${d.id}/move`, {
        stageId: second.stages[0].id,
        version: d.version,
      }).expect(201)
    ).body;
    expect(d.pipelineId).toBe(second.id);
    d = (
      await post(`/deals/${d.id}/move`, {
        stageId: won.id,
        version: d.version,
        confirmWon: true,
      }).expect(201)
    ).body;
    expect(d.status).toBe("WON");
    expect(d.closedAt).toBeTruthy();
    await del(`/pipelines/${p.id}`).expect(409);
  });
  it("requires safe stage replacement and detects concurrent pipeline edits", async () => {
    const c = await contact();
    const p = await pipeline();
    const d = (
      await post("/deals", {
        contactId: c.id,
        pipelineId: p.id,
        stageId: p.stages[0].id,
        title: "Этап",
      })
    ).body;
    const body = {
      expectedVersion: p.version,
      stages: p.stages
        .slice(1)
        .map(
          ({ id, name, kind }: { id: string; name: string; kind: string }) => ({
            id,
            name,
            kind,
          }),
        ),
    };
    const put = (body: object) =>
      request(app.getHttpServer())
        .put(`/pipelines/${p.id}/stages`)
        .set("Origin", origin)
        .set("Cookie", a.cookie)
        .send(body);
    await put(body).expect(409);
    await put({
      ...body,
      replacements: { [p.stages[0].id]: p.stages[1].id },
    }).expect(200);
    await put(body).expect(409);
    const updated = (await get(`/deals/${d.id}`)).body;
    expect(updated.stageId).toBe(p.stages[1].id);
    expect(updated.history).toHaveLength(2);
  });
  it("keeps deal status consistent when stage edits race with new deals", async () => {
    const c = await contact();
    for (let i = 0; i < 10; i++) {
      const p = await pipeline();
      const stages = p.stages.map(
        (s: { id: string; name: string; kind: string }, index: number) => ({
          id: s.id,
          name: s.name,
          kind: index === 0 ? "WON" : s.kind,
        }),
      );
      const [created, edited] = await Promise.all([
        post("/deals", {
          contactId: c.id,
          pipelineId: p.id,
          stageId: p.stages[0].id,
          title: "Concurrent deal",
        }),
        request(app.getHttpServer())
          .put(`/pipelines/${p.id}/stages`)
          .set("Origin", origin)
          .set("Cookie", a.cookie)
          .send({ expectedVersion: p.version, stages }),
      ]);
      expect([201, 400]).toContain(created.status);
      expect([200, 409]).toContain(edited.status);
      const deals = await db.deal.findMany({
        where: { workspaceId: a.workspaceId, pipelineId: p.id },
        include: { stage: true },
      });
      for (const deal of deals) {
        expect(deal.status).toBe(deal.stage.kind);
        expect(deal.status).toBe("OPEN");
      }
    }
  });
  it("paginates by stable cursor and rejects a cursor from another conversation", async () => {
    const c = await conversation();
    await db.message.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        workspaceId: a.workspaceId,
        conversationId: c.id,
        text: `Message ${i}`,
        direction: "IN",
        status: "SENT" as const,
        sentAt: new Date(1700000000000 + i * 1000),
      })),
    });
    const first = (
      await get(`/conversations/${c.id}/messages?limit=3`).expect(200)
    ).body;
    expect(first.items.map((m: { text: string }) => m.text)).toEqual([
      "Message 4",
      "Message 5",
      "Message 6",
    ]);
    const second = (
      await get(
        `/conversations/${c.id}/messages?limit=3&cursor=${first.nextCursor}`,
      ).expect(200)
    ).body;
    expect(second.items.map((m: { text: string }) => m.text)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
    ]);
    const other = await conversation();
    await get(
      `/conversations/${other.id}/messages?cursor=${first.items[0].id}`,
    ).expect(400);
    await get(`/conversations/${c.id}/messages`, b).expect(404);
  });
  it("deduplicates manual sends and completes them through the real queue worker", async () => {
    const c = await conversation();
    const payload = { key: randomUUID(), text: "Ручной демоответ" };
    const results = await Promise.all([
      post(`/conversations/${c.id}/messages`, payload).expect(202),
      post(`/conversations/${c.id}/messages`, payload).expect(202),
    ]);
    expect(results[0].body.commandId).toBe(results[1].body.commandId);
    const id = results[0].body.commandId;
    await waitFor(
      async () => (await get(`/message-commands/${id}`)).body.status === "SENT",
    );
    expect(
      await db.message.count({
        where: { conversationId: c.id, text: payload.text },
      }),
    ).toBe(1);
    await post(`/conversations/${c.id}/messages`, {
      ...payload,
      text: "Другой ответ",
    }).expect(409);
    await get(`/message-commands/${id}`, b).expect(404);
  });
  it("tracks applied and edited AI suggestions only as sent after delivery", async () => {
    const c = await conversation();
    await db.message.create({
      data: {
        workspaceId: a.workspaceId,
        conversationId: c.id,
        text: "Как проходит работа?",
        direction: "IN",
        status: "SENT",
      },
    });
    const analysis = (
      await post("/ai/analyze", { conversationId: c.id }).expect(201)
    ).body;
    expect(analysis.provider).toBe("DEMO_RULES");
    expect(analysis.suggestions).toHaveLength(3);
    const s = analysis.suggestions[0];
    await post(`/ai/suggestions/${s.id}/feedback`, {
      feedback: "APPLIED",
    }).expect(201);
    expect(
      (await db.aiSuggestion.findUniqueOrThrow({ where: { id: s.id } }))
        .feedback,
    ).toBe("APPLIED");
    const cmd = (
      await post(`/conversations/${c.id}/messages`, {
        key: randomUUID(),
        text: s.text + " Дополнение.",
        suggestionId: s.id,
      }).expect(202)
    ).body;
    await waitFor(
      async () =>
        (await get(`/message-commands/${cmd.commandId}`)).body.status ===
        "SENT",
    );
    const saved = await db.aiSuggestion.findUniqueOrThrow({
      where: { id: s.id },
    });
    expect(saved.feedback).toBe("SENT");
    expect(saved.edited).toBe(true);
    await post(`/ai/suggestions/${s.id}/feedback`, {
      feedback: "APPLIED",
    }).expect(409);
    expect((await get(`/ai/conversations/${c.id}`)).body[0].stale).toBe(true);
  });
  it("validates real provider HTTP JSON and rejects invented fact provenance", async () => {
    const c = await conversation();
    await db.message.create({
      data: {
        workspaceId: a.workspaceId,
        conversationId: c.id,
        text: "Вопрос",
        direction: "IN",
        status: "SENT",
      },
    });
    const demo = (
      await post("/ai/analyze", { conversationId: c.id }).expect(201)
    ).body.result;
    const config = app.get(AppConfig).values;
    let content = JSON.stringify(demo);
    let requests = 0;
    const server = createServer(async (req, res) => {
      for await (const _ of req) {
      }
      requests++;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 123, completion_tokens: 45 },
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Fixture port");
    const old = {
      AI_PROVIDER: config.AI_PROVIDER,
      AI_API_KEY: config.AI_API_KEY,
      AI_BASE_URL: config.AI_BASE_URL,
    };
    Object.assign(config, {
      AI_PROVIDER: "openai",
      AI_API_KEY: "fixture-only-key",
      AI_BASE_URL: `http://127.0.0.1:${address.port}`,
    });
    try {
      const good = await post("/ai/analyze", { conversationId: c.id }).expect(
        201,
      );
      expect(good.body.usage[0].inputTokens).toBe(123);
      expect(good.body.usage[0].cost).toBeNull();
      content = "{invalid";
      await post("/ai/analyze", { conversationId: c.id }).expect(502);
      content = JSON.stringify({
        ...demo,
        facts: [
          { text: "Выдумка", status: "CONFIRMED", messageIds: [randomUUID()] },
        ],
      });
      await post("/ai/analyze", { conversationId: c.id }).expect(502);
      expect(requests).toBe(3);
    } finally {
      Object.assign(config, old);
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
  it("blocks Telegram AI before any provider request and purges excluded content and derivatives", async () => {
    const conn = await db.channelConnection.create({
      data: {
        workspaceId: a.workspaceId,
        channel: "TELEGRAM",
        status: "READY",
      },
    });
    const c = await db.conversation.create({
      data: {
        workspaceId: a.workspaceId,
        connectionId: conn.id,
        externalChatId: "42",
        source: "TELEGRAM",
        title: "Реальный источник",
        mode: "CLIENT",
      },
    });
    await db.message.create({
      data: {
        workspaceId: a.workspaceId,
        conversationId: c.id,
        text: "Личная переписка",
        direction: "IN",
        status: "SENT",
      },
    });
    await post("/ai/analyze", { conversationId: c.id }).expect(403);
    expect(
      await db.aiPolicyDecision.count({
        where: { conversationId: c.id, allowed: false },
      }),
    ).toBeGreaterThan(0);
    await patch(`/conversations/${c.id}/policy`, { mode: "EXCLUDED" }).expect(
      200,
    );
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(0);
    await get(`/conversations/${c.id}/messages`).expect(403);
    await post(`/conversations/${c.id}/messages`, {
      key: randomUUID(),
      text: "Запрещено",
    }).expect(403);
    const svc = app.get(MessagesService);
    await svc.ingest({
      eventId: randomUUID(),
      workspaceId: a.workspaceId,
      connectionId: conn.id,
      chatId: "42",
      messageId: "10",
      kind: "message",
      text: "Секрет",
      direction: "IN",
    });
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(0);
    await patch(`/conversations/${c.id}/policy`, { mode: "CLIENT" }).expect(
      200,
    );
    const event = {
      eventId: randomUUID(),
      workspaceId: a.workspaceId,
      connectionId: conn.id,
      chatId: "42",
      messageId: "11",
      kind: "message" as const,
      text: "Разрешённый текст",
      messageKind: "text",
      direction: "IN" as const,
    };
    await svc.ingest(event);
    await svc.ingest({ ...event, eventId: randomUUID() });
    expect(
      (await db.conversation.findUniqueOrThrow({ where: { id: c.id } }))
        .unreadCount,
    ).toBe(1);
    await svc.ingest({
      ...event,
      eventId: randomUUID(),
      kind: "edit",
      text: "Изменение",
    });
    expect(
      (await db.message.findFirstOrThrow({ where: { conversationId: c.id } }))
        .text,
    ).toBe("Изменение");
    await svc.ingest({ ...event, eventId: randomUUID(), kind: "delete" });
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(0);
  });
  it("purges demo analyses and links, retains only command digests to prevent resend", async () => {
    const c = await conversation();
    await db.message.create({
      data: {
        workspaceId: a.workspaceId,
        conversationId: c.id,
        text: "Вопрос",
        direction: "IN",
        status: "SENT",
      },
    });
    await post("/ai/analyze", { conversationId: c.id }).expect(201);
    const payload = { key: randomUUID(), text: "Содержимое на удаление" };
    const cmd = (await post(`/conversations/${c.id}/messages`, payload)).body;
    await del(`/conversations/${c.id}/messages`).expect(200);
    expect(await db.aiAnalysis.count({ where: { conversationId: c.id } })).toBe(
      0,
    );
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(0);
    const repeat = (
      await post(`/conversations/${c.id}/messages`, payload).expect(202)
    ).body;
    expect(repeat.commandId).toBe(cmd.commandId);
    expect(repeat.message).toBeNull();
    await del(`/contacts/${c.contactId}`).expect(200);
    expect(await db.conversation.count({ where: { id: c.id } })).toBe(0);
  });
  it("deduplicates due task notifications and enforces task versions", async () => {
    const task = (
      await post("/tasks", {
        title: "Позвонить клиенту",
        dueAt: new Date(Date.now() - 1000).toISOString(),
        priority: "HIGH",
      }).expect(201)
    ).body;
    await app.get(AutomationService).tick();
    await app.get(AutomationService).tick();
    expect(await db.notification.count({ where: { taskId: task.id } })).toBe(1);
    await patch(`/tasks/${task.id}`, {
      done: true,
      version: task.version,
    }).expect(200);
    await patch(`/tasks/${task.id}`, {
      done: false,
      version: task.version,
    }).expect(409);
    await del(`/tasks/${task.id}`, b).expect(404);
  });
  it("keeps demo deals out of actual sales metrics and seeds only once", async () => {
    await post("/demo/seed").expect(201);
    const n = await db.deal.count({
      where: { workspaceId: a.workspaceId, isDemo: true },
    });
    await post("/demo/seed").expect(201);
    expect(
      await db.deal.count({
        where: { workspaceId: a.workspaceId, isDemo: true },
      }),
    ).toBe(n);
    const stats = (await get("/analytics/overview")).body;
    expect(stats.deals.demo).toBeGreaterThanOrEqual(3);
    expect(stats.deals.total).toBe(
      await db.deal.count({
        where: { workspaceId: a.workspaceId, isDemo: false },
      }),
    );
    expect(stats.ai.sent).toBe(0);
    expect(stats.ai.demoSent).toBeGreaterThanOrEqual(1);
  });
  it("preserves terminal send confirmations, rejects stale attempts and forbids blind retries", async () => {
    const c = await conversation(),
      id = randomUUID(),
      messageId = randomUUID();
    await db.messageCommand.create({
      data: {
        id,
        workspaceId: a.workspaceId,
        conversationId: c.id,
        messageId,
        key: randomUUID(),
        bodyHash: "test-digest",
        status: "SENDING",
        attempts: 1,
      },
    });
    await db.message.create({
      data: {
        id: messageId,
        workspaceId: a.workspaceId,
        conversationId: c.id,
        commandId: id,
        text: "Fixture response",
        direction: "OUT",
        status: "SENDING",
      },
    });
    const service = app.get(MessagesService);
    await service.confirm(a.workspaceId, id, "FAILED", undefined, undefined, 0);
    expect((await get(`/message-commands/${id}`)).body.status).toBe("SENDING");
    await service.confirm(a.workspaceId, id, "FAILED", undefined, undefined, 1);
    await service.confirm(
      a.workspaceId,
      id,
      "SENDING",
      undefined,
      undefined,
      1,
    );
    expect((await get(`/message-commands/${id}`)).body.status).toBe("FAILED");
    await db.messageCommand.update({
      where: { id },
      data: { status: "UNCERTAIN" },
    });
    await post(`/message-commands/${id}/retry`).expect(409);
    await service.confirm(
      a.workspaceId,
      id,
      "SENT",
      "confirmed-source-id",
      undefined,
      1,
    );
    await service.confirm(a.workspaceId, id, "FAILED", undefined, undefined, 1);
    expect((await get(`/message-commands/${id}`)).body.status).toBe("SENT");
  });
  it("protects all internal event URL variants with the gateway token and verifies connection ownership", async () => {
    const conn = await db.channelConnection.create({
      data: {
        workspaceId: a.workspaceId,
        channel: "TELEGRAM",
        status: "READY",
      },
    });
    const event = {
      eventId: randomUUID(),
      workspaceId: a.workspaceId,
      connectionId: conn.id,
      kind: "status",
      state: "RECONNECTING",
    };
    for (const path of [
      "/internal/channel-events",
      "/internal/channel-events/",
    ]) {
      await request(app.getHttpServer())
        .post(path)
        .set("Origin", origin)
        .send(event)
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .set("Authorization", "Bearer invalid")
        .send(event)
        .expect(403);
    }
    const token = "fixture-only-gateway-token-" + randomUUID();
    app.get(AppConfig).values.GATEWAY_TOKEN = token;
    await request(app.getHttpServer())
      .post("/internal/channel-events/")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...event, workspaceId: b.workspaceId })
      .expect(200);
    expect(
      (await db.channelConnection.findUniqueOrThrow({ where: { id: conn.id } }))
        .status,
    ).toBe("READY");
    await request(app.getHttpServer())
      .post("/internal/channel-events/")
      .set("Authorization", `Bearer ${token}`)
      .send(event)
      .expect(200);
    expect(
      (await db.channelConnection.findUniqueOrThrow({ where: { id: conn.id } }))
        .status,
    ).toBe("RECONNECTING");
  });
  it("authenticates realtime subscriptions and disconnects revoked sessions", async () => {
    const sockets: Socket[] = [];
    const connect = async (u: Identity) => {
      const s = io(await app.getUrl(), {
        transports: ["websocket"],
        extraHeaders: { Origin: origin, Cookie: u.cookie.join("; ") },
        reconnection: false,
      });
      sockets.push(s);
      await new Promise<void>((r, j) => {
        s.once("connect", r);
        s.once("connect_error", j);
      });
      return s;
    };
    try {
      const sa = await connect(a),
        sb = await connect(b);
      let receivedA = 0,
        receivedB = 0;
      sa.on("task.created", () => receivedA++);
      sb.on("task.created", () => receivedB++);
      app.get(Events).changed(a.workspaceId, "task.created", randomUUID());
      await waitFor(async () => receivedA === 1);
      expect(receivedB).toBe(0);
      const disconnected = new Promise<void>((r) =>
        sa.once("disconnect", () => r()),
      );
      await post("/auth/logout").expect(204);
      await disconnected;
      expect(sa.connected).toBe(false);
    } finally {
      for (const s of sockets) s.disconnect();
    }
  });
});
