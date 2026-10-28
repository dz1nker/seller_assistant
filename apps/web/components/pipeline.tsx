"use client";
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Settings2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Trash2,
  Clock,
} from "lucide-react";
import { Badge, Button, Card, Field, Input, Textarea } from "@sales/ui";
import type {
  ContactView,
  DealView,
  PipelineView,
  ProductView,
  StageView,
} from "@sales/shared";
import { api } from "../lib/api";
import { useAction, useData, amount, localDate } from "../lib/crm";
import { Editor, FormError, selectClass } from "./editor";
import { Loading, ErrorNotice } from "./feedback";
import { PageHeading } from "./page-heading";
export function Pipeline() {
  const pipelines = useData<PipelineView[]>("pipelines", "/pipelines"),
    deals = useData<DealView[]>("deals", "/deals"),
    client = useQueryClient();
  const [pipelineId, setPipelineId] = useState(""),
    [activeDrag, setActiveDrag] = useState<DealView | null>(null),
    [editing, setEditing] = useState<DealView | null>(null),
    [creating, setCreating] = useState(false),
    [settings, setSettings] = useState(false),
    [newPipeline, setNewPipeline] = useState(false),
    [pipelineName, setPipelineName] = useState("");
  const action = useAction();
  const selected =
    pipelines.data?.find((p) => p.id === pipelineId) ?? pipelines.data?.[0];
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );
  const move = useMutation({
    mutationFn: ({ deal, stage }: { deal: DealView; stage: StageView }) =>
      api<DealView>(`/deals/${deal.id}/move`, {
        method: "POST",
        body: JSON.stringify({
          stageId: stage.id,
          version: deal.version,
          confirmWon: stage.kind === "WON",
          lossReason:
            stage.kind === "LOST"
              ? prompt("Причина проигрыша (необязательно)")
              : null,
        }),
      }),
    onMutate: async ({ deal, stage }) => {
      await client.cancelQueries({ queryKey: ["deals"] });
      const key = ["deals", "/deals"];
      const prev = client.getQueryData<DealView[]>(key);
      client.setQueryData<DealView[]>(key, (old) =>
        old?.map((d) =>
          d.id === deal.id
            ? {
                ...d,
                stageId: stage.id,
                status: stage.kind,
                version: d.version + 1,
              }
            : d,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(["deals", "/deals"], ctx.prev);
    },
    onSettled: () => {
      for (const key of ["deals", "analytics", "conversations"])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  function moveTo(deal: DealView, stage: StageView) {
    if (deal.stageId === stage.id) return;
    if (
      stage.kind === "WON" &&
      !confirm(
        "Подтверждаете успешное завершение сделки? Это ваше решение, не автоматическое подтверждение оплаты.",
      )
    )
      return;
    move.mutate({ deal, stage });
  }
  function dragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const deal = deals.data?.find((d) => d.id === e.active.id),
      stage = selected?.stages.find((s) => s.id === e.over?.id);
    if (deal && stage) moveTo(deal, stage);
  }
  if (pipelines.isPending || deals.isPending) return <Loading />;
  if (pipelines.error || deals.error)
    return (
      <ErrorNotice
        error={(pipelines.error ?? deals.error)!}
        retry={() => {
          void pipelines.refetch();
          void deals.refetch();
        }}
      />
    );
  return (
    <>
      <PageHeading
        title="Воронка"
        description="Перетаскивайте сделки между этапами или меняйте этап в карточке. Успешное закрытие требует вашего подтверждения."
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          aria-label="Текущая воронка"
          className={`${selectClass} max-w-xs`}
          value={selected?.id ?? ""}
          onChange={(e) => setPipelineId(e.target.value)}
        >
          {pipelines.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => setNewPipeline(true)}>
          Новая воронка
        </Button>
        {selected && (
          <>
            <Button variant="outline" onClick={() => setSettings(true)}>
              <Settings2 className="size-4" />
              Этапы
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Новая сделка
            </Button>
          </>
        )}
      </div>
      <FormError error={move.error} />
      <FormError error={action.error} />
      {selected ? (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) =>
            setActiveDrag(deals.data.find((d) => d.id === e.active.id) ?? null)
          }
          onDragCancel={() => setActiveDrag(null)}
          onDragEnd={dragEnd}
        >
          <div className="flex min-h-[60dvh] gap-4 overflow-x-auto pb-6">
            {selected.stages.map((stage) => (
              <Column
                key={stage.id}
                stage={stage}
                deals={deals.data.filter(
                  (d) => d.pipelineId === selected.id && d.stageId === stage.id,
                )}
                edit={setEditing}
                moving={move.isPending}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDrag ? (
              <Card className="w-64">
                <h3 className="font-semibold">{activeDrag.title}</h3>
                <p className="mt-2 text-sm">{activeDrag.contact.name}</p>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <Card>Создайте первую воронку.</Card>
      )}
      {creating && selected && (
        <NewDeal pipeline={selected} close={() => setCreating(false)} />
      )}
      {editing && (
        <DealEditor
          id={editing.id}
          pipelines={pipelines.data}
          close={() => setEditing(null)}
          move={moveTo}
        />
      )}
      {settings && selected && (
        <StagesEditor
          pipeline={selected}
          deals={deals.data}
          close={() => setSettings(false)}
        />
      )}
      {newPipeline && (
        <Editor title="Новая воронка" close={() => setNewPipeline(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              action.mutate(
                { path: "/pipelines", body: { name: pipelineName } },
                {
                  onSuccess: (data) => {
                    setPipelineId((data as { id: string }).id);
                    setNewPipeline(false);
                    setPipelineName("");
                  },
                },
              );
            }}
          >
            <Field id="pipeline-name" label="Название воронки">
              <Input
                id="pipeline-name"
                required
                maxLength={120}
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
              />
            </Field>
            <FormError error={action.error} />
            <Button disabled={action.isPending} type="submit">
              Создать воронку
            </Button>
          </form>
        </Editor>
      )}
    </>
  );
}
function Column({
  stage,
  deals,
  edit,
  moving,
}: {
  stage: StageView;
  deals: DealView[];
  edit: (d: DealView) => void;
  moving: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded-2xl border p-3 ${isOver ? "border-primary bg-primary/5" : "border-border bg-muted/40"}`}
      aria-label={`Этап ${stage.name}`}
    >
      <div className="mb-4 flex items-center gap-2 p-1">
        <span
          className={`size-2 rounded-full ${stage.kind === "WON" ? "bg-emerald-500" : stage.kind === "LOST" ? "bg-rose-400" : "bg-primary"}`}
        />
        <h2 className="text-sm font-semibold">{stage.name}</h2>
        <Badge className="ml-auto">{deals.length}</Badge>
      </div>
      <div className="space-y-3">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} edit={() => edit(d)} moving={moving} />
        ))}
        {deals.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            Переместите сделку сюда
          </p>
        )}
      </div>
    </section>
  );
}
function DealCard({
  deal: d,
  edit,
  moving,
}: {
  deal: DealView;
  edit: () => void;
  moving: boolean;
}) {
  const drag = useDraggable({ id: d.id, disabled: moving });
  return (
    <article
      ref={drag.setNodeRef}
      className={`rounded-xl border border-border bg-surface p-4 shadow-xs ${drag.isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="flex-1 text-left text-sm font-semibold hover:text-primary"
          onClick={edit}
        >
          {d.title}
        </button>
        <button
          type="button"
          ref={drag.setActivatorNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          aria-label={`Переместить ${d.title}`}
          className="touch-none text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{d.contact.name}</p>
      {d.isDemo && <Badge className="mt-2">Демо-сделка</Badge>}
      {d.product && (
        <p className="mt-2 text-xs text-muted-foreground">{d.product.name}</p>
      )}
      <p className="mt-4 text-sm font-semibold">
        {amount(d.amount, d.currency)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {d.onHold && <Badge>На паузе</Badge>}
        {d.priority === "HIGH" && (
          <Badge className="text-destructive">Высокий приоритет</Badge>
        )}
        {d.nextActionAt && (
          <Badge
            className={
              !d.closedAt && new Date(d.nextActionAt) < new Date()
                ? "text-destructive"
                : ""
            }
          >
            <Clock className="size-3" />
            {localDate(d.nextActionAt)}
          </Badge>
        )}
      </div>
    </article>
  );
}
function NewDeal({
  pipeline,
  close,
}: {
  pipeline: PipelineView;
  close: () => void;
}) {
  const contacts = useData<ContactView[]>("contacts", "/contacts"),
    products = useData<ProductView[]>("products", "/products");
  const [form, setForm] = useState({
    contactId: "",
    productId: "",
    stageId: pipeline.stages.find((s) => s.kind === "OPEN")?.id ?? "",
    title: "",
    amount: "",
    currency: "RUB",
  });
  const action = useAction();
  return (
    <Editor title="Новая сделка" close={close}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              path: "/deals",
              body: {
                ...form,
                pipelineId: pipeline.id,
                amount: form.amount || null,
                productId: form.productId || null,
              },
            },
            { onSuccess: close },
          );
        }}
      >
        <Field id="new-deal-title" label="Название сделки">
          <Input
            id="new-deal-title"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field id="new-deal-contact" label="Клиент">
          <select
            id="new-deal-contact"
            required
            value={form.contactId}
            className={selectClass}
            onChange={(e) => setForm({ ...form, contactId: e.target.value })}
          >
            <option value="">Выберите клиента</option>
            {contacts.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="new-deal-product" label="Продукт">
          <select
            id="new-deal-product"
            className={selectClass}
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
          >
            <option value="">Не выбран</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="new-deal-stage" label="Начальный этап">
          <select
            id="new-deal-stage"
            className={selectClass}
            value={form.stageId}
            onChange={(e) => setForm({ ...form, stageId: e.target.value })}
          >
            {pipeline.stages
              .filter((s) => s.kind === "OPEN")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="new-deal-amount" label="Сумма (необязательно)">
            <Input
              id="new-deal-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value.replace(",", ".") })
              }
            />
          </Field>
          <Field id="new-deal-currency" label="Валюта">
            <Input
              id="new-deal-currency"
              required
              maxLength={3}
              value={form.currency}
              onChange={(e) =>
                setForm({ ...form, currency: e.target.value.toUpperCase() })
              }
            />
          </Field>
        </div>
        <FormError error={action.error} />
        <Button type="submit" disabled={action.isPending}>
          Создать сделку
        </Button>
      </form>
    </Editor>
  );
}
function DealEditor({
  id,
  pipelines,
  close,
  move,
}: {
  id: string;
  pipelines: PipelineView[];
  close: () => void;
  move: (d: DealView, s: StageView) => void;
}) {
  const query = useData<DealView>("deals", `/deals/${id}`);
  const action = useAction();
  if (!query.data)
    return (
      <Editor title="Карточка сделки" close={close}>
        {query.error ? <p>{query.error.message}</p> : <Loading />}
      </Editor>
    );
  return (
    <DealFields
      key={query.data.version}
      deal={query.data}
      pipelines={pipelines}
      close={close}
      move={move}
      action={action}
    />
  );
}
function DealFields({
  deal: d,
  pipelines,
  close,
  move,
  action,
}: {
  deal: DealView;
  pipelines: PipelineView[];
  close: () => void;
  move: (d: DealView, s: StageView) => void;
  action: ReturnType<typeof useAction>;
}) {
  const [title, setTitle] = useState(d.title),
    [value, setValue] = useState(d.amount ?? ""),
    [hold, setHold] = useState(d.onHold),
    [priority, setPriority] = useState(d.priority),
    [next, setNext] = useState(
      d.nextActionAt
        ? new Date(
            new Date(d.nextActionAt).getTime() -
              new Date().getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    ),
    [reason, setReason] = useState(d.lossReason ?? "");
  return (
    <Editor title="Карточка сделки" close={close} wide>
      <p className="mb-5 text-sm text-muted-foreground">
        {d.contact.name} · {d.product?.name ?? "Продукт не выбран"}
      </p>
      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(
            {
              path: `/deals/${d.id}`,
              method: "PATCH",
              body: {
                version: d.version,
                title,
                amount: value || null,
                onHold: hold,
                priority,
                nextActionAt: next ? new Date(next).toISOString() : null,
                lossReason: reason || null,
              },
            },
            { onSuccess: close },
          );
        }}
      >
        <Field id="deal-title" label="Название">
          <Input
            id="deal-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field id="deal-value" label={`Сумма, ${d.currency}`}>
          <Input
            id="deal-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(",", "."))}
          />
        </Field>
        <Field id="deal-stage" label="Переместить на этап">
          <select
            id="deal-stage"
            className={selectClass}
            value={d.stageId}
            onChange={(e) => {
              const s = pipelines
                .flatMap((p) => p.stages)
                .find((s) => s.id === e.target.value);
              if (s) {
                move(d, s);
                close();
              }
            }}
          >
            {pipelines.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field id="deal-priority" label="Приоритет">
          <select
            id="deal-priority"
            className={selectClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="LOW">Низкий</option>
            <option value="NORMAL">Обычный</option>
            <option value="HIGH">Высокий</option>
          </select>
        </Field>
        <Field id="deal-next" label="Следующий шаг — время компьютера">
          <Input
            id="deal-next"
            type="datetime-local"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={hold}
            onChange={(e) => setHold(e.target.checked)}
          />
          Поставить на паузу
        </label>
        <div className="sm:col-span-2">
          <Field id="deal-reason" label="Причина проигрыша / заметка">
            <Textarea
              id="deal-reason"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
        <FormError error={action.error} />
        <div className="flex gap-3 sm:col-span-2">
          <Button disabled={action.isPending} type="submit">
            Сохранить сделку
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (confirm("Удалить сделку и её историю?"))
                action.mutate(
                  { path: `/deals/${d.id}`, method: "DELETE" },
                  { onSuccess: close },
                );
            }}
          >
            Удалить сделку
          </Button>
        </div>
      </form>
      <h3 className="mt-7 mb-4 font-semibold">История этапов</h3>
      <ol className="space-y-3">
        {d.history?.map((h) => (
          <li className="text-sm text-muted-foreground" key={h.id}>
            {h.fromStage ?? "Создана"} → {h.toStage}
            <span className="ml-3 text-xs">{localDate(h.createdAt)}</span>
          </li>
        ))}
      </ol>
    </Editor>
  );
}
function StagesEditor({
  pipeline: p,
  deals,
  close,
}: {
  pipeline: PipelineView;
  deals: DealView[];
  close: () => void;
}) {
  const [stages, setStages] = useState(
      p.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    ),
    [replacements, setReplacements] = useState<Record<string, string>>({});
  const action = useAction();
  const removed = p.stages.filter((s) => !stages.some((v) => v.id === s.id));
  function reorder(i: number, step: number) {
    const copy = [...stages];
    const other = copy[i + step];
    if (!other) return;
    copy[i + step] = copy[i]!;
    copy[i] = other;
    setStages(copy);
  }
  return (
    <Editor title="Настроить этапы" close={close} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const won = removed.some(
            (r) =>
              deals.some((d) => d.stageId === r.id) &&
              stages.find((s) => s.id === replacements[r.id])?.kind === "WON",
          );
          if (
            won &&
            !confirm(
              "Подтверждаете успешное закрытие сделок, переносимых в этап «Успешно»?",
            )
          )
            return;
          action.mutate(
            {
              path: `/pipelines/${p.id}/stages`,
              method: "PUT",
              body: {
                expectedVersion: p.version,
                confirmWon: won,
                stages: stages.map((s) => ({
                  ...s,
                  id: s.id.startsWith("new-") ? undefined : s.id,
                })),
                replacements,
              },
            },
            { onSuccess: close },
          );
        }}
      >
        {stages.map((s, i) => (
          <div
            key={s.id}
            className="flex flex-wrap gap-2 rounded-xl border border-border p-3"
          >
            <Input
              aria-label={`Название этапа ${i + 1}`}
              className="min-w-32 flex-1"
              required
              value={s.name}
              maxLength={120}
              onChange={(e) =>
                setStages(
                  stages.map((v) =>
                    v.id === s.id ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
            <select
              aria-label={`Тип этапа ${i + 1}`}
              className={`${selectClass} w-36`}
              disabled={deals.some((d) => d.stageId === s.id)}
              value={s.kind}
              onChange={(e) =>
                setStages(
                  stages.map((v) =>
                    v.id === s.id
                      ? { ...v, kind: e.target.value as StageView["kind"] }
                      : v,
                  ),
                )
              }
            >
              <option value="OPEN">Открыт</option>
              <option value="WON">Успешно</option>
              <option value="LOST">Проиграно</option>
            </select>
            <Button
              type="button"
              variant="ghost"
              aria-label="Поднять этап"
              disabled={i === 0}
              onClick={() => reorder(i, -1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="Опустить этап"
              disabled={i === stages.length - 1}
              onClick={() => reorder(i, 1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="Удалить этап"
              onClick={() => setStages(stages.filter((v) => v.id !== s.id))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {removed
          .filter((s) => deals.some((d) => d.stageId === s.id))
          .map((s) => (
            <Field
              key={s.id}
              id={`replacement-${s.id}`}
              label={`Куда перенести сделки из «${s.name}»?`}
            >
              <select
                id={`replacement-${s.id}`}
                required
                className={selectClass}
                value={replacements[s.id] ?? ""}
                onChange={(e) =>
                  setReplacements({ ...replacements, [s.id]: e.target.value })
                }
              >
                <option value="">Выберите существующий этап</option>
                {stages
                  .filter((s) => !s.id.startsWith("new-"))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
          ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setStages([
              ...stages,
              {
                id: `new-${crypto.randomUUID()}`,
                name: "Новый этап",
                kind: "OPEN",
              },
            ])
          }
        >
          Добавить этап
        </Button>
        <FormError error={action.error} />
        <div className="flex flex-wrap gap-3 border-t border-border pt-5">
          <Button type="submit" disabled={action.isPending || !stages.length}>
            Сохранить этапы
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const name = prompt("Новое название воронки", p.name);
              if (name)
                action.mutate(
                  {
                    path: `/pipelines/${p.id}`,
                    method: "PATCH",
                    body: { name },
                  },
                  { onSuccess: close },
                );
            }}
          >
            Переименовать воронку
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={deals.some((d) => d.pipelineId === p.id)}
            onClick={() => {
              if (confirm("Удалить пустую воронку?"))
                action.mutate(
                  { path: `/pipelines/${p.id}`, method: "DELETE" },
                  { onSuccess: close },
                );
            }}
          >
            Удалить воронку
          </Button>
        </div>
      </form>
    </Editor>
  );
}
