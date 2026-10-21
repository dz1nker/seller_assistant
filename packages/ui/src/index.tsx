import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-50 min-h-11 px-4', {
  variants: { variant: {
    default: 'bg-primary text-white hover:bg-primary/90 shadow-sm',
    outline: 'border border-border bg-surface text-foreground hover:bg-muted',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  } }, defaultVariants: { variant: 'default' },
});
export function Button({ className, variant, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}
export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('flex h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50 aria-invalid:border-destructive', className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn('w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10', className)} {...props} />;
}
export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-border bg-surface p-6 shadow-xs', className)} {...props} />;
}
export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground', className)}>{children}</span>;
}
export function Field({ label, id, error, children, hint }: { label: string; id: string; error?: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-2"><label htmlFor={id} className="block text-sm font-medium">{label}</label>{children}
    {error ? <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}</div>;
}
