import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function signup(page: Page) {
  await page.goto("/register");
  await page.getByLabel("Ваше имя", { exact: true }).fill("Анна");
  await page
    .getByLabel("Название бизнеса", { exact: true })
    .fill("Практика MVP");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${randomUUID()}@example.test`);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("Browser-test-password-123!");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL("/today");
}
test("creates a contact, product and deal, drags a card and persists its history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page);
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Добавить клиента" }).click();
  await page.getByLabel("Имя", { exact: true }).fill("Клиент MVP");
  await page.getByLabel("Заметки").fill("Уточнить задачу");
  await page.getByRole("button", { name: "Сохранить клиента" }).click();
  await expect(page.getByRole("heading", { name: "Клиент MVP" })).toBeVisible();
  await page.goto("/business");
  await page.getByRole("button", { name: "Добавить продукт" }).click();
  await page.getByLabel("Название продукта").fill("Консультация MVP");
  await page.getByLabel("Стоимость", { exact: true }).fill("1500");
  await page
    .getByLabel("Ограничения и кому не подходит")
    .fill("Без обещаний гарантированного результата");
  await page.getByRole("button", { name: "Сохранить продукт" }).click();
  await expect(
    page.getByRole("heading", { name: "Консультация MVP" }),
  ).toBeVisible();
  await page.goto("/pipeline");
  await page.getByRole("button", { name: "Новая сделка" }).click();
  await page.getByLabel("Название сделки").fill("Запрос MVP");
  await page
    .getByLabel("Клиент", { exact: true })
    .selectOption({ label: "Клиент MVP" });
  await page
    .getByLabel("Продукт", { exact: true })
    .selectOption({ label: "Консультация MVP" });
  await page.getByLabel("Сумма (необязательно)").fill("1500");
  await page
    .getByRole("button", { name: "Создать сделку", exact: true })
    .click();
  const first = page.getByRole("region", {
      name: "Этап Новый лид",
      exact: true,
    }),
    target = page.getByRole("region", {
      name: "Этап Выявление потребности",
      exact: true,
    });
  await expect(
    first.getByRole("button", { name: "Запрос MVP", exact: true }),
  ).toBeVisible();
  const handle = page.getByRole("button", { name: "Переместить Запрос MVP" });
  const h = await handle.boundingBox(),
    t = await target.boundingBox();
  if (!h || !t) throw new Error("Kanban geometry unavailable");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 20, h.y + 10, { steps: 3 });
  await page.mouse.move(t.x + t.width / 2, t.y + 100, { steps: 15 });
  await page.mouse.up();
  await expect(
    target.getByRole("button", { name: "Запрос MVP", exact: true }),
  ).toBeVisible();
  await page.reload();
  await target.getByRole("button", { name: "Запрос MVP", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "История этапов" }),
  ).toBeVisible();
  await expect(
    page.getByText("Новый лид → Выявление потребности"),
  ).toBeVisible();
  await page.getByLabel("Приоритет", { exact: true }).selectOption("HIGH");
  await page.getByRole("button", { name: "Сохранить сделку" }).click();
  await expect(target.getByText("Высокий приоритет")).toBeVisible();
  expect(errors).toEqual([]);
});
test("inserts and edits an AI suggestion, sends manually once and retains it after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signup(page);
  await page.goto("/conversations");
  await page.getByRole("button", { name: "Создать демо-данные" }).click();
  await page.getByRole("button").filter({ hasText: "Анна (демо)" }).click();
  await page.getByRole("button", { name: "Анализировать диалог" }).click();
  await expect(page.getByText("Демо-алгоритм · без LLM")).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Текст сообщения" });
  await expect(composer).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Вставить в сообщение" }),
  ).toHaveCount(3);
  await page
    .getByRole("button", { name: "Вставить в сообщение" })
    .first()
    .click();
  await expect(composer).not.toHaveValue("");
  await composer.fill("Ручной ответ после редактирования рекомендации.");
  await page
    .getByRole("button", { name: "Отправить в демо", exact: true })
    .click();
  await expect(page.getByText("Сохранено в демо", { exact: true })).toBeVisible(
    { timeout: 10000 },
  );
  await expect(
    page.getByText("Ручной ответ после редактирования рекомендации.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(composer).toHaveValue("");
  await page.reload();
  await page.getByRole("button").filter({ hasText: "Анна (демо)" }).click();
  await expect(
    page.getByText("Ручной ответ после редактирования рекомендации.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "test-results/mvp-conversation.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("creates a reminder and completes a task on mobile without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await page.getByRole("button", { name: "Новая задача" }).click();
  await page.getByLabel("Что нужно сделать").fill("Ответить клиенту");
  await page
    .getByLabel("Напомнить — время компьютера")
    .fill("2020-01-01T10:00");
  await page
    .getByRole("button", { name: "Создать задачу", exact: true })
    .click();
  await expect(page.getByText("Напоминание: Ответить клиенту")).toBeVisible({
    timeout: 10000,
  });
  await page
    .getByRole("button", { name: "Завершить задачу Ответить клиенту" })
    .click();
  await expect(
    page.getByRole("button", { name: "Завершить задачу Ответить клиенту" }),
  ).toHaveCount(0);
  await page.getByLabel("Показывать завершённые").check();
  await expect(
    page.getByRole("button", { name: "Вернуть задачу Ответить клиенту" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mvp-mobile.png",
    fullPage: true,
  });
});

test("restores realtime after access-cookie expiry without a page reload", async ({
  page,
  context,
}) => {
  await signup(page);
  const refreshed = await page.request.post("/api/auth/refresh", {
    headers: { Origin: "http://localhost:3100" },
  });
  expect(refreshed.status()).toBe(204);
  await context.clearCookies({ name: "sc_access" });
  // Force the old socket to reconnect after revocation; its auth check must refresh the missing cookie.
  await expect
    .poll(
      async () => (await context.cookies()).some((c) => c.name === "sc_access"),
      { timeout: 12000 },
    )
    .toBe(true);
  const response = await page.request.post("/api/tasks", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      title: "Задача после восстановления",
      dueAt: new Date(Date.now() - 1000).toISOString(),
    },
  });
  expect(response.status()).toBe(201);
  await expect(
    page.getByText("Напоминание: Задача после восстановления"),
  ).toBeVisible({ timeout: 12000 });
});
