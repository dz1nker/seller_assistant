import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  ProxyAgent,
  fetch as providerFetch,
  type Response as ProviderResponse,
} from "undici";
import { z } from "zod";
import type { AiSetupView } from "@sales/shared";
import { AppConfig } from "../config";

export function aiSetup(config: AppConfig): AiSetupView {
  const c = config.values;
  const url = new URL(c.AI_BASE_URL);
  // No credentials, query parameters, key fragments or proxy address in browser responses.
  return {
    provider: c.AI_PROVIDER,
    configured:
      c.AI_PROVIDER === "demo" ||
      (c.AI_PROVIDER === "openai" && Boolean(c.AI_API_KEY?.trim())),
    model: c.AI_MODEL,
    endpoint: url.origin + url.pathname.replace(/\/$/, ""),
    proxyConfigured: Boolean(c.AI_PROXY_URL),
    revision: aiProviderFingerprint(config),
  };
}
export function aiProviderFingerprint(config: AppConfig) {
  const c = config.values,
    url = new URL(c.AI_BASE_URL);
  return createHash("sha256")
    .update(
      JSON.stringify([
        c.AI_PROVIDER,
        url.origin + url.pathname.replace(/\/$/, ""),
        c.AI_MODEL,
      ]),
    )
    .digest("hex");
}

export function aiTransportMessage(error: unknown): string {
  let current = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    const e = current as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (e.name === "TimeoutError")
      return "ИИ не ответил за 25 секунд. Проверьте соединение и настройки прокси ИИ.";
    if (e.code === "UND_ERR_CONNECT_TIMEOUT")
      return "Истекло время подключения к серверу ИИ или его прокси. Проверьте AI_PROXY_URL.";
    if (
      typeof e.message === "string" &&
      /proxy.*407|407.*proxy|proxy authentication required/i.test(e.message)
    )
      return "HTTP-прокси для ИИ требует логин и пароль. Проверьте AI_PROXY_URL.";
    if (typeof e.message === "string" && /redirect/i.test(e.message))
      return "ИИ-провайдер вернул перенаправление. Проверьте точный AI_BASE_URL: передача контекста другому адресу запрещена.";
    if (["ENOTFOUND", "EAI_AGAIN"].includes(String(e.code)))
      return "Не удалось найти сервер ИИ или его прокси. Проверьте адреса в настройках сервера.";
    if (
      [
        "ECONNREFUSED",
        "ECONNRESET",
        "UND_ERR_SOCKET",
        "EHOSTUNREACH",
        "ENETUNREACH",
      ].includes(String(e.code))
    )
      return "Не удалось установить соединение с ИИ или его прокси. Проверьте AI_PROXY_URL.";
    if (
      [
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "CERT_HAS_EXPIRED",
      ].includes(String(e.code))
    )
      return "Не удалось проверить TLS-сертификат сервера ИИ или прокси. Проверьте доверенные сертификаты сервера.";
    current = e.cause;
  }
  return "Нет связи с ИИ-провайдером. Проверьте подключение и AI_PROXY_URL.";
}

const providerReply = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string() }) }))
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});
@Injectable()
export class AiProvider implements OnModuleDestroy {
  private proxies = new Map<string, ProxyAgent>();
  constructor(@Inject(AppConfig) private config: AppConfig) {}
  async onModuleDestroy() {
    await Promise.allSettled(
      [...this.proxies.values()].map((p) => p.destroy()),
    );
  }
  async complete(body: object) {
    const c = this.config.values;
    if (c.AI_PROVIDER !== "openai" || !c.AI_API_KEY?.trim())
      throw new ServiceUnavailableException(
        "Добавьте AI_PROVIDER=openai и AI_API_KEY в локальный .env и пересоздайте API.",
      );
    let dispatcher: ProxyAgent | undefined;
    if (c.AI_PROXY_URL) {
      dispatcher = this.proxies.get(c.AI_PROXY_URL);
      if (!dispatcher) {
        const proxy = new URL(c.AI_PROXY_URL);
        const token =
          proxy.username || proxy.password
            ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`
            : undefined;
        proxy.username = "";
        proxy.password = "";
        dispatcher = new ProxyAgent({
          uri: proxy.toString(),
          ...(token ? { token } : {}),
        });
        this.proxies.set(c.AI_PROXY_URL, dispatcher);
      }
    }
    let response: ProviderResponse;
    try {
      response = await providerFetch(
        aiSetup(this.config).endpoint + "/chat/completions",
        {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${c.AI_API_KEY}`,
          },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({ model: c.AI_MODEL, ...body }),
          ...(dispatcher ? { dispatcher } : {}),
        },
      );
    } catch (e) {
      throw new BadGatewayException(aiTransportMessage(e));
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const messages: Record<number, string> = {
        401: "ИИ-провайдер отклонил API-ключ. Проверьте AI_API_KEY.",
        403: "ИИ-провайдер запретил доступ. Проверьте права проекта и доступность сервиса для вашего подключения.",
        404: "ИИ-провайдер не нашёл модель или API. Проверьте AI_MODEL и AI_BASE_URL.",
        407: "HTTP-прокси для ИИ требует авторизацию. Проверьте логин и пароль в AI_PROXY_URL.",
        429: "ИИ-провайдер сообщил об исчерпанной квоте или лимите запросов. Проверьте API-баланс и лимиты проекта.",
      };
      throw new BadGatewayException(
        messages[response.status] ??
          "ИИ-провайдер отклонил запрос. Проверьте поддержку Structured Outputs и состояние сервиса.",
      );
    }
    try {
      return providerReply.parse(await response.json());
    } catch {
      throw new BadGatewayException(
        "ИИ-провайдер вернул некорректный ответ. Результат не сохранён.",
      );
    }
  }
  async test() {
    const raw = await this.complete({
      messages: [
        {
          role: "user",
          content:
            'Connection test. Return {"ok":true}. No conversation data is included.',
        },
      ],
      max_completion_tokens: 64,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "connection_test",
          strict: true,
          schema: {
            type: "object",
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    });
    try {
      z.object({ ok: z.literal(true) })
        .strict()
        .parse(JSON.parse(raw.choices[0]!.message.content));
    } catch {
      throw new BadGatewayException(
        "Провайдер доступен, но не вернул ожидаемый Structured Outputs JSON.",
      );
    }
    return { ok: true, ...aiSetup(this.config) };
  }
}
