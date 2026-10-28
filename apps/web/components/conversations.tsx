"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Search,
  Sparkles,
  ChevronLeft,
  RefreshCw,
  Plus,
  Shield,
  Trash2,
  Reply,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Textarea } from "@sales/ui";
import type {
  AnalysisView,
  ContactView,
  ConversationView,
  MessageView,
  PipelineView,
  ProductView,
} from "@sales/shared";
import { useAction, useData, useDebounced, localDate } from "../lib/crm";
import { api } from "../lib/api";
import { Editor, FormError, selectClass } from "./editor";
import { Loading, ErrorNotice } from "./feedback";
export function Conversations() {
  const params = useSearchParams(),
    client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(params.get("id"));
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const q = useDebounced(search);
  const rows = useData<ConversationView[]>(
    "conversations",
    `/conversations?q=${encodeURIComponent(q)}&filter=${filter}`,
  );
  const contacts = useData<ContactView[]>("contacts", "/contacts");
  const action = useAction();
  const [create, setCreate] = useState(false),
    [name, setName] = useState(""),
    [contact, setContact] = useState("");
  const active = rows.data?.find((c) => c.id === selected);
  useEffect(() => {
    const id = params.get("id");
    if (id) setSelected(id);
  }, [params]);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Диалоги</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Переписка, контекст сделки и следующий шаг — в одном месте
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => action.mutate({ path: "/demo/seed" })}
          >
            Создать демо-данные
          </Button>
          <Button
            onClick={() => {
              setCreate(true);
              setName("");
              setContact("");
              action.reset();
            }}
          >
            <Plus className="size-4" />
            Демо-диалог
          </Button>
        </div>
      </div>
      <FormError error={action.error} />
      <div className="grid min-h-[70dvh] gap-4 md:grid-cols-[250px_minmax(0,1fr)]">
        <Card className={`min-w-0 p-3 ${selected ? "hidden md:block" : ""}`}>
          <div className="relative">
            <Search className="absolute top-4 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Поиск диалогов"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              placeholder="Имя или диалог"
            />
          </div>
          <select
            aria-label="Фильтр диалогов"
            className={`${selectClass} my-3`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              ["all", "Все доступные"],
              ["clients", "Клиенты"],
              ["candidates", "Не разобраны"],
              ["waiting", "Ожидают ответа"],
              ["active", "С активной сделкой"],
              ["withoutDeal", "Без активной сделки"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
          {rows.isPending ? (
            <Loading />
          ) : rows.error ? (
            <ErrorNotice error={rows.error} retry={() => void rows.refetch()} />
          ) : (
            <div className="space-y-1">
              {rows.data.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={`w-full rounded-xl p-3 text-left transition hover:bg-muted ${c.id === selected ? "bg-primary/10" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {c.title}
                    </span>
                    {c.unreadCount > 0 && (
                      <Badge className="ml-auto bg-primary text-white">
                        {c.unreadCount}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Badge className="px-2 text-[10px]">
                      {c.source === "DEMO"
                        ? "Демо"
                        : c.source === "TELEGRAM"
                          ? "Telegram"
                          : "Instagram"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {c.mode === "CLIENT"
                        ? "Клиент"
                        : c.mode === "EXCLUDED"
                          ? "Исключён"
                          : "Не разобран"}
                    </span>
                  </div>
                  {c.dealLinks[0] && (
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {c.dealLinks[0].deal.title}
                    </p>
                  )}
                </button>
              ))}
              {rows.data.length === 0 && (
                <p className="p-4 text-sm leading-6 text-muted-foreground">
                  Диалогов пока нет. Получите их из подключённого Telegram в
                  настройках или создайте явно отмеченные демо-данные.
                </p>
              )}
            </div>
          )}
        </Card>
        <div className={`min-w-0 ${!selected ? "hidden md:block" : ""}`}>
          {active ? (
            <Chat
              key={active.id}
              conversation={active}
              contacts={contacts.data ?? []}
              back={() => setSelected(null)}
            />
          ) : (
            <Card className="flex min-h-[65dvh] flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="size-9 text-primary" />
              <h2 className="text-xl font-semibold">Выберите диалог</h2>
              <p className="max-w-sm text-sm leading-7 text-muted-foreground">
                Демо-диалоги синтетические. Настоящие сообщения появятся после
                подключения Telegram и выбора переписки для работы.
              </p>
            </Card>
          )}
        </div>
      </div>
      {create && (
        <Editor
          title="Синтетический демо-диалог"
          close={() => setCreate(false)}
        >
          <p className="mb-5 text-sm text-muted-foreground">
            Этот диалог не связан с Telegram. Ответы сохраняются только в
            демонстрационной переписке.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  path: "/conversations",
                  body: { title: name, contactId: contact || null },
                },
                {
                  onSuccess: async (data) => {
                    const c = data as { id: string };
                    setSelected(c.id);
                    setCreate(false);
                    await client.invalidateQueries({
                      queryKey: ["conversations"],
                    });
                  },
                },
              );
            }}
          >
            <Field id="demo-title" label="Название диалога">
              <Input
                id="demo-title"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field id="demo-contact" label="Контакт">
              <select
                id="demo-contact"
                value={contact}
                className={selectClass}
                onChange={(e) => setContact(e.target.value)}
              >
                <option value="">Без контакта</option>
                {contacts.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <FormError error={action.error} />
            <Button type="submit" disabled={action.isPending}>
              Создать диалог
            </Button>
          </form>
        </Editor>
      )}
    </>
  );
}
function Chat({
  conversation: c,
  contacts,
  back,
}: {
  conversation: ConversationView;
  contacts: ContactView[];
  back: () => void;
}) {
  const client = useQueryClient(),
    action = useAction();
  const [draft, setDraft] = useState(""),
    [suggestion, setSuggestion] = useState<string | null>(null),
    [reply, setReply] = useState<MessageView | null>(null),
    [showAI, setShowAI] = useState(true),
    [selectClient, setSelectClient] = useState(false),
    [createDeal, setCreateDeal] = useState(false);
  const [contactId, setContactId] = useState(c.contactId ?? ""),
    [contactName, setContactName] = useState(c.title),
    [error, setError] = useState<Error | null>(null);
  const key = useRef<{ payload: string; id: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  const nativeCursor = useRef<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ["messages", c.id],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<{ items: MessageView[]; nextCursor: string | null }>(
        `/conversations/${c.id}/messages${pageParam ? `?cursor=${pageParam}` : ""}`,
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: c.mode === "CLIENT",
  });
  const messages = [
    ...new Map(
      (
        history.data?.pages
          .slice()
          .reverse()
          .flatMap((p) => p.items) ?? []
      ).map((m) => [m.id, m]),
    ).values(),
  ];
  const latest = messages.at(-1)?.id;
  useEffect(() => {
    if (follow.current) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [latest]);
  async function sync(older = false) {
    setSyncing(true);
    setError(null);
    try {
      const result = await api<{ cursor: string | null }>(
        `/conversations/${c.id}/sync${older && nativeCursor.current ? `?cursor=${nativeCursor.current}` : ""}`,
        { method: "POST" },
      );
      nativeCursor.current = result.cursor;
      await client.invalidateQueries({ queryKey: ["messages", c.id] });
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error("Не удалось загрузить историю"),
      );
    } finally {
      setSyncing(false);
    }
  }
  const synced = useRef(false);
  useEffect(() => {
    if (!synced.current && c.source === "TELEGRAM" && c.mode === "CLIENT") {
      synced.current = true;
      void sync();
    }
  }, [c.id, c.mode, c.source]);
  async function send() {
    if (!draft.trim() || action.isPending) return;
    const payload = JSON.stringify({
      text: draft.trim(),
      suggestionId: suggestion ?? undefined,
      replyToExternalId: reply?.externalMessageId ?? undefined,
    });
    if (!key.current || key.current.payload !== payload)
      key.current = { payload, id: crypto.randomUUID() };
    const commandKey = key.current.id;
    action.mutate(
      {
        path: `/conversations/${c.id}/messages`,
        body: {
          ...(JSON.parse(payload) as Record<string, unknown>),
          key: commandKey,
        },
      },
      {
        onSuccess: () => {
          setDraft("");
          setSuggestion(null);
          setReply(null);
          key.current = null;
          void client.invalidateQueries({ queryKey: ["messages", c.id] });
        },
      },
    );
  }
  async function chooseClient() {
    setError(null);
    try {
      let id = contactId;
      if (!id) {
        const contact = await api<ContactView>("/contacts", {
          method: "POST",
          body: JSON.stringify({ name: contactName }),
        });
        id = contact.id;
      }
      await api(`/conversations/${c.id}/policy`, {
        method: "PATCH",
        body: JSON.stringify({ mode: "CLIENT", contactId: id }),
      });
      setSelectClient(false);
      await client.invalidateQueries({ queryKey: ["conversations"] });
      await client.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error("Не удалось выбрать клиента"),
      );
    }
  }
  return (
    <div
      className={`grid min-w-0 items-start gap-4 ${showAI ? "xl:grid-cols-[minmax(0,1fr)_300px]" : ""}`}
    >
      <Card className="flex h-[calc(100dvh-15rem)] min-h-[36rem] min-w-0 flex-col overflow-hidden p-0">
        <header className="flex items-center gap-3 border-b border-border p-4">
          <Button
            variant="ghost"
            className="px-2 md:hidden"
            aria-label="К списку диалогов"
            onClick={back}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{c.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.source === "DEMO"
                ? "Синтетическая демо-переписка"
                : "Telegram"}{" "}
              ·{" "}
              {c.mode === "CLIENT"
                ? "Выбран для работы"
                : c.mode === "EXCLUDED"
                  ? "Исключён"
                  : "Не разобран"}
            </p>
          </div>
          <Button
            variant="ghost"
            aria-label="Показать или скрыть ИИ"
            onClick={() => setShowAI(!showAI)}
          >
            <Sparkles className="size-4" />
          </Button>
        </header>
        {c.mode !== "CLIENT" ? (
          <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-4 p-6 text-center">
            <Shield className="size-8 text-primary" />
            <h3 className="font-semibold">
              Содержание переписки не сохранено в CRM
            </h3>
            <p className="max-w-sm text-sm leading-7 text-muted-foreground">
              Выберите диалог для работы, чтобы загрузить сообщения. Это не даёт
              разрешения передавать Telegram-переписку внешнему ИИ.
            </p>
            <Button onClick={() => setSelectClient(true)}>
              Выбрать для работы
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-border p-3">
              <Button
                variant="ghost"
                className="min-h-8 text-xs"
                onClick={() => setSelectClient(true)}
              >
                Контакт: {c.contact?.name ?? "не выбран"}
              </Button>
              <Button
                variant="ghost"
                className="min-h-8 text-xs"
                disabled={!c.contactId}
                onClick={() => setCreateDeal(true)}
              >
                Создать сделку
              </Button>
              {c.source === "TELEGRAM" && (
                <Button
                  variant="ghost"
                  className="min-h-8 text-xs"
                  disabled={syncing}
                  onClick={() => void sync()}
                >
                  <RefreshCw className="size-3" />
                  История
                </Button>
              )}
              <Button
                variant="ghost"
                className="min-h-8 text-xs"
                onClick={() => {
                  if (
                    confirm(
                      "Очистить сохранённую историю, рекомендации и связи сделок?",
                    )
                  )
                    action.mutate(
                      {
                        path: `/conversations/${c.id}/messages`,
                        method: "DELETE",
                      },
                      {
                        onSuccess: () =>
                          void client.invalidateQueries({
                            queryKey: ["messages", c.id],
                          }),
                      },
                    );
                }}
              >
                <Trash2 className="size-3" />
                Очистить
              </Button>
              <Button
                variant="ghost"
                className="min-h-8 text-xs"
                onClick={() => {
                  if (
                    confirm(
                      "Исключить диалог? Сохранённые сообщения, рекомендации и связи сделок будут удалены.",
                    )
                  )
                    action.mutate({
                      path: `/conversations/${c.id}/policy`,
                      method: "PATCH",
                      body: { mode: "EXCLUDED" },
                    });
                }}
              >
                Исключить
              </Button>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto p-4"
              onScroll={(e) => {
                const el = e.currentTarget;
                follow.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 120;
              }}
            >
              {history.hasNextPage && (
                <Button
                  className="mx-auto mb-4 flex"
                  variant="outline"
                  disabled={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  Загрузить более ранние
                </Button>
              )}
              {c.source === "TELEGRAM" && nativeCursor.current && (
                <Button
                  className="mx-auto mb-4 flex"
                  variant="ghost"
                  disabled={syncing}
                  onClick={() => void sync(true)}
                >
                  Получить ранние сообщения из Telegram
                </Button>
              )}
              {history.isPending ? (
                <Loading />
              ) : history.error ? (
                <ErrorNotice
                  error={history.error}
                  retry={() => void history.refetch()}
                />
              ) : messages.length === 0 ? (
                <p className="py-14 text-center text-sm text-muted-foreground">
                  Сообщений пока нет
                  {c.source === "DEMO"
                    ? ". Это демо-диалог."
                    : ". Дождитесь синхронизации истории."}
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`mb-4 flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 sm:max-w-[85%] ${m.direction === "OUT" ? "bg-primary/10" : "bg-muted"}`}
                    >
                      {m.replyToExternalId && (
                        <p className="mb-2 border-l-2 border-primary pl-2 text-xs text-muted-foreground">
                          Ответ на сообщение #{m.replyToExternalId}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {m.kind === "text"
                          ? m.text
                          : "[Неподдерживаемое вложение]"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[10px] text-muted-foreground">
                        <span>
                          {localDate(m.sentAt)}
                          {m.editedAt ? " · изменено" : ""}
                        </span>
                        {m.direction === "OUT" && (
                          <span>
                            {
                              (
                                {
                                  PENDING: "В очереди",
                                  SENDING: "Отправляется",
                                  SENT:
                                    c.source === "DEMO"
                                      ? "Сохранено в демо"
                                      : "Отправлено",
                                  FAILED: "Ошибка отправки",
                                  UNCERTAIN: "Нужно проверить в Telegram",
                                } as const
                              )[m.status]
                            }
                          </span>
                        )}
                        {m.externalMessageId && c.source === "TELEGRAM" && (
                          <button
                            aria-label="Ответить на сообщение"
                            onClick={() => setReply(m)}
                          >
                            <Reply className="size-3" />
                          </button>
                        )}
                      </div>
                      {m.error && (
                        <p className="mt-2 text-xs text-destructive">
                          {m.error}
                        </p>
                      )}
                      {m.status === "FAILED" && m.commandId && (
                        <Button
                          variant="outline"
                          className="mt-3 min-h-8 text-xs"
                          disabled={action.isPending}
                          onClick={() =>
                            action.mutate(
                              {
                                path: `/message-commands/${m.commandId}/retry`,
                              },
                              {
                                onSuccess: () =>
                                  void client.invalidateQueries({
                                    queryKey: ["messages", c.id],
                                  }),
                              },
                            )
                          }
                        >
                          Повторить отправку
                        </Button>
                      )}
                      {m.status === "UNCERTAIN" && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          Автоматический повтор остановлен, чтобы не создать
                          дубль. Проверьте официальный Telegram.
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={bottom} />
            </div>
            <form
              className="border-t border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {reply && (
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    Ответ: {reply.text.slice(0, 80)}
                  </span>
                  <button type="button" onClick={() => setReply(null)}>
                    Отменить ответ
                  </button>
                </div>
              )}
              {suggestion && (
                <div className="mb-2 flex items-center justify-between text-xs text-primary">
                  <span>Вставлена рекомендация · текст можно изменить</span>
                  <button type="button" onClick={() => setSuggestion(null)}>
                    Отвязать совет
                  </button>
                </div>
              )}
              <Textarea
                aria-label="Текст сообщения"
                value={draft}
                rows={3}
                maxLength={4096}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Напишите ответ…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <FormError error={action.error} />
              <FormError error={error} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[10px] text-muted-foreground">
                  Ctrl+Enter ·{" "}
                  {c.source === "DEMO"
                    ? "Только демо, не Telegram"
                    : "Отправка после вашего нажатия"}
                </span>
                <Button
                  type="submit"
                  disabled={action.isPending || !draft.trim()}
                >
                  <Send className="size-4" />
                  {c.source === "DEMO" ? "Отправить в демо" : "Отправить"}
                </Button>
              </div>
            </form>
          </>
        )}
      </Card>
      {showAI && (
        <AiPanel
          conversation={c}
          use={async (id, text) => {
            await api(`/ai/suggestions/${id}/feedback`, {
              method: "POST",
              body: JSON.stringify({ feedback: "APPLIED" }),
            });
            setDraft(text);
            setSuggestion(id);
          }}
        />
      )}
      {selectClient && (
        <Editor title="Выбор клиента" close={() => setSelectClient(false)}>
          <p className="mb-5 text-sm leading-6 text-muted-foreground">
            Выбор разрешит хранение переписки в CRM. AI-анализ Telegram остаётся
            выключенным.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void chooseClient();
            }}
            className="space-y-4"
          >
            <Field id="client-existing" label="Контакт">
              <select
                id="client-existing"
                className={selectClass}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">Создать нового клиента</option>
                {contacts.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            {!contactId && (
              <Field id="client-name" label="Имя клиента">
                <Input
                  id="client-name"
                  required
                  maxLength={120}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </Field>
            )}
            <FormError error={error} />
            <Button type="submit">Сохранить выбор</Button>
          </form>
        </Editor>
      )}
      {createDeal && c.contactId && (
        <ChatDeal conversation={c} close={() => setCreateDeal(false)} />
      )}
    </div>
  );
}
function AiPanel({
  conversation: c,
  use,
}: {
  conversation: ConversationView;
  use: (id: string, text: string) => Promise<void>;
}) {
  const rows = useData<AnalysisView[]>(
    "analysis",
    `/ai/conversations/${c.id}`,
    c.mode === "CLIENT" && c.source === "DEMO",
  );
  const action = useAction();
  const client = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const a = rows.data?.[0];
  return (
    <Card className="h-fit max-h-[75dvh] min-w-0 overflow-y-auto">
      <div className="mb-5 flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="font-semibold">AI Copilot</h2>
      </div>
      {c.source !== "DEMO" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          Анализ настоящих Telegram-переписок закрыт по политике источника.
          Выбор клиента не заменяет необходимые права и согласия. Помощник
          доступен на синтетических демо-данных.
        </p>
      ) : c.mode !== "CLIENT" ? (
        <p className="text-sm text-muted-foreground">
          Сначала выберите диалог для работы.
        </p>
      ) : (
        <>
          <div className="mb-4 rounded-xl bg-muted p-3 text-xs leading-6 text-muted-foreground">
            Данные этого диалога синтетические. ИИ предлагает текст; решение и
            отправка остаются за вами.
          </div>
          <Button
            className="mb-4 w-full"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { path: "/ai/analyze", body: { conversationId: c.id } },
                {
                  onSuccess: () =>
                    void client.invalidateQueries({ queryKey: ["analysis"] }),
                },
              )
            }
          >
            {action.isPending
              ? "Анализируем…"
              : a
                ? "Обновить рекомендации"
                : "Анализировать диалог"}
          </Button>
          <FormError error={action.error} />
          <FormError error={error} />
          {rows.error && (
            <p className="text-xs text-destructive">{rows.error.message}</p>
          )}
          {a && (
            <>
              <Badge className="mb-3">
                {a.provider === "DEMO_RULES"
                  ? "Демо-алгоритм · без LLM"
                  : a.provider}
              </Badge>
              {a.stale && (
                <p
                  role="status"
                  className="mb-4 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
                >
                  Контекст изменился. Обновите рекомендации перед
                  использованием.
                </p>
              )}
              <h3 className="mb-2 text-sm font-semibold">Резюме</h3>
              <p className="mb-4 text-xs leading-6 text-muted-foreground">
                {a.result.summary}
              </p>
              {[
                ["Потребности", a.result.needs],
                ["Возражения", a.result.objections],
                ["Что уточнить", a.result.missing_information],
              ].map(([label, values]) => (
                <div key={String(label)} className="mb-4">
                  <h3 className="text-xs font-semibold">{String(label)}</h3>
                  <ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
                    {(values as string[]).length ? (
                      (values as string[]).map((v) => <li key={v}>• {v}</li>)
                    ) : (
                      <li>Нет подтверждённых данных</li>
                    )}
                  </ul>
                </div>
              ))}
              {a.result.facts.map((f, i) => (
                <p key={i} className="mb-2 text-xs leading-5">
                  <Badge>
                    {f.status === "CONFIRMED"
                      ? "Факт"
                      : f.status === "INFERRED"
                        ? "Гипотеза"
                        : "Неизвестно"}
                  </Badge>{" "}
                  {f.text}
                </p>
              ))}
              <p className="mb-4 text-xs leading-6 text-muted-foreground">
                Предлагаемый этап: {a.result.stage_suggestion}. Изменить этап
                можно вручную в карточке сделки.
              </p>
              <h3 className="mb-2 text-sm font-semibold">Следующий шаг</h3>
              <p className="mb-5 text-xs leading-6 text-muted-foreground">
                {a.result.reasoning_summary}
              </p>
              {a.suggestions.map((s) => (
                <div
                  key={s.id}
                  className="mb-4 rounded-xl border border-border p-3"
                >
                  <p className="mb-2 text-xs font-semibold text-primary">
                    {(
                      {
                        warm: "Мягко",
                        confident: "Уверенно",
                        short: "Коротко",
                      } as Record<string, string>
                    )[s.tone] ?? s.tone}
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-6">
                    {s.text}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="min-h-8 text-xs"
                      disabled={a.stale}
                      onClick={() => {
                        setError(null);
                        void use(s.id, s.text).catch((e) =>
                          setError(
                            e instanceof Error
                              ? e
                              : new Error("Рекомендация недоступна"),
                          ),
                        );
                      }}
                    >
                      Вставить в сообщение
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-8 px-2 text-xs"
                      disabled={a.stale}
                      onClick={() =>
                        action.mutate(
                          {
                            path: `/ai/suggestions/${s.id}/feedback`,
                            body: { feedback: "REJECTED" },
                          },
                          { onSuccess: () => void rows.refetch() },
                        )
                      }
                    >
                      Отклонить
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                {[
                  ["shorter", "Короче"],
                  ["longer", "Подробнее"],
                ].map(([v, t]) => (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    key={v}
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate(
                        {
                          path: "/ai/suggest",
                          body: { conversationId: c.id, length: v },
                        },
                        { onSuccess: () => void rows.refetch() },
                      )
                    }
                  >
                    {t}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-muted-foreground">
                {a.usage[0]
                  ? `Токены: ${a.usage[0].inputTokens} / ${a.usage[0].outputTokens}`
                  : "Учёт токенов недоступен"}
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
function ChatDeal({
  conversation: c,
  close,
}: {
  conversation: ConversationView;
  close: () => void;
}) {
  const pipelines = useData<PipelineView[]>("pipelines", "/pipelines");
  const products = useData<ProductView[]>("products", "/products");
  const [pipelineId, setPipelineId] = useState(""),
    [stageId, setStageId] = useState(""),
    [title, setTitle] = useState(`Сделка · ${c.title}`),
    [productId, setProductId] = useState(""),
    [amount, setAmount] = useState("");
  const action = useAction();
  const selected =
    pipelines.data?.find((p) => p.id === pipelineId) || pipelines.data?.[0];
  const stage =
    selected?.stages.find((s) => s.id === stageId && s.kind === "OPEN") ??
    selected?.stages.find((s) => s.kind === "OPEN");
  return (
    <Editor title="Новая сделка" close={close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (selected && stage)
            action.mutate(
              {
                path: "/deals",
                body: {
                  contactId: c.contactId,
                  conversationId: c.id,
                  title,
                  pipelineId: selected.id,
                  stageId: stage.id,
                  productId: productId || null,
                  amount: amount || null,
                  currency: "RUB",
                },
              },
              { onSuccess: close },
            );
        }}
      >
        <Field id="chat-deal-title" label="Название сделки">
          <Input
            id="chat-deal-title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field id="chat-deal-pipeline" label="Воронка">
          <select
            id="chat-deal-pipeline"
            className={selectClass}
            value={selected?.id ?? ""}
            onChange={(e) => {
              setPipelineId(e.target.value);
              setStageId("");
            }}
          >
            {pipelines.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="chat-deal-stage" label="Этап">
          <select
            id="chat-deal-stage"
            className={selectClass}
            value={stage?.id ?? ""}
            onChange={(e) => setStageId(e.target.value)}
          >
            {selected?.stages
              .filter((s) => s.kind === "OPEN")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field id="chat-deal-product" label="Продукт">
          <select
            id="chat-deal-product"
            className={selectClass}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Не выбран</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="chat-deal-amount" label="Сумма, RUB (можно не указывать)">
          <Input
            id="chat-deal-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
          />
        </Field>
        <FormError error={action.error} />
        <Button disabled={action.isPending || !stage} type="submit">
          Создать сделку
        </Button>
      </form>
    </Editor>
  );
}
