"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  MessageSquare,
  Columns3,
  ChartNoAxesCombined,
  BriefcaseBusiness,
  Settings2,
  Users,
  Sparkles,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Badge, Button, cn } from "@sales/ui";
import { useUser, useWorkspace } from "../lib/queries";
import { api, ApiError } from "../lib/api";
import { ru } from "../lib/i18n";
import { ErrorNotice, Loading } from "./feedback";
import { Realtime } from "./realtime";

const navigation = [
  ["/today", ru.nav.today, CalendarDays],
  ["/conversations", ru.nav.conversations, MessageSquare],
  ["/contacts", "Клиенты", Users],
  ["/pipeline", ru.nav.pipeline, Columns3],
  ["/analytics", ru.nav.analytics, ChartNoAxesCombined],
  ["/business", ru.nav.business, BriefcaseBusiness],
  ["/settings", ru.nav.settings, Settings2],
] as const;

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const user = useUser();
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [path]);
  const logout = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      client.clear();
      router.replace("/login");
    },
  });
  const active = navigation.find(([href]) => path === href);
  return (
    <div className="min-h-dvh">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-primary focus:p-3 focus:text-white"
      >
        Перейти к содержимому
      </a>
      {open && (
        <button
          aria-label="Закрыть навигацию"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        aria-label="Основная навигация"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface p-5 transition-transform lg:visible lg:translate-x-0",
          open ? "visible translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="mb-9 flex items-center justify-between">
          <Link
            href="/today"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
              <Sparkles className="size-5" />
            </span>
            Sales Copilot
          </Link>
          <Button
            variant="ghost"
            className="px-2 lg:hidden"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="mb-7 flex items-center gap-3 rounded-xl border border-border p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {workspace.data?.name.charAt(0).toUpperCase() ?? "…"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {workspace.data?.name ?? "Рабочее пространство"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Ваш бизнес
            </p>
          </div>
        </div>
        <p className="mb-3 px-3 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
          РАБОЧЕЕ ПРОСТРАНСТВО
        </p>
        <nav className="space-y-1">
          {navigation.map(([href, title, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={href === path ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                href === path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {title}
              {href === path && (
                <span className="ml-auto size-1.5 rounded-full bg-primary" />
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-8">
          <div className="mb-5 rounded-xl bg-muted/70 p-4">
            <ShieldCheck className="mb-2 size-5 text-primary" />
            <p className="text-xs font-semibold">Под вашим контролем</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              ИИ предлагает. Решение и отправка всегда за вами.
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-border pt-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {user.data?.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {user.data?.name}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {user.data?.role === "OWNER"
                  ? "Владелец"
                  : user.data?.role === "ADMIN"
                    ? "Администратор"
                    : "Участник"}
              </p>
            </div>
            <Button
              variant="ghost"
              className="px-2"
              aria-label="Выйти из аккаунта"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
          {logout.error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {logout.error.message}
            </p>
          )}
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex h-20 items-center justify-between gap-3 border-b border-border bg-surface px-5 md:px-9">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              aria-label="Открыть меню"
              aria-expanded={open}
              className="px-2 lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Рабочее пространство
            </span>
            <ChevronRight className="hidden size-3 text-muted-foreground sm:inline" />
            <span className="text-sm font-medium">{active?.[1]}</span>
          </div>
          <div className="flex items-center gap-4">
            <Badge className="hidden sm:inline-flex">
              <span className="size-1.5 rounded-full bg-primary" />
              Sales Copilot
            </Badge>
            <Button
              variant="ghost"
              className="px-3"
              aria-label="Сменить тему"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {mounted && resolvedTheme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
          </div>
        </header>
        <main
          id="content"
          className="mx-auto max-w-[1500px] p-5 md:p-9 lg:p-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const router = useRouter();
  const unauthorized =
    user.error instanceof ApiError && user.error.status === 401;
  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [unauthorized, router]);
  if (user.isPending || unauthorized) return <Loading />;
  if (user.error)
    return <ErrorNotice error={user.error} retry={() => void user.refetch()} />;
  return (
    <WorkspaceShell>
      <Realtime />
      {children}
    </WorkspaceShell>
  );
}
