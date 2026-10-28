"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Check, Clock, Bell, Trash2, ArrowRight } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@sales/ui";
import type { DealView, NotificationView, TaskView } from "@sales/shared";
import { useData, useAction, localDate } from "../lib/crm";
import { Editor, FormError, selectClass } from "./editor";
import { PageHeading } from "./page-heading";
import { Loading, ErrorNotice } from "./feedback";
export function Today() {
  const tasks = useData<TaskView[]>("tasks", "/tasks"),
    notifications = useData<NotificationView[]>(
      "notifications",
      "/notifications",
    ),
    deals = useData<DealView[]>("deals", "/deals");
  const action = useAction();
  const [creating, setCreating] = useState(false),
    [showDone, setShowDone] = useState(false);
  const [form, setForm] = useState({
    title: "",
    dueAt: "",
    priority: "NORMAL",
    dealId: "",
  });
  const open = tasks.data?.filter((t) => !t.doneAt) ?? [];
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < new Date());
  return (
    <>
      <PageHeading
        title="Сегодня"
        description="Задачи, договорённости и напоминания вашего рабочего пространства."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Открытых задач", open.length],
          ["Просрочено", overdue.length],
          [
            "Непрочитанных напоминаний",
            notifications.data?.filter((n) => !n.readAt).length ?? 0,
          ],
        ].map(([title, value]) => (
          <Card key={title}>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="mt-3 text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Мои задачи</h2>
            <Button
              onClick={() => {
                setCreating(true);
                setForm({
                  title: "",
                  dueAt: "",
                  priority: "NORMAL",
                  dealId: "",
                });
                action.reset();
              }}
            >
              <Plus className="size-4" />
              Новая задача
            </Button>
          </div>
          <label className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            Показывать завершённые
          </label>
          <FormError error={action.error} />
          {tasks.isPending ? (
            <Loading />
          ) : tasks.error ? (
            <ErrorNotice
              error={tasks.error}
              retry={() => void tasks.refetch()}
            />
          ) : (
            <ul className="divide-y divide-border">
              {tasks.data
                .filter((t) => showDone || !t.doneAt)
                .map((t) => (
                  <li key={t.id} className="flex items-start gap-3 py-4">
                    <button
                      aria-label={
                        t.doneAt
                          ? `Вернуть задачу ${t.title}`
                          : `Завершить задачу ${t.title}`
                      }
                      className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border ${t.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`}
                      onClick={() =>
                        action.mutate({
                          path: `/tasks/${t.id}`,
                          method: "PATCH",
                          body: { version: t.version, done: !t.doneAt },
                        })
                      }
                    >
                      {t.doneAt && <Check className="size-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${t.doneAt ? "text-muted-foreground line-through" : ""}`}
                      >
                        {t.title}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge
                          className={
                            !t.doneAt &&
                            t.dueAt &&
                            new Date(t.dueAt) < new Date()
                              ? "text-destructive"
                              : ""
                          }
                        >
                          <Clock className="size-3" />
                          {localDate(t.dueAt)}
                        </Badge>
                        {t.priority === "HIGH" && (
                          <Badge>Высокий приоритет</Badge>
                        )}
                      </div>
                      {t.conversationId && (
                        <Link
                          href={`/conversations?id=${t.conversationId}`}
                          className="mt-2 inline-block text-xs text-primary"
                        >
                          Перейти в диалог
                        </Link>
                      )}
                    </div>
                    <button
                      aria-label={`Удалить задачу ${t.title}`}
                      className="p-2 text-muted-foreground"
                      onClick={() => {
                        if (confirm("Удалить задачу?"))
                          action.mutate({
                            path: `/tasks/${t.id}`,
                            method: "DELETE",
                          });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {tasks.data?.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Добавьте первую задачу или напоминание.
            </p>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <div className="mb-5 flex items-center gap-3">
              <Bell className="size-5 text-primary" />
              <h2 className="font-semibold">Напоминания</h2>
            </div>
            {notifications.data
              ?.filter((n) => !n.readAt)
              .map((n) => (
                <div key={n.id} className="mb-4 rounded-xl bg-muted p-4">
                  <p className="text-sm">{n.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {localDate(n.createdAt)}
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-2 min-h-8 text-xs"
                    onClick={() =>
                      action.mutate({ path: `/notifications/${n.id}/read` })
                    }
                  >
                    Прочитано
                  </Button>
                </div>
              ))}
            {!notifications.data?.some((n) => !n.readAt) && (
              <p className="text-sm text-muted-foreground">
                Новых напоминаний нет.
              </p>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Продолжить работу</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Откройте переписку, уточните следующий шаг и отправьте ответ после
              своего подтверждения.
            </p>
            <Button asChild variant="outline" className="mt-5 w-full">
              <Link href="/conversations">
                К диалогам
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Card>
        </div>
      </div>
      {creating && (
        <Editor title="Новая задача" close={() => setCreating(false)}>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  path: "/tasks",
                  body: {
                    title: form.title,
                    dueAt: form.dueAt
                      ? new Date(form.dueAt).toISOString()
                      : null,
                    priority: form.priority,
                    dealId: form.dealId || null,
                  },
                },
                { onSuccess: () => setCreating(false) },
              );
            }}
          >
            <Field id="task-title" label="Что нужно сделать">
              <Input
                id="task-title"
                required
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field id="task-due" label="Напомнить — время компьютера">
              <Input
                id="task-due"
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </Field>
            <Field id="task-priority" label="Приоритет">
              <select
                id="task-priority"
                className={selectClass}
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="LOW">Низкий</option>
                <option value="NORMAL">Обычный</option>
                <option value="HIGH">Высокий</option>
              </select>
            </Field>
            <Field id="task-deal" label="Связать со сделкой">
              <select
                id="task-deal"
                className={selectClass}
                value={form.dealId}
                onChange={(e) => setForm({ ...form, dealId: e.target.value })}
              >
                <option value="">Без сделки</option>
                {deals.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </Field>
            <FormError error={action.error} />
            <Button disabled={action.isPending} type="submit">
              Создать задачу
            </Button>
          </form>
        </Editor>
      )}
    </>
  );
}
