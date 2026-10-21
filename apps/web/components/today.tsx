'use client';
import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, Check, CheckCheck, Layers3, MessageSquare, PlugZap, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, Card } from '@sales/ui';
import { useUser, useWorkspace } from '../lib/queries';
import { ErrorNotice, Loading } from './feedback';
import { PageHeading } from './page-heading';
export function Today() {
  const user = useUser();
  const workspace = useWorkspace();
  if (workspace.isPending) return <Loading />;
  if (workspace.error) return <ErrorNotice error={workspace.error} retry={() => void workspace.refetch()} />;
  const data = workspace.data;
  return <>
    <PageHeading eyebrow={new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', timeZone: data.timezone }).format(new Date()).toUpperCase()} title={`Добро пожаловать, ${user.data?.name ?? ''}`} description="Ваше пространство готово. Начните с информации о бизнесе — она станет основой для работы с клиентами." />
    <section className="relative mb-7 overflow-hidden rounded-2xl border border-primary/15 bg-primary/5 p-7 md:p-9"><div className="relative z-10 max-w-xl"><Badge className="mb-5 bg-surface text-primary"><Sparkles className="size-3" />ПЕРВЫЕ ШАГИ</Badge><h2 className="text-2xl font-semibold tracking-tight">Всё начинается с вашего бизнеса</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Расскажите, чем вы занимаетесь и кому помогаете. Информация сохранится в вашем рабочем пространстве.</p><Button asChild className="mt-6"><Link href="/business">Настроить мой бизнес<ArrowRight className="size-4" /></Link></Button></div><BriefcaseBusiness aria-hidden className="absolute -right-5 bottom-0 size-48 -rotate-12 text-primary/10 md:right-10" /></section>
    <div className="mb-7 grid gap-5 sm:grid-cols-3">{[
      { Icon: BriefcaseBusiness, label: 'Рабочее пространство', value: data.name, detail: `${data.members.length} участник · изолированные данные` },
      { Icon: Layers3, label: 'Структура продаж', value: `${data.pipelines[0]?.stages.length ?? 0} этапов`, detail: 'Начальная воронка создана' },
      { Icon: PlugZap, label: 'Подключения', value: 'Не подключены', detail: 'Telegram пока недоступен' },
    ].map(({ Icon, label, value, detail }) => <Card key={label}><div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" />{label}</div><p className="truncate text-lg font-semibold">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></Card>)}</div>
    <div className="grid gap-7 xl:grid-cols-[1.4fr_1fr]"><Card><div className="flex items-center justify-between"><h2 className="font-semibold">Подготовка пространства</h2><Badge>1 из 3</Badge></div><ol className="mt-6 space-y-0">
      <li className="flex gap-4 pb-6"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="size-4" /></span><div><p className="text-sm font-medium">Создать рабочее пространство</p><p className="mt-1 text-xs text-muted-foreground">Аккаунт и начальная воронка готовы</p></div></li>
      <li className="flex gap-4 border-t border-border py-6"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary">2</span><div><Link href="/business" className="text-sm font-medium text-primary hover:underline">Рассказать о бизнесе</Link><p className="mt-1 text-xs text-muted-foreground">Название, описание и часовой пояс</p></div></li>
      <li className="flex gap-4 border-t border-border pt-6"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">3</span><div><p className="text-sm font-medium">Подключить мессенджер</p><p className="mt-1 text-xs text-muted-foreground">Будет доступно после реализации Telegram Gateway</p></div></li>
    </ol></Card><Card className="flex flex-col"><div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-muted"><MessageSquare className="size-5 text-muted-foreground" /></div><h2 className="font-semibold">Место для важных диалогов</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Здесь появятся ваши задачи и напоминания. Сейчас можно настроить бизнес и посмотреть структуру воронки.</p><div className="mt-auto flex gap-2 pt-6 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-primary" />Личные переписки не будут передаваться ИИ по умолчанию.</div><Button asChild variant="outline" className="mt-5"><Link href="/pipeline">Посмотреть воронку<ArrowRight className="size-4" /></Link></Button></Card></div>
    <p className="mt-7 flex items-center justify-center gap-2 text-xs text-muted-foreground"><CheckCheck className="size-4" />Этап Foundation · внешние сервисы пока не подключены</p>
  </>;
}
