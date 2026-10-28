"use client";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Send, RefreshCw, Plug, Shield } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@sales/ui";
import type { ConnectionView } from "@sales/shared";
import { api } from "../lib/api";
import { useAction, useData } from "../lib/crm";
import { useUser } from "../lib/queries";
import { FormError } from "./editor";
const labels: Record<string, string> = {
  STARTING: "Подготовка",
  WAIT_PHONE: "Номер телефона",
  WAIT_CODE: "Код Telegram",
  WAIT_PASSWORD: "Двухфакторный пароль",
  WAIT_EMAIL: "Email",
  WAIT_EMAIL_CODE: "Код из email",
  WAIT_DEVICE: "Подтвердите на другом устройстве",
  READY: "Подключён",
  RECONNECTING: "Восстанавливаем соединение",
  ERROR: "Ошибка",
  UNSUPPORTED: "Неподдерживаемая авторизация",
  CLOSED: "Соединение закрыто",
  DISCONNECTED: "Отключён",
  UNAVAILABLE: "Gateway недоступен",
  LOGGING_OUT: "Отключаем",
};
export function TelegramConnections() {
  const setup = useData<{
    configured: boolean;
    missing?: string[];
    reason?: string;
    tdlib?: string;
  }>("connections", "/connections/setup");
  const connections = useQuery({
    queryKey: ["connections", "/connections"],
    queryFn: () => api<ConnectionView[]>("/connections"),
    refetchInterval: 5000,
  });
  const user = useUser(),
    action = useAction(),
    client = useQueryClient();
  const canEdit = ["OWNER", "ADMIN"].includes(user.data?.role ?? "");
  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Send className="size-5 text-primary" />
        <h2 className="font-semibold">Личные аккаунты Telegram</h2>
        {canEdit && (
          <Button
            className="ml-auto"
            disabled={!setup.data?.configured || action.isPending}
            onClick={() =>
              action.mutate(
                { path: "/connections/telegram/start", body: {} },
                {
                  onSuccess: () =>
                    void client.invalidateQueries({
                      queryKey: ["connections"],
                    }),
                },
              )
            }
          >
            <Plug className="size-4" />
            Подключить Telegram
          </Button>
        )}
      </div>
      <p className="mb-5 text-sm leading-7 text-muted-foreground">
        Подключение личного аккаунта. Переписки попадут в CRM только после
        вашего выбора. Автоматическая отправка сообщений ИИ выключена.
      </p>
      <FormError error={action.error} />
      {!setup.data?.configured && (
        <div className="mb-5 rounded-xl bg-amber-500/10 p-4 text-sm leading-7">
          <p className="font-semibold">Требуется настройка сервера</p>
          <p>
            {setup.data?.missing?.length
              ? `Добавьте ${setup.data.missing.join(" и ")} в локальный .env и перезапустите приложение.`
              : (setup.data?.reason ??
                "Проверяем доступность Telegram Gateway…")}
          </p>
          <p className="mt-2 text-xs">
            API ID и API hash получают на my.telegram.org. Не присылайте ключи,
            коды или пароли в чат разработки.
          </p>
        </div>
      )}
      {connections.error && <FormError error={connections.error} />}
      <div className="space-y-4">
        {connections.data?.map((c) => (
          <TelegramAccount key={c.id} connection={c} canEdit={canEdit} />
        ))}
      </div>
      {connections.data?.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Аккаунты пока не подключены.
        </p>
      )}
      <div className="mt-5 flex items-start gap-2 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">
        <Shield className="mt-1 size-4 shrink-0 text-primary" />
        Выбор CLIENT разрешает CRM-синхронизацию, но не AI-обработку
        Telegram-переписки. Секретные и защищённые диалоги не импортируются.
      </div>
    </Card>
  );
}
function TelegramAccount({
  connection: c,
  canEdit,
}: {
  connection: ConnectionView;
  canEdit: boolean;
}) {
  const action = useAction(),
    client = useQueryClient(),
    [value, setValue] = useState("");
  const state = c.auth?.state ?? c.status;
  const kind = (
    {
      WAIT_PHONE: "phone",
      WAIT_CODE: "code",
      WAIT_PASSWORD: "password",
      WAIT_EMAIL: "email",
      WAIT_EMAIL_CODE: "emailCode",
    } as Record<string, string>
  )[state];
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">
          {c.label}
          {c.accountId ? ` · ${c.accountId}` : ""}
        </h3>
        <Badge>{labels[state] ?? state}</Badge>
        {canEdit && c.status !== "DISCONNECTED" && (
          <Button
            variant="ghost"
            className="ml-auto min-h-8 text-xs"
            onClick={() => {
              if (
                confirm(
                  "Отключить Telegram и очистить сохранённые сообщения этого подключения?",
                )
              )
                action.mutate(
                  { path: `/connections/${c.id}`, method: "DELETE" },
                  {
                    onSuccess: () =>
                      void client.invalidateQueries({
                        queryKey: ["connections"],
                      }),
                  },
                );
            }}
          >
            Отключить
          </Button>
        )}
      </div>
      {kind && canEdit && (
        <form
          className="mt-5 flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(
              {
                path: "/connections/telegram/auth-step",
                body: { connectionId: c.id, kind, value },
              },
              {
                onSettled: () => {
                  setValue("");
                  void client.invalidateQueries({ queryKey: ["connections"] });
                },
              },
            );
          }}
        >
          <div className="flex-1">
            <Field id={`tg-${c.id}`} label={labels[state]!}>
              <Input
                id={`tg-${c.id}`}
                value={value}
                required
                maxLength={256}
                autoComplete="off"
                type={
                  kind === "password"
                    ? "password"
                    : kind === "phone"
                      ? "tel"
                      : kind === "email"
                        ? "email"
                        : "text"
                }
                placeholder={kind === "phone" ? "+375…" : undefined}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
          </div>
          <Button disabled={action.isPending} type="submit">
            Продолжить
          </Button>
        </form>
      )}
      {state === "WAIT_DEVICE" && (
        <p className="mt-4 text-sm leading-7">
          Подтвердите вход в официальном Telegram на другом устройстве.
          {c.auth?.link && /^tg:\/\/login\?token=/.test(c.auth.link) && (
            <span className="mt-2 block break-all text-xs text-muted-foreground">
              {c.auth.link}
            </span>
          )}
        </p>
      )}
      {state === "READY" && canEdit && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={action.isPending}
          onClick={() =>
            action.mutate(
              { path: `/connections/${c.id}/sync` },
              {
                onSuccess: () =>
                  void client.invalidateQueries({
                    queryKey: ["conversations"],
                  }),
              },
            )
          }
        >
          <RefreshCw className="size-4" />
          Получить список диалогов
        </Button>
      )}
      {c.auth?.error && (
        <p className="mt-3 text-sm text-destructive">{c.auth.error}</p>
      )}
      <FormError error={action.error} />
    </section>
  );
}
