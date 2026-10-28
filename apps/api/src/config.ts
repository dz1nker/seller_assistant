import { Injectable } from "@nestjs/common";
import { z } from "zod";
const envSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z
    .url()
    .refine((value) => ["redis:", "rediss:"].includes(new URL(value).protocol)),
  WEB_ORIGIN: z
    .url()
    .refine(
      (value) => new URL(value).origin === value,
      "Use an exact origin without trailing slash",
    ),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  REQUESTS_PER_MINUTE: z.coerce.number().int().min(60).max(10000).default(600),
  GATEWAY_URL: z.url().default("http://127.0.0.1:4101"),
  GATEWAY_TOKEN: z.string().optional(),
  SESSION_MASTER_KEY: z.string().optional(),
  AI_PROVIDER: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["disabled", "demo", "openai"]).default("disabled"),
  ),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url().default("https://api.openai.com/v1"),
  ),
  AI_MODEL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).max(100).default("gpt-4.1-mini"),
  ),
  AI_INPUT_COST_PER_MILLION: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  AI_OUTPUT_COST_PER_MILLION: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
});
@Injectable()
export class AppConfig {
  readonly values = envSchema.parse(process.env);
  constructor() {
    if (
      this.values.NODE_ENV === "production" &&
      (this.values.COOKIE_SECURE !== "true" ||
        !this.values.WEB_ORIGIN.startsWith("https://"))
    ) {
      throw new Error(
        "Production requires HTTPS WEB_ORIGIN and COOKIE_SECURE=true",
      );
    }
  }
  get secureCookies() {
    return this.values.COOKIE_SECURE === "true";
  }
}
