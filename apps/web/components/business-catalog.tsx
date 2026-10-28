"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { Badge, Button, Card, Field, Input, Textarea } from "@sales/ui";
import {
  businessProfileSchema,
  type KnowledgeView,
  type ProductView,
} from "@sales/shared";
import { useAction, useData, amount } from "../lib/crm";
import { useUser } from "../lib/queries";
import { Editor, FormError, selectClass } from "./editor";
const empty = {
  name: "",
  description: "",
  amount: "",
  currency: "RUB",
  format: "",
  duration: "",
  audience: "",
  limitations: "",
  outcomes: "",
  paymentOptions: "",
  faq: "",
  cases: "",
};
const labels = [
  ["description", "Описание"],
  ["format", "Формат"],
  ["duration", "Продолжительность"],
  ["audience", "Для кого предназначен"],
  ["limitations", "Ограничения и кому не подходит"],
  ["outcomes", "Обоснованные результаты"],
  ["paymentOptions", "Варианты оплаты"],
  ["faq", "Частые вопросы"],
  ["cases", "Кейсы"],
] as const;
export function BusinessCatalog() {
  const products = useData<ProductView[]>("products", "/products"),
    business = useData<{ profile: unknown; knowledge: KnowledgeView[] }>(
      "business",
      "/business",
    ),
    user = useUser();
  const canEdit = ["OWNER", "ADMIN"].includes(user.data?.role ?? "");
  const action = useAction();
  const [editing, setEditing] = useState<ProductView | null | undefined>(),
    [form, setForm] = useState(empty),
    [knowledge, setKnowledge] = useState<KnowledgeView | null | undefined>(),
    [note, setNote] = useState({ title: "", text: "" }),
    [profile, setProfile] = useState(false);
  function editProduct(p?: ProductView) {
    setForm(
      p
        ? {
            name: p.name,
            description: p.description,
            amount: p.amount ?? "",
            currency: p.currency,
            format: p.format,
            duration: p.duration,
            audience: p.audience,
            limitations: p.limitations,
            outcomes: p.outcomes,
            paymentOptions: p.paymentOptions,
            faq: p.faq,
            cases: p.cases,
          }
        : empty,
    );
    setEditing(p ?? null);
    action.reset();
  }
  return (
    <div className="mt-8 space-y-7">
      <FormError error={action.error} />
      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Продукты и услуги</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Формат, ограничения и условия — без выдуманных обещаний.
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => editProduct()}>
              <Plus className="size-4" />
              Добавить продукт
            </Button>
          )}
        </div>
        {products.error && (
          <p className="text-destructive">{products.error.message}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {products.data?.map((p) => (
            <div key={p.id} className="rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{p.name}</h3>
                {canEdit && (
                  <button
                    aria-label={`Изменить продукт ${p.name}`}
                    onClick={() => editProduct(p)}
                  >
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {p.description}
              </p>
              <p className="mt-4 font-semibold">
                {amount(p.amount, p.currency)}
              </p>
              <div className="mt-3 flex gap-2">
                {p.format && <Badge>{p.format}</Badge>}
                {p.duration && <Badge>{p.duration}</Badge>}
              </div>
            </div>
          ))}
        </div>
        {products.data?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Добавьте первый продукт или услугу.
          </p>
        )}
      </Card>
      <Card>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Эксперт и стиль общения</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Специализация, аудитория и предпочтения в ответах.
            </p>
          </div>
          {canEdit && (
            <Button variant="outline" onClick={() => setProfile(true)}>
              Настроить стиль
            </Button>
          )}
        </div>
        {business.data && (
          <p className="text-sm leading-7 text-muted-foreground">
            {businessProfileSchema.parse(business.data.profile)
              .specialization || "Пока не заполнено"}
          </p>
        )}
      </Card>
      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BookOpen className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">База знаний</h2>
          </div>
          {canEdit && (
            <Button
              onClick={() => {
                setNote({ title: "", text: "" });
                setKnowledge(null);
                action.reset();
              }}
            >
              Добавить материал
            </Button>
          )}
        </div>
        {business.error && (
          <p className="text-destructive">{business.error.message}</p>
        )}
        <div className="space-y-3">
          {business.data?.knowledge.map((k) => (
            <div
              key={k.id}
              className="flex items-start gap-4 rounded-xl border border-border p-4"
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{k.title}</h3>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {k.text}
                </p>
              </div>
              {canEdit && (
                <>
                  <button
                    aria-label={`Изменить материал ${k.title}`}
                    onClick={() => {
                      setNote({ title: k.title, text: k.text });
                      setKnowledge(k);
                      action.reset();
                    }}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    aria-label={`Удалить материал ${k.title}`}
                    onClick={() => {
                      if (confirm("Удалить материал из базы знаний?"))
                        action.mutate({
                          path: `/knowledge/${k.id}`,
                          method: "DELETE",
                        });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {business.data?.knowledge.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Добавьте информацию, на которую можно опираться в работе.
          </p>
        )}
      </Card>
      {editing !== undefined && (
        <Editor
          title={editing ? "Изменить продукт" : "Новый продукт"}
          close={() => setEditing(undefined)}
          wide
        >
          <form
            className="grid gap-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  path: editing ? `/products/${editing.id}` : "/products",
                  method: editing ? "PATCH" : "POST",
                  body: { ...form, amount: form.amount || null },
                },
                { onSuccess: () => setEditing(undefined) },
              );
            }}
          >
            <Field id="product-name" label="Название продукта">
              <Input
                id="product-name"
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="product-amount" label="Стоимость">
                <Input
                  id="product-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      amount: e.target.value.replace(",", "."),
                    })
                  }
                  placeholder="Не указана"
                />
              </Field>
              <Field id="product-currency" label="Валюта">
                <Input
                  id="product-currency"
                  maxLength={3}
                  required
                  value={form.currency}
                  onChange={(e) =>
                    setForm({ ...form, currency: e.target.value.toUpperCase() })
                  }
                />
              </Field>
            </div>
            {labels.map(([key, label]) => (
              <Field key={key} id={`product-${key}`} label={label}>
                <Textarea
                  id={`product-${key}`}
                  rows={3}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </Field>
            ))}
            <FormError error={action.error} />
            <div className="flex gap-3 sm:col-span-2">
              <Button disabled={action.isPending} type="submit">
                Сохранить продукт
              </Button>
              {editing && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        "Удалить продукт? Сделки останутся, привязка продукта будет снята.",
                      )
                    )
                      action.mutate(
                        { path: `/products/${editing.id}`, method: "DELETE" },
                        { onSuccess: () => setEditing(undefined) },
                      );
                  }}
                >
                  Удалить продукт
                </Button>
              )}
            </div>
          </form>
        </Editor>
      )}
      {knowledge !== undefined && (
        <Editor
          title="Материал базы знаний"
          close={() => setKnowledge(undefined)}
        >
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                {
                  path: knowledge ? `/knowledge/${knowledge.id}` : "/knowledge",
                  method: knowledge ? "PATCH" : "POST",
                  body: note,
                },
                { onSuccess: () => setKnowledge(undefined) },
              );
            }}
          >
            <Field id="knowledge-title" label="Название материала">
              <Input
                id="knowledge-title"
                required
                maxLength={200}
                value={note.title}
                onChange={(e) => setNote({ ...note, title: e.target.value })}
              />
            </Field>
            <Field id="knowledge-text" label="Текст">
              <Textarea
                id="knowledge-text"
                required
                rows={12}
                maxLength={20000}
                value={note.text}
                onChange={(e) => setNote({ ...note, text: e.target.value })}
              />
            </Field>
            <FormError error={action.error} />
            <Button disabled={action.isPending} type="submit">
              Сохранить материал
            </Button>
          </form>
        </Editor>
      )}
      {profile && business.data && (
        <ProfileForm
          initial={business.data.profile}
          close={() => setProfile(false)}
        />
      )}
    </div>
  );
}
function ProfileForm({
  initial,
  close,
}: {
  initial: unknown;
  close: () => void;
}) {
  const [data, setData] = useState(() => businessProfileSchema.parse(initial));
  const action = useAction();
  const fields = [
    ["specialization", "Специализация"],
    ["experience", "Опыт"],
    ["audience", "Целевая аудитория"],
    ["positioning", "Позиционирование"],
    ["approach", "Подход к работе"],
    ["advantages", "Преимущества"],
    ["examples", "Примеры хороших ответов"],
    ["forbidden", "Запрещённые формулировки"],
  ] as const;
  return (
    <Editor title="Эксперт и стиль общения" close={close} wide>
      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            { path: "/business", method: "PATCH", body: data },
            { onSuccess: close },
          );
        }}
      >
        {fields.map(([key, label]) => (
          <Field key={key} id={`profile-${key}`} label={label}>
            <Textarea
              id={`profile-${key}`}
              rows={3}
              value={data[key]}
              onChange={(e) => setData({ ...data, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Field id="profile-address" label="Обращение">
          <select
            id="profile-address"
            className={selectClass}
            value={data.address}
            onChange={(e) =>
              setData({ ...data, address: e.target.value as "ты" | "вы" })
            }
          >
            <option value="вы">На вы</option>
            <option value="ты">На ты</option>
          </select>
        </Field>
        <Field id="profile-tone" label="Тон">
          <select
            id="profile-tone"
            className={selectClass}
            value={data.tone}
            onChange={(e) =>
              setData({
                ...data,
                tone: e.target.value as "formal" | "friendly",
              })
            }
          >
            <option value="friendly">Дружелюбный</option>
            <option value="formal">Формальный</option>
          </select>
        </Field>
        <Field id="profile-length" label="Длина ответов">
          <select
            id="profile-length"
            className={selectClass}
            value={data.responseLength}
            onChange={(e) =>
              setData({
                ...data,
                responseLength: e.target.value as "short" | "medium" | "long",
              })
            }
          >
            <option value="short">Короткие</option>
            <option value="medium">Средние</option>
            <option value="long">Подробные</option>
          </select>
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={data.emoji}
            onChange={(e) => setData({ ...data, emoji: e.target.checked })}
          />
          Допустимы эмодзи
        </label>
        <FormError error={action.error} />
        <div className="sm:col-span-2">
          <Button disabled={action.isPending} type="submit">
            Сохранить стиль
          </Button>
        </div>
      </form>
    </Editor>
  );
}
