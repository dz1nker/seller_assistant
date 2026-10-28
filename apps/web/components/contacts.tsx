"use client";
import { useState } from "react";
import { Plus, Search, Pencil, Trash2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Textarea } from "@sales/ui";
import type { ContactView } from "@sales/shared";
import { useData, useAction, useDebounced } from "../lib/crm";
import { api } from "../lib/api";
import { Editor, FormError } from "./editor";
import { PageHeading } from "./page-heading";
import { Loading, ErrorNotice } from "./feedback";
export function Contacts() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const rows = useData<ContactView[]>(
    "contacts",
    `/contacts?q=${encodeURIComponent(q)}`,
  );
  const action = useAction();
  const router = useRouter();
  const [editing, setEditing] = useState<ContactView | null | undefined>();
  const [form, setForm] = useState({ name: "", username: "", notes: "" });
  function edit(c?: ContactView) {
    setForm({
      name: c?.name ?? "",
      username: c?.username ?? "",
      notes: c?.notes ?? "",
    });
    setEditing(c ?? null);
    action.reset();
  }
  return (
    <>
      <PageHeading
        title="Клиенты"
        description="Контакт, переписка и сделка хранятся отдельно. Совпадение имени не объединяет людей автоматически."
      />
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute top-4 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Поиск клиентов"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или username"
          />
        </div>
        <Button onClick={() => edit()}>
          <Plus className="size-4" />
          Добавить клиента
        </Button>
      </div>
      <FormError error={action.error} />
      {rows.isPending ? (
        <Loading />
      ) : rows.error ? (
        <ErrorNotice error={rows.error} retry={() => void rows.refetch()} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.data.map((c) => (
            <Card key={c.id}>
              <h2 className="font-semibold">{c.name}</h2>
              {c.username && (
                <p className="mt-1 text-sm text-primary">
                  @{c.username.replace(/^@/, "")}
                </p>
              )}
              <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                {c.notes || "Заметок пока нет"}
              </p>
              <div className="mt-5 flex gap-2">
                <Button
                  variant="outline"
                  aria-label={`Изменить ${c.name}`}
                  onClick={() => edit(c)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Удалить ${c.name}`}
                  onClick={() => {
                    if (
                      confirm(
                        "Удалить клиента, его сделки и сохранённые переписки?",
                      )
                    )
                      action.mutate({
                        path: `/contacts/${c.id}`,
                        method: "DELETE",
                      });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    action.mutate(
                      {
                        path: "/conversations",
                        body: { title: c.name, contactId: c.id },
                      },
                      {
                        onSuccess: (data) =>
                          router.push(
                            `/conversations?id=${(data as { id: string }).id}`,
                          ),
                      },
                    )
                  }
                >
                  <MessageSquare className="size-4" />
                  Демо-диалог
                </Button>
              </div>
            </Card>
          ))}
          {rows.data.length === 0 && (
            <Card className="col-span-full py-14 text-center text-muted-foreground">
              Клиентов пока нет. Добавьте первого клиента.
            </Card>
          )}
        </div>
      )}
      {editing !== undefined && (
        <Editor
          title={editing ? "Карточка клиента" : "Новый клиент"}
          close={() => setEditing(undefined)}
        >
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  path: editing ? `/contacts/${editing.id}` : "/contacts",
                  method: editing ? "PATCH" : "POST",
                  body: { ...form, username: form.username || null },
                },
                { onSuccess: () => setEditing(undefined) },
              );
            }}
          >
            <Field id="contact-name" label="Имя">
              <Input
                id="contact-name"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field id="contact-username" label="Username">
              <Input
                id="contact-username"
                maxLength={100}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field id="contact-notes" label="Заметки">
              <Textarea
                id="contact-notes"
                rows={5}
                maxLength={8000}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <FormError error={action.error} />
            <Button disabled={action.isPending} type="submit">
              Сохранить клиента
            </Button>
          </form>
        </Editor>
      )}
    </>
  );
}
