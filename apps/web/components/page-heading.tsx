import { Badge } from '@sales/ui';
export function PageHeading({ eyebrow, title, description, badge }: { eyebrow?: string; title: string; description: string; badge?: string }) {
  return <div className="mb-8"><div className="mb-3 flex flex-wrap items-center gap-3">{eyebrow && <span className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">{eyebrow}</span>}{badge && <Badge>{badge}</Badge>}</div><h1 className="text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div>;
}
