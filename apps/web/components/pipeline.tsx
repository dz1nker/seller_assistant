'use client';
import { Badge, Card } from '@sales/ui';
import { Layers3 } from 'lucide-react';
import { useWorkspace } from '../lib/queries';
import { Loading, ErrorNotice } from './feedback';
import { PageHeading } from './page-heading';
export function Pipeline() {
  const workspace = useWorkspace();
  if (workspace.isPending) return <Loading />;
  if (workspace.error) return <ErrorNotice error={workspace.error} retry={() => void workspace.refetch()} />;
  return <><PageHeading eyebrow="СТРУКТУРА ПРОДАЖ" title="Воронка" description="Начальные этапы уже сохранены в вашем Workspace. Создание и перемещение сделок пока недоступны." badge="Структура · без сделок" />
    {workspace.data.pipelines.map(pipeline => <Card key={pipeline.id} className="overflow-hidden"><div className="mb-6 flex items-center gap-3"><Layers3 className="size-5 text-primary" /><h2 className="font-semibold">{pipeline.name}</h2><Badge>{pipeline.stages.length} этапов</Badge></div><ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pipeline.stages.map(stage => <li key={stage.id} className="rounded-xl border border-border bg-background p-4"><div className="flex items-center gap-3"><span className={`size-2 rounded-full ${stage.kind === 'WON' ? 'bg-emerald-500' : stage.kind === 'LOST' ? 'bg-rose-400' : 'bg-primary/70'}`} /><span className="text-sm font-medium">{stage.name}</span></div><p className="mt-4 pl-5 text-xs text-muted-foreground">Этап {stage.position + 1}</p></li>)}</ol></Card>)}
  </>;
}
