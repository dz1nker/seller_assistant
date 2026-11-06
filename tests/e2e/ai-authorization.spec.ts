import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@sales/database";
import { PrismaPg } from "@prisma/adapter-pg";

test("reviews a synthetic Telegram authorization, generates suggestions manually and revokes access", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("Ваше имя", { exact: true }).fill("Тест ИИ");
  await page
    .getByLabel("Название бизнеса", { exact: true })
    .fill("Синтетическая проверка ИИ");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("Synthetic-browser-password-123!");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL("/today");
  const identity = await (await page.request.get("/api/auth/me")).json();
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Dedicated E2E database required");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  const c = await db.conversation.create({
    data: {
      workspaceId: identity.workspaceId,
      source: "TELEGRAM",
      title: "Синтетический клиент ИИ",
      mode: "CLIENT",
      messages: {
        create: {
          text: "Синтетический вопрос об услуге",
          direction: "IN",
          status: "SENT",
        },
      },
    },
  });
  // Browser-only protocol fixture. Server policy/transport is exercised separately
  // against PostgreSQL, Redis and a real local HTTP provider in integration tests.
  const setup = {
    provider: "openai",
    configured: true,
    model: "browser-fixture-model",
    endpoint: "https://provider.example.test/v1",
    proxyConfigured: true,
    revision: "a".repeat(64),
  };
  let allowed = false,
    analysis: object | null = null,
    posted: Record<string, unknown> | undefined,
    analyzeCalls = 0,
    sendCalls = 0;
  const authorization = {
    id: randomUUID(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    providerEndpoint: setup.endpoint,
    providerModel: setup.model,
  };
  const access = () => ({
    allowed,
    reason: allowed
      ? "Документированное разрешение зарегистрировано"
      : "Требуется отдельная проверка политики источника и прав",
    provider: setup,
    authorization: allowed ? authorization : null,
  });
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      req.url().endsWith(`/api/conversations/${c.id}/messages`)
    )
      sendCalls++;
  });
  await page.route(`**/api/conversations/${c.id}/sync`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"cursor":null}',
    }),
  );
  await page.route("**/api/ai/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let body: unknown;
    if (path.endsWith("/setup")) body = setup;
    else if (path.endsWith("/test")) body = { ok: true, ...setup };
    else if (path.endsWith("/access")) body = access();
    else if (path.endsWith("/authorization")) {
      if (method === "POST") {
        posted = route.request().postDataJSON();
        allowed = true;
      } else {
        allowed = false;
        analysis = null;
      }
      body = access();
    } else if (path.endsWith("/analyze")) {
      analyzeCalls++;
      analysis = {
        id: randomUUID(),
        contextVersion: "fixture",
        provider: setup.model,
        promptVersion: "fixture",
        createdAt: new Date().toISOString(),
        stale: false,
        result: {
          summary: "Синтетический разбор запроса клиента",
          facts: [],
          needs: [],
          objections: [],
          missing_information: [],
          intent: "unknown",
          stage_suggestion: "Выявление потребности",
          recommended_action: "clarify_need",
          reasoning_summary: "Тестовые данные",
          responses: ["warm", "confident", "short"].map((tone) => ({
            tone,
            text: `Синтетическая рекомендация ${tone}`,
          })),
        },
        suggestions: ["warm", "confident", "short"].map((tone) => ({
          id: randomUUID(),
          tone,
          text: `Синтетическая рекомендация ${tone}`,
          feedback: "GENERATED",
          edited: false,
        })),
        usage: [],
      };
      body = analysis;
    } else if (path.includes("/suggestions/")) body = { feedback: "APPLIED" };
    else body = analysis ? [analysis] : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  try {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "ИИ-помощник", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(setup.model, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Проверить ИИ", exact: true })
      .click();
    await expect(
      page.getByText(
        "Провайдер ответил. Структурированные ответы поддерживаются.",
      ),
    ).toBeVisible();
    expect(analyzeCalls).toBe(0);
    await page.goto(`/conversations?id=${c.id}`);
    await page.getByRole("button", { name: "Оформить разрешение" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Разрешение на ИИ-анализ",
    });
    await expect(
      dialog.getByText(setup.endpoint, { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Сохранить разрешение" }),
    ).toBeDisabled();
    await dialog
      .getByLabel("Политика источника / документ, разрешающий обработку")
      .fill("fixture://synthetic-policy-reference");
    await dialog
      .getByLabel("Версия или дата проверенной политики")
      .fill("synthetic-test-v1");
    await dialog
      .getByLabel("Ссылка или номер подтверждения прав / согласия")
      .fill("fixture://synthetic-consent-reference");
    await dialog
      .getByLabel("Что проверено и почему обработка разрешена")
      .fill(
        "Синтетическая проверка интерфейса; это не разрешение на обработку реальных данных.",
      );
    await dialog.getByRole("checkbox").first().check();
    await dialog.getByRole("checkbox").last().check();
    expect(analyzeCalls).toBe(0);
    await dialog.getByRole("button", { name: "Сохранить разрешение" }).click();
    await expect(dialog).not.toBeVisible();
    expect(posted?.providerRevision).toBe(setup.revision);
    expect(posted?.policyReviewed).toBe(true);
    expect(posted?.rightsVerified).toBe(true);
    expect(analyzeCalls).toBe(0);
    await page.getByRole("button", { name: "Анализировать диалог" }).click();
    await expect(
      page.getByText("Синтетический разбор запроса клиента"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Вставить в сообщение" }),
    ).toHaveCount(3);
    await page
      .getByRole("button", { name: "Вставить в сообщение" })
      .first()
      .click();
    await expect(
      page.getByRole("textbox", { name: "Текст сообщения" }),
    ).toHaveValue("Синтетическая рекомендация warm");
    expect(sendCalls).toBe(0);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Отозвать", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Оформить разрешение" }),
    ).toBeVisible();
    await expect(
      page.getByText("Синтетический разбор запроса клиента"),
    ).not.toBeVisible();
    expect(sendCalls).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await db.workspace.delete({ where: { id: identity.workspaceId } });
    await db.user.delete({ where: { id: identity.id } });
    await db.$disconnect();
  }
});
