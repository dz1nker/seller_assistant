'use client';
import { Badge, Card } from '@sales/ui';
import { LockKeyhole, Send, Users } from 'lucide-react';
import { useUser, useWorkspace } from '../lib/queries';
import { Loading, ErrorNotice } from './feedback';
import { PageHeading } from './page-heading';
export function Settings() {
  const workspace = useWorkspace();
  const user = useUser();
  if (workspace.isPending) return <Loading />;
  if (workspace.error) return <ErrorNotice error={workspace.error} retry={() => void workspace.refetch()} />;
  return <><PageHeading eyebrow="УПРАВЛЕНИЕ ПРОСТРАНСТВОМ" title="Настройки" description="Участники, безопасность и подключения вашего рабочего пространства." />
    <div className="grid items-start gap-6 xl:grid-cols-2"><Card><div className="mb-6 flex items-center gap-3"><Users className="size-5 text-primary" /><h2 className="font-semibold">Участники</h2><Badge className="ml-auto">{workspace.data.members.length}</Badge></div><ul className="divide-y divide-border">{workspace.data.members.map(member => <li key={member.userId} className="flex items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium">{member.name}{member.userId === user.data?.id ? ' (вы)' : ''}</p><p className="mt-1 text-xs text-muted-foreground">{member.role === 'OWNER' ? 'Владелец' : member.role === 'ADMIN' ? 'Администратор' : 'Участник'}</p></div></li>)}</ul><p className="mt-5 text-xs leading-relaxed text-muted-foreground">Участники получают доступ согласно своей роли. Приглашение новых участников пока недоступно.</p></Card>
      <Card><div className="mb-5 flex items-center gap-3"><Send className="size-5 text-primary" /><h2 className="font-semibold">Telegram</h2><Badge className="ml-auto">Не подключён</Badge></div><p className="text-sm leading-7 text-muted-foreground">Подключение личного аккаунта пока недоступно. Сейчас приложение не запрашивает код или пароль Telegram и не читает ваши диалоги.</p></Card>
      <Card className="xl:col-span-2"><div className="mb-5 flex items-center gap-3"><LockKeyhole className="size-5 text-primary" /><h2 className="font-semibold">Защита аккаунта</h2></div><div className="grid gap-5 text-sm md:grid-cols-3"><div><p className="font-medium">Пароли</p><p className="mt-2 text-muted-foreground">Хранятся в защищённом виде</p></div><div><p className="font-medium">Сессии</p><p className="mt-2 text-muted-foreground">Защищённый вход и выход</p></div><div><p className="font-medium">Доступ к данным</p><p className="mt-2 text-muted-foreground">Рабочие пространства и роли</p></div></div></Card></div>
  </>;
}
