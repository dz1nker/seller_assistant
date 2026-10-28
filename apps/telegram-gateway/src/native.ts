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
export function safeError(error: unknown) {
  const e = object(error),
    m = text(e.message);
  if (m.includes("PHONE_CODE_INVALID")) return "Неверный код Telegram";
  if (m.includes("PASSWORD_HASH_INVALID"))
    return "Неверный пароль двухфакторной защиты";
  if (m.includes("EMAIL_CODE_INVALID")) return "Неверный код email";
  if (m.includes("PHONE_NUMBER_INVALID")) return "Проверьте номер телефона";
  if (m.includes("FLOOD_WAIT"))
    return "Telegram ограничил частоту запросов. Подождите перед повтором.";
  return "Telegram не выполнил операцию. Проверьте подключение и текущий шаг авторизации.";
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
