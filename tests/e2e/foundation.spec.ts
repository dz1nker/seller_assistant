import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
const password = "Browser-test-password-123!";
async function signup(page: Page) {
  const email = `${randomUUID()}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Ваше имя", { exact: true }).fill("Анна");
  await page
    .getByLabel("Название бизнеса", { exact: true })
    .fill("Студия Анны");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page).toHaveURL("/today");
  await expect(
    page.getByRole("heading", { name: "Сегодня", exact: true }),
  ).toBeVisible();
  return email;
}
test("registers, saves business, reloads, navigates, logs out and back in", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = await signup(page);
  const cookies = await context.cookies();
  expect(
    cookies.filter((cookie) => cookie.name.startsWith("sc_")),
  ).toHaveLength(2);
  expect(
    cookies
      .filter((cookie) => cookie.name.startsWith("sc_"))
      .every((cookie) => cookie.httpOnly && cookie.sameSite === "Strict"),
  ).toBe(true);
  await page.getByRole("link", { name: "Мой бизнес", exact: true }).click();
  await page
    .getByLabel("Название бизнеса", { exact: true })
    .fill("Практика Анны");
  await page
    .getByLabel("О чём ваш бизнес")
    .fill("Помогаю экспертам развивать частную практику.");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("status")).toHaveText("Изменения сохранены");
  await page.reload();
  await expect(
    page.getByLabel("Название бизнеса", { exact: true }),
  ).toHaveValue("Практика Анны");
  await expect(page.getByLabel("О чём ваш бизнес")).toHaveValue(
    "Помогаю экспертам развивать частную практику.",
  );
  await context.clearCookies({ name: "sc_access" });
  await page.reload();
  await expect(
    page.getByLabel("Название бизнеса", { exact: true }),
  ).toHaveValue("Практика Анны");
  const rotated = await context.cookies();
  expect(
    rotated.find((cookie) => cookie.name === "sc_refresh")?.value,
  ).not.toBe(cookies.find((cookie) => cookie.name === "sc_refresh")?.value);
  await page.getByRole("link", { name: "Воронка", exact: true }).click();
  await expect(page.getByText("Новый лид", { exact: true })).toBeVisible();
  await expect(page.getByText("Проиграно", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Диалоги", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Выберите диалог" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Настройки", exact: true }).click();
  await expect(page.getByText("Анна (вы)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Выйти из аккаунта" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/business");
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL("/today");
  await expect(
    page.getByText("Практика Анны", { exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("isolates businesses across independent browser sessions", async ({
  page,
  browser,
}) => {
  await signup(page);
  await page.goto("/business");
  await page
    .getByLabel("Название бизнеса", { exact: true })
    .fill("Приватный бизнес A");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("status")).toHaveText("Изменения сохранены");
  const second = await browser.newContext();
  try {
    const other = await second.newPage();
    await signup(other);
    await other.goto("/business");
    await expect(
      other.getByLabel("Название бизнеса", { exact: true }),
    ).toHaveValue("Студия Анны");
    await expect(other.getByText("Приватный бизнес A")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByLabel("Название бизнеса", { exact: true }),
    ).toHaveValue("Приватный бизнес A");
  } finally {
    await second.close();
  }
});
test("shows validation and failed login errors", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByText("Укажите имя", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Минимум 12 символов", { exact: true }),
  ).toBeVisible();
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`missing-${randomUUID()}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Неверный email или пароль" }),
  ).toBeVisible();
});
test("recovers from a workspace request failure using the retry action", async ({
  page,
}) => {
  await signup(page);
  await page.route("**/api/workspaces/current", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Временный сбой сервиса" }),
    }),
  );
  await page.goto("/business");
  await expect(
    page.getByRole("alert").filter({ hasText: "Временный сбой сервиса" }),
  ).toBeVisible();
  await page.unroute("**/api/workspaces/current");
  await page.getByRole("button", { name: "Попробовать снова" }).click();
  await expect(
    page.getByLabel("Название бизнеса", { exact: true }),
  ).toHaveValue("Студия Анны");
});
test("supports mobile navigation and a persistent dark theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page.getByRole("link", { name: "Мой бизнес", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Мой бизнес", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
