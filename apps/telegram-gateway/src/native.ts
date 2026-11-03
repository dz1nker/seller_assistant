import * as tdl from "tdl";
import { getTdjson, getTdlibInfo } from "prebuilt-tdlib";
export type TdObject = Record<string, unknown>;
export const object = (value: unknown): TdObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as TdObject)
    : {};
export const text = (value: unknown) =>
  typeof value === "string" ? value : "";
export interface NativeClient {
  invoke(query: TdObject): Promise<unknown>;
  on(event: "update" | "error", listener: (value: unknown) => void): void;
  close(): Promise<void>;
  isClosed(): boolean;
}
export interface NativeOptions {
  apiId: number;
  apiHash: string;
  databaseDirectory: string;
  filesDirectory: string;
  databaseEncryptionKey: string;
}
export type NativeFactory = (options: NativeOptions) => NativeClient;
let initialized = false;
export function nativeInfo() {
  if (!initialized) {
    tdl.configure({ tdjson: getTdjson(), verbosityLevel: 0 });
    tdl.setLogMessageCallback(0, () => {});
    initialized = true;
  }
  return getTdlibInfo();
}
export const createNative: NativeFactory = (options) => {
  nativeInfo();
  const client = tdl.createClient({
    ...options,
    tdlibParameters: {
      use_message_database: false,
      use_chat_info_database: true,
      use_file_database: false,
      use_secret_chats: false,
      system_language_code: "ru",
      application_version: "Sales Copilot 0.2",
      device_model: "Sales Copilot",
      system_version: process.platform,
    },
  });
  return {
    invoke: (query) =>
      client.invoke(query as Parameters<typeof client.invoke>[0]),
    on: (event, listener) => {
      if (event === "update") client.on("update", listener);
      else client.on("error", listener);
    },
    close: () => client.close(),
    isClosed: () => client.isClosed(),
  };
};
export function authState(value: unknown) {
  const name = text(object(value)._);
  return (
    (
      {
        authorizationStateWaitPhoneNumber: "WAIT_PHONE",
        authorizationStateWaitCode: "WAIT_CODE",
        authorizationStateWaitPassword: "WAIT_PASSWORD",
        authorizationStateWaitEmailAddress: "WAIT_EMAIL",
        authorizationStateWaitEmailCode: "WAIT_EMAIL_CODE",
        authorizationStateWaitOtherDeviceConfirmation: "WAIT_DEVICE",
        authorizationStateReady: "READY",
        authorizationStateClosed: "CLOSED",
        authorizationStateLoggingOut: "LOGGING_OUT",
        authorizationStateWaitRegistration: "UNSUPPORTED",
      } as Record<string, string>
    )[name] ?? "STARTING"
  );
}
const authErrors: Record<string, string> = {
  API_ID_INVALID:
    "Telegram отклонил API ID/API hash. Проверьте, что оба значения взяты из одного приложения на my.telegram.org/apps.",
  API_HASH_INVALID:
    "Telegram отклонил API hash. Проверьте настройки приложения на my.telegram.org/apps.",
  API_ID_PUBLISHED_FLOOD:
    "Telegram ограничил использование этих API credentials. Используйте собственное приложение с my.telegram.org/apps.",
  PHONE_NUMBER_INVALID:
    "Проверьте номер телефона: международный формат, код страны и номер.",
  PHONE_NUMBER_BANNED:
    "Telegram заблокировал этот номер. Проверьте доступ в официальном приложении Telegram.",
  PHONE_NUMBER_FLOOD:
    "Telegram ограничил попытки входа для этого номера. Подождите перед следующей попыткой.",
  PHONE_PASSWORD_FLOOD:
    "Telegram ограничил попытки ввода пароля. Подождите перед следующей попыткой.",
  PHONE_CODE_INVALID: "Неверный код Telegram",
  PHONE_CODE_EMPTY: "Введите код Telegram.",
  PHONE_CODE_EXPIRED: "Код Telegram истёк. Начните авторизацию заново.",
  PASSWORD_HASH_INVALID: "Неверный пароль двухфакторной защиты",
  EMAIL_ADDRESS_INVALID: "Проверьте адрес email для авторизации.",
  EMAIL_CODE_INVALID: "Неверный код email",
  EMAIL_CODE_EXPIRED: "Код email истёк. Начните авторизацию заново.",
  UPDATE_APP_TO_LOGIN:
    "Telegram требует обновить клиентскую библиотеку TDLib для входа.",
  AUTH_RESTART: "Telegram запросил начать авторизацию заново.",
};
export function telegramErrorInfo(error: unknown) {
  const e = object(error),
    m = text(e.message);
  const code =
    typeof e.code === "number" &&
    Number.isSafeInteger(e.code) &&
    e.code >= 0 &&
    e.code <= 9999
      ? e.code
      : undefined;
  for (const [reason, message] of Object.entries(authErrors))
    if (m.includes(reason)) return { code, reason, message };
  if (m.includes("FLOOD_WAIT") || code === 429)
    return {
      code,
      reason: "FLOOD_WAIT",
      message: "Telegram ограничил частоту запросов. Подождите перед повтором.",
    };
  if (/timeout(?: expired)?|timed out/i.test(m))
    return {
      code,
      reason: "TDLIB_TIMEOUT",
      message:
        "Не удалось дождаться ответа Telegram. Проверьте доступ к Telegram из Docker.",
    };
  if (/client is closed/i.test(m))
    return {
      code,
      reason: "CLIENT_CLOSED",
      message: "Сессия TDLib закрыта. Начните подключение заново.",
    };
  return {
    code,
    reason: "UNCLASSIFIED",
    message:
      "Telegram не выполнил операцию. Проверьте подключение и текущий шаг авторизации.",
  };
}
export function safeError(error: unknown) {
  return telegramErrorInfo(error).message;
}
export function normalizeMessage(value: unknown) {
  const m = object(value),
    content = object(m.content);
  if (m.is_secret || m.self_destruct_type || Number(m.self_destruct_in) > 0)
    return null;
  const isText = content._ === "messageText";
  return {
    id: String(m.id),
    text: isText
      ? text(object(content.text).text).slice(0, 4096)
      : "[Неподдерживаемое вложение]",
    kind: isText ? "text" : "unsupported",
    direction: m.is_outgoing ? ("OUT" as const) : ("IN" as const),
    timestamp: Number(m.date) || Math.floor(Date.now() / 1000),
    ...(object(m.reply_to).message_id
      ? { replyTo: String(object(m.reply_to).message_id) }
      : {}),
  };
}
