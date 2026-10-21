'use client';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import { Button, Card } from '@sales/ui';
export function Loading() { return <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />Загружаем рабочее пространство…</div>; }
export function ErrorNotice({ error, retry }: { error: Error; retry: () => void }) {
  return <Card className="mx-auto my-12 max-w-lg space-y-4"><AlertCircle className="text-destructive" /><h2 className="font-semibold">Не удалось загрузить данные</h2><p role="alert" className="text-sm text-muted-foreground">{error.message}</p><Button variant="outline" onClick={retry}>Попробовать снова</Button></Card>;
}
