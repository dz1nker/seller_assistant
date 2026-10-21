import Link from 'next/link';
import { ChartNoAxesCombined, MessageSquare, ArrowRight } from 'lucide-react';
import { Button, Card } from '@sales/ui';
import { PageHeading } from './page-heading';
export function Upcoming({ feature }: { feature: 'conversations' | 'analytics' }) {
  const conversations = feature === 'conversations';
  const Icon = conversations ? MessageSquare : ChartNoAxesCombined;
  return <><PageHeading title={conversations ? 'Диалоги' : 'Аналитика'} description={conversations ? 'Будущее место для общения с клиентами и работы с контекстом сделки.' : 'Данные о продажах и результатах работы появятся после подключения CRM.'} badge="Следующий этап" />
    <Card className="flex min-h-[380px] flex-col items-center justify-center px-6 text-center"><span className="mb-6 rounded-2xl bg-primary/10 p-5"><Icon className="size-8 text-primary" /></span><h2 className="text-xl font-semibold">{conversations ? 'Мессенджер ещё не подключён' : 'Пока нет данных для отчёта'}</h2><p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">{conversations ? 'Чтение и отправка сообщений пока недоступны. Настоящие переписки сейчас не загружаются.' : 'Задачи и аналитика пока недоступны. Отчёт появится, когда будет доступна работа со сделками.'}</p><Button variant="outline" asChild className="mt-6"><Link href={conversations ? '/settings' : '/business'}>{conversations ? 'Настройки подключений' : 'Настроить бизнес'}<ArrowRight className="size-4" /></Link></Button></Card>
  </>;
}
