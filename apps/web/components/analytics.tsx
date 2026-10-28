"use client";
import { Card } from "@sales/ui";
import { useData, amount } from "../lib/crm";
import { PageHeading } from "./page-heading";
import { Loading, ErrorNotice } from "./feedback";
interface Overview {
  deals: {
    demo: number;
    total: number;
    open: number;
    won: number;
    lost: number;
    unknownAmount: number;
    wonAmounts: Record<string, string>;
    lossReasons: string[];
  };
  tasks: number;
  ai: {
    generated: number;
    applied: number;
    sent: number;
    demoSent: number;
    inputTokens: number | null;
    outputTokens: number | null;
    cost: string | null;
  };
}
export function Analytics() {
  const query = useData<Overview>("analytics", "/analytics/overview");
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    );
  const d = query.data;
  return (
    <>
      <PageHeading
        title="Аналитика"
        description="Фактические сделки, задачи и действия с рекомендациями. Продажи не приписываются ИИ автоматически."
      />
      <p className="mb-5 text-sm text-muted-foreground">
        Демо-сделки считаются отдельно: {d.deals.demo}.
      </p>
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Всего сделок", d.deals.total],
          ["В работе", d.deals.open],
          ["Успешно", d.deals.won],
          ["Проиграно", d.deals.lost],
        ].map(([label, count]) => (
          <Card key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-4 text-3xl font-semibold">{count}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Суммы успешных сделок</h2>
          {Object.entries(d.deals.wonAmounts).map(([currency, value]) => (
            <p key={currency} className="mt-4 text-2xl font-semibold">
              {amount(value, currency)}
            </p>
          ))}
          {Object.keys(d.deals.wonAmounts).length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Нет закрытых сделок с указанной суммой.
            </p>
          )}
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Без указанной суммы: {d.deals.unknownAmount}. Разные валюты не
            складываются.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Рекомендации</h2>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Сгенерировано", d.ai.generated],
              ["Вставлено пользователем", d.ai.applied],
              ["Отправлено в Telegram", d.ai.sent],
              ["Сохранено в демо", d.ai.demoSent],
            ].map(([label, count]) => (
              <div key={label} className="flex justify-between">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
            Генерация, вставка и подтверждённая отправка считаются отдельно.
            Отправка в демо остаётся демонстрационным событием, а не сообщением
            в Telegram.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Использование AI</h2>
          <p className="mt-4 text-sm">
            Входные токены: {d.ai.inputTokens ?? "нет данных"}
          </p>
          <p className="mt-2 text-sm">
            Выходные токены: {d.ai.outputTokens ?? "нет данных"}
          </p>
          <p className="mt-2 text-sm">
            Расчётная стоимость:{" "}
            {d.ai.cost === null
              ? "не настроена / нет данных"
              : `${d.ai.cost} USD`}
          </p>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Стоимость рассчитывается только при заданных ценах провайдера.
            Демо-алгоритм LLM не вызывает.
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Причины проигрыша</h2>
          {d.deals.lossReasons.length ? (
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {d.deals.lossReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Причины пока не указаны.
            </p>
          )}
          <p className="mt-5 text-sm">Открытых задач: {d.tasks}</p>
        </Card>
      </div>
    </>
  );
}
