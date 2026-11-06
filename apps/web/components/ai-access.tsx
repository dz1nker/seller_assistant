"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Field, Input, Textarea } from "@sales/ui";
import { Sparkles, ShieldCheck } from "lucide-react";
import type {
  AiAccessView,
  AiAuthorizationInput,
  AiSetupView,
} from "@sales/shared";
import { useAction, useData } from "../lib/crm";
import { useUser } from "../lib/queries";
import { Editor, FormError, selectClass } from "./editor";

export function AiSettings() {
  const setup = useData<AiSetupView>("ai-setup", "/ai/setup");
  const user = useUser(),
    action = useAction(),
    client = useQueryClient();
  const [tested, setTested] = useState(false);
  const canEdit = ["OWNER", "ADMIN"].includes(user.data?.role ?? "");
  const s = setup.data;
  return (
    <Card>
      <div className="mb-4 flex items-center gap-3">
        <Sparkles className="size-5 text-primary" />
        <h2 className="font-semibold">ИИ-помощник</h2>
      </div>
      {setup.isPending && (
        <p className="text-sm text-muted-foreground">Проверяем настройки ИИ…</p>
      )}
      <FormError error={setup.error} />
      {s && (
        <>
          <Badge>
            {s.provider === "openai"
              ? s.configured
                ? "API-ключ настроен"
                : "Требуется API-ключ"
              : s.provider === "demo"
                ? "Демо-алгоритм · без LLM"
                : "ИИ выключен"}
          </Badge>
          {s.provider === "openai" && (
            <dl className="mt-4 space-y-2 break-all text-sm">
              <div>
                <dt className="text-muted-foreground">Получатель данных</dt>
                <dd>{s.endpoint}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Модель</dt>
                <dd>{s.model}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Прокси ИИ</dt>
                <dd>{s.proxyConfigured ? "Настроен" : "Прямое соединение"}</dd>
              </div>
            </dl>
          )}
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Для настоящих рекомендаций добавьте в локальный .env
            AI_PROVIDER=openai, AI_API_KEY, AI_BASE_URL и AI_MODEL, затем
            пересоздайте API. При необходимости укажите HTTP-прокси в
            AI_PROXY_URL. Ключ хранится на сервере.
          </p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Telegram-анализ включается отдельно в выбранном диалоге после
            проверки политики источника и прав на обработку.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canEdit && (
              <Button
                disabled={
                  !s.configured || s.provider !== "openai" || action.isPending
                }
                onClick={() => {
                  setTested(false);
                  action.mutate(
                    { path: "/ai/test", body: {} },
                    {
                      onSuccess: (data) => {
                        client.setQueryData(["ai-setup", "/ai/setup"], data);
                        setTested(true);
                      },
                    },
                  );
                }}
              >
                {action.isPending ? "Проверяем…" : "Проверить ИИ"}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={setup.isFetching}
              onClick={() => {
                setTested(false);
                void setup.refetch();
              }}
            >
              Обновить настройки
            </Button>
          </div>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Проверка отправляет короткий служебный запрос без переписки.
            Провайдер может учитывать его в расходе API.
          </p>
          {tested && (
            <p role="status" className="mt-3 text-sm text-emerald-600">
              Провайдер ответил. Структурированные ответы поддерживаются.
            </p>
          )}
          <FormError error={action.error} />
        </>
      )}
    </Card>
  );
}

export function AiAuthorizationControl({
  conversationId,
  title,
  access,
}: {
  conversationId: string;
  title: string;
  access?: AiAccessView;
}) {
  const user = useUser(),
    action = useAction(),
    client = useQueryClient();
  const [open, setOpen] = useState(false);
  const canEdit = ["OWNER", "ADMIN"].includes(user.data?.role ?? "");
  const refresh = (data: unknown) => {
    client.setQueryData(["ai-access", conversationId], data);
    client.removeQueries({
      queryKey: ["analysis", `/ai/conversations/${conversationId}`],
    });
    void client.invalidateQueries({ queryKey: ["conversations"] });
  };
  if (!access) return null;
  return (
    <div className="mb-4 rounded-xl border border-border p-3 text-sm leading-6">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />
        <p>{access.reason}</p>
      </div>
      {access.allowed && access.authorization && (
        <p className="mt-2 text-xs text-muted-foreground">
          Разрешение до{" "}
          {new Date(access.authorization.expiresAt).toLocaleDateString("ru")}.
          Получатель: {access.authorization.providerEndpoint}; модель{" "}
          {access.authorization.providerModel}.
        </p>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="text-xs"
            disabled={
              !access.provider.configured ||
              access.provider.provider !== "openai" ||
              action.isPending
            }
            onClick={() => setOpen(true)}
          >
            {access.allowed
              ? "Проверить и обновить разрешение"
              : "Оформить разрешение"}
          </Button>
          {access.authorization && (
            <Button
              variant="ghost"
              className="text-xs"
              disabled={action.isPending}
              onClick={() => {
                if (
                  confirm(
                    "Отозвать разрешение ИИ и удалить сохранённые рекомендации этого диалога?",
                  )
                )
                  action.mutate(
                    {
                      path: `/ai/conversations/${conversationId}/authorization`,
                      method: "DELETE",
                    },
                    { onSuccess: refresh },
                  );
              }}
            >
              Отозвать
            </Button>
          )}
        </div>
      )}
      {!access.provider.configured || access.provider.provider !== "openai" ? (
        <p className="mt-2 text-xs">
          <a className="text-primary underline" href="/settings">
            Подключите ИИ-провайдера в настройках
          </a>
        </p>
      ) : null}
      <FormError error={action.error} />
      {open && (
        <AiAuthorizationForm
          conversationId={conversationId}
          title={title}
          provider={access.provider}
          close={() => setOpen(false)}
          saved={(data) => {
            refresh(data);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AiAuthorizationForm({
  conversationId,
  title,
  provider,
  close,
  saved,
}: {
  conversationId: string;
  title: string;
  provider: AiSetupView;
  close: () => void;
  saved: (data: unknown) => void;
}) {
  const action = useAction();
  const [data, setData] = useState({
    sourcePolicyReference: "",
    sourcePolicyVersion: "",
    rightsBasis: "DOCUMENTED_CONSENT" as AiAuthorizationInput["rightsBasis"],
    rightsReference: "",
    reviewNotes: "",
    expiresAt: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    policyReviewed: false,
    rightsVerified: false,
  });
  return (
    <Editor title="Разрешение на ИИ-анализ" close={close} wide>
      <p className="mb-4 text-sm leading-7">
        Диалог: <strong>{title}</strong>. Получатель:{" "}
        <strong>{provider.endpoint}</strong>, модель{" "}
        <strong>{provider.model}</strong>. В контекст входят сообщения этого
        диалога и сведения о вашем бизнесе.
      </p>
      <p className="mb-5 text-sm leading-7 text-muted-foreground">
        Укажите проверенные документы, разрешающие такую обработку. Согласие
        собеседника учитывается вместе с политикой Telegram. Форма фиксирует
        вашу проверку; приложение не подтверждает юридическую допустимость
        автоматически. Если политика запрещает передачу данных, разрешение
        оформлять нельзя. В поля ниже вносите ссылки или номера документов, а не
        текст переписки и не ключи.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              path: `/ai/conversations/${conversationId}/authorization`,
              body: {
                ...data,
                providerRevision: provider.revision,
                expiresAt: new Date(`${data.expiresAt}T23:59:59`).toISOString(),
              },
            },
            { onSuccess: saved },
          );
        }}
      >
        <Field
          id="ai-policy-reference"
          label="Политика источника / документ, разрешающий обработку"
        >
          <Input
            id="ai-policy-reference"
            required
            minLength={10}
            maxLength={1000}
            value={data.sourcePolicyReference}
            onChange={(e) =>
              setData({ ...data, sourcePolicyReference: e.target.value })
            }
          />
        </Field>
        <Field
          id="ai-policy-version"
          label="Версия или дата проверенной политики"
        >
          <Input
            id="ai-policy-version"
            required
            minLength={3}
            maxLength={200}
            value={data.sourcePolicyVersion}
            onChange={(e) =>
              setData({ ...data, sourcePolicyVersion: e.target.value })
            }
          />
        </Field>
        <Field id="ai-rights-basis" label="Основание прав на этот диалог">
          <select
            id="ai-rights-basis"
            className={selectClass}
            value={data.rightsBasis}
            onChange={(e) =>
              setData({
                ...data,
                rightsBasis: e.target
                  .value as AiAuthorizationInput["rightsBasis"],
              })
            }
          >
            <option value="DOCUMENTED_CONSENT">
              Документированное согласие
            </option>
            <option value="CONTRACTUAL_RIGHTS">
              Документированные договорные права
            </option>
            <option value="OTHER_DOCUMENTED_RIGHTS">
              Другое документированное основание
            </option>
          </select>
        </Field>
        <Field
          id="ai-rights-reference"
          label="Ссылка или номер подтверждения прав / согласия"
        >
          <Input
            id="ai-rights-reference"
            required
            minLength={10}
            maxLength={1000}
            value={data.rightsReference}
            onChange={(e) =>
              setData({ ...data, rightsReference: e.target.value })
            }
          />
        </Field>
        <Field
          id="ai-review-notes"
          label="Что проверено и почему обработка разрешена"
        >
          <Textarea
            id="ai-review-notes"
            required
            minLength={30}
            maxLength={2000}
            rows={3}
            value={data.reviewNotes}
            onChange={(e) => setData({ ...data, reviewNotes: e.target.value })}
          />
        </Field>
        <Field
          id="ai-permission-expiry"
          label="Срок разрешения (не более года)"
        >
          <Input
            id="ai-permission-expiry"
            type="date"
            required
            value={data.expiresAt}
            onChange={(e) => setData({ ...data, expiresAt: e.target.value })}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            className="mt-1"
            type="checkbox"
            required
            checked={data.policyReviewed}
            onChange={(e) =>
              setData({ ...data, policyReviewed: e.target.checked })
            }
          />
          Я проверил(а), что указанная политика источника допускает эту операцию
          у указанного провайдера.
        </label>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            className="mt-1"
            type="checkbox"
            required
            checked={data.rightsVerified}
            onChange={(e) =>
              setData({ ...data, rightsVerified: e.target.checked })
            }
          />
          Я проверил(а) документированные права/согласия для этого диалога и
          указанной цели анализа.
        </label>
        <FormError error={action.error} />
        <Button
          type="submit"
          disabled={
            action.isPending || !data.policyReviewed || !data.rightsVerified
          }
        >
          {action.isPending ? "Сохраняем…" : "Сохранить разрешение"}
        </Button>
      </form>
    </Editor>
  );
}
