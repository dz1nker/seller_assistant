import { config } from "dotenv";
import path from "node:path";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { idSchema } from "@sales/shared";
import { TelegramGateway, GatewayError } from "./gateway";
import { nativeInfo } from "./native";
config({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });
config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
process.umask(0o077);
const env = z
  .object({
    GATEWAY_TOKEN: z.string().min(32),
    SESSION_MASTER_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(4101),
    GATEWAY_HOST: z.string().default("127.0.0.1"),
    TELEGRAM_API_ID: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().int().positive().optional(),
    ),
    TELEGRAM_API_HASH: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z
        .string()
        .regex(/^[a-f0-9]{32}$/i)
        .optional(),
    ),
    GATEWAY_DATA_DIR: z
      .string()
      .default(path.resolve(process.cwd(), "../../.local/telegram")),
    API_INTERNAL_URL: z.url().default("http://127.0.0.1:4000"),
  })
  .parse(process.env);
const info = nativeInfo();
const gateway = new TelegramGateway({
  root: env.GATEWAY_DATA_DIR,
  masterKey: env.SESSION_MASTER_KEY,
  apiId: env.TELEGRAM_API_ID,
  apiHash: env.TELEGRAM_API_HASH,
  callbackUrl:
    env.API_INTERNAL_URL.replace(/\/$/, "") + "/internal/channel-events",
  token: env.GATEWAY_TOKEN,
});
const sendSchema = z
  .object({
    workspaceId: idSchema,
    connectionId: idSchema,
    chatId: z.string().regex(/^-?\d+$/),
    commandId: idSchema,
    attempt: z.number().int().nonnegative(),
    resume: z.boolean(),
    text: z.string().min(1).max(4096),
    replyTo: z
      .string()
      .regex(/^-?\d+$/)
      .optional(),
  })
  .strict();
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const reply = (data: unknown) => res.end(JSON.stringify(data));
  try {
    const url = new URL(req.url ?? "/", "http://gateway");
    if (req.method === "GET" && url.pathname === "/health/ready")
      return reply({ status: "ok", tdlib: info.version });
    const supplied = Buffer.from(
      typeof req.headers.authorization === "string"
        ? req.headers.authorization
        : "",
    );
    const expected = Buffer.from(`Bearer ${env.GATEWAY_TOKEN}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new GatewayError(403, "Доступ запрещён");
    if (req.method === "GET" && url.pathname === "/configuration")
      return reply({
        configured: gateway.configured,
        missing: [
          ...(!env.TELEGRAM_API_ID ? ["TELEGRAM_API_ID"] : []),
          ...(!env.TELEGRAM_API_HASH ? ["TELEGRAM_API_HASH"] : []),
        ],
        tdlib: info.version,
      });
    const match = /^\/sessions\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(
      url.pathname,
    );
    if (!match) throw new GatewayError(404, "Не найдено");
    const ws = idSchema.parse(match[1]),
      id = idSchema.parse(match[2]),
      action = match[3] ?? "";
    let body: unknown = {};
    if (req.method === "POST") {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        const b = Buffer.from(chunk);
        size += b.length;
        if (size > 32768) throw new GatewayError(413, "Запрос слишком большой");
        chunks.push(b);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    }
    if (req.method === "POST" && action === "") {
      z.object({}).strict().parse(body);
      return reply(await gateway.connect(ws, id));
    }
    if (req.method === "DELETE" && action === "")
      return reply(await gateway.disconnect(ws, id));
    if (req.method === "GET" && action === "status")
      return reply(gateway.status(ws, id));
    if (req.method === "POST" && action === "auth") {
      const d = z
        .object({
          kind: z.enum(["phone", "code", "password", "email", "emailCode"]),
          value: z.string().min(1).max(256),
        })
        .strict()
        .parse(body);
      return reply(await gateway.auth(ws, id, d.kind, d.value));
    }
    if (req.method === "POST" && action === "allowed") {
      const d = z
        .object({ chatIds: z.array(z.string().regex(/^-?\d+$/)).max(1000) })
        .strict()
        .parse(body);
      return reply(gateway.allow(ws, id, d.chatIds));
    }
    if (req.method === "GET" && action === "chats")
      return reply(await gateway.chats(ws, id));
    if (req.method === "GET" && action === "history")
      return reply(
        await gateway.history(
          ws,
          id,
          z
            .string()
            .regex(/^-?\d+$/)
            .parse(url.searchParams.get("chatId")),
          url.searchParams.get("cursor") ?? undefined,
        ),
      );
    if (req.method === "POST" && action === "send") {
      const d = sendSchema.parse(body);
      if (d.workspaceId !== ws || d.connectionId !== id)
        throw new GatewayError(403, "Неверная область команды");
      return reply(await gateway.send(d));
    }
    if (req.method === "GET" && action.startsWith("commands/"))
      return reply(gateway.receipt(ws, id, idSchema.parse(action.slice(9))));
    throw new GatewayError(404, "Не найдено");
  } catch (e) {
    res.statusCode =
      e instanceof GatewayError
        ? e.status
        : e instanceof z.ZodError || e instanceof SyntaxError
          ? 400
          : 503;
    reply({
      message:
        e instanceof GatewayError
          ? e.message
          : res.statusCode === 400
            ? "Проверьте параметры запроса"
            : "Telegram Gateway временно недоступен",
    });
  }
});
async function main() {
  await gateway.start();
  server.listen(env.GATEWAY_PORT, env.GATEWAY_HOST, () =>
    console.log("Telegram Gateway ready; TDLib loaded."),
  );
}
async function shutdown() {
  server.close();
  await gateway.close();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
main().catch(() => {
  console.error(
    "Telegram Gateway startup failed. Check native library and environment configuration.",
  );
  process.exitCode = 1;
});
