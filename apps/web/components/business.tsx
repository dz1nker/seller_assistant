"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { Button, Card, Field, Input, Textarea } from "@sales/ui";
import {
  workspacePatchSchema,
  type WorkspacePatch,
  type WorkspaceView,
} from "@sales/shared";
import { useUser, useWorkspace } from "../lib/queries";
import { api } from "../lib/api";
import { Loading, ErrorNotice } from "./feedback";
import { PageHeading } from "./page-heading";
import { BusinessCatalog } from "./business-catalog";
export function Business() {
  const workspace = useWorkspace();
  const user = useUser();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<WorkspacePatch>({
    resolver: zodResolver(workspacePatchSchema),
    defaultValues: { name: "", description: "", timezone: "Europe/Minsk" },
  });
  useEffect(() => {
    if (workspace.data)
      form.reset({
        name: workspace.data.name,
        description: workspace.data.description,
        timezone: workspace.data.timezone,
      });
  }, [workspace.data, form]);
  const mutation = useMutation({
    mutationFn: (data: WorkspacePatch) =>
      api<WorkspaceView>("/workspaces/current", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      client.setQueryData(["workspace"], data);
      form.reset({
        name: data.name,
        description: data.description,
        timezone: data.timezone,
      });
      setSaved(true);
    },
  });
  if (workspace.isPending) return <Loading />;
  if (workspace.error)
    return (
      <ErrorNotice
        error={workspace.error}
        retry={() => void workspace.refetch()}
      />
    );
  const canEdit = user.data?.role === "OWNER" || user.data?.role === "ADMIN";
  return (
    <>
      <PageHeading
        eyebrow="КОНТЕКСТ ВАШЕГО БИЗНЕСА"
        title="Мой бизнес"
        description="Расскажите о своей работе. Эта информация доступна только участникам вашего рабочего пространства."
      />
      <div className="grid items-start gap-7 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Основная информация</h2>
          <p className="mb-7 text-sm text-muted-foreground">
            Изменения сохраняются в вашем рабочем пространстве.
          </p>
          <form
            noValidate
            onSubmit={form.handleSubmit((data) => {
              setSaved(false);
              mutation.mutate(data);
            })}
            onChange={() => setSaved(false)}
            className="space-y-6"
          >
            <fieldset
              disabled={!canEdit || mutation.isPending}
              className="space-y-6 disabled:opacity-70"
            >
              <Field
                id="businessName"
                label="Название бизнеса"
                error={form.formState.errors.name?.message}
              >
                <Input
                  id="businessName"
                  {...form.register("name")}
                  aria-invalid={!!form.formState.errors.name}
                />
              </Field>
              <Field
                id="description"
                label="О чём ваш бизнес"
                error={form.formState.errors.description?.message}
                hint="Чем вы занимаетесь, кому помогаете и какой подход используете."
              >
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Расскажите о своей специализации и клиентах…"
                  {...form.register("description")}
                  aria-invalid={!!form.formState.errors.description}
                />
              </Field>
              <Field
                id="timezone"
                label="Часовой пояс"
                error={form.formState.errors.timezone?.message}
                hint="Идентификатор IANA, например Europe/Minsk или Europe/Moscow."
              >
                <Input
                  id="timezone"
                  list="timezones"
                  {...form.register("timezone")}
                  aria-invalid={!!form.formState.errors.timezone}
                />
                <datalist id="timezones">
                  <option value="Europe/Minsk" />
                  <option value="Europe/Moscow" />
                  <option value="Europe/London" />
                  <option value="Asia/Almaty" />
                  <option value="Etc/UTC" />
                </datalist>
              </Field>
            </fieldset>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
              <Button
                type="submit"
                disabled={
                  !canEdit || !form.formState.isDirty || mutation.isPending
                }
              >
                {mutation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Сохранить изменения
              </Button>
              <span
                role="status"
                className="flex items-center gap-2 text-xs text-emerald-600"
              >
                {saved && (
                  <>
                    <Check className="size-4" />
                    Изменения сохранены
                  </>
                )}
              </span>
            </div>
            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                Изменять настройки могут владелец и администраторы.
              </p>
            )}
          </form>
        </Card>
        <div className="space-y-6">
          <Card>
            <ShieldCheck className="mb-4 size-6 text-primary" />
            <h2 className="font-semibold">Вы управляете контекстом</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Сохранение описания бизнеса не включает ИИ-анализ и не отправляет
              информацию внешним сервисам.
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold">Дальше — больше деталей</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Добавьте продукты, материалы и предпочтения в разделах ниже. Для
              Telegram AI-анализ по умолчанию запрещён.
            </p>
          </Card>
        </div>
      </div>
      <BusinessCatalog />
    </>
  );
}
