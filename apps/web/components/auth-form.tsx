'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, LoaderCircle, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { Button, Field, Input } from '@sales/ui';
import { loginSchema, registerSchema, type CurrentUser } from '@sales/shared';
import { api } from '../lib/api';
import { useState } from 'react';
import { z } from 'zod';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const registering = mode === 'register';
  const router = useRouter();
  const client = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const schema = loginSchema.extend({
    name: registering ? registerSchema.shape.name : z.string().optional(),
    workspaceName: registering ? registerSchema.shape.workspaceName : z.string().optional(),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema),
    defaultValues: { name: '', workspaceName: '', email: '', password: '' } });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api<CurrentUser>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(registering ? values : { email: values.email, password: values.password }) }),
    onSuccess: user => { client.clear(); client.setQueryData(['user'], user); router.replace('/today'); },
  });
  return <main className="grid min-h-dvh lg:grid-cols-2">
    <section className="relative hidden flex-col overflow-hidden bg-[#eeeafa] p-12 text-[#29213c] lg:flex xl:p-16">
      <Link href="/login" className="flex items-center gap-3 text-xl font-bold"><span className="flex size-10 items-center justify-center rounded-xl bg-[#7152e8] text-white"><Sparkles className="size-5" /></span>Sales Copilot</Link>
      <div className="my-auto max-w-lg py-16"><p className="mb-6 text-xs font-bold tracking-[0.2em] text-[#7152e8]">БОЛЬШЕ ВНИМАНИЯ КЛИЕНТАМ</p>
        <h1 className="text-5xl leading-[1.15] font-semibold tracking-tight">Продажи начинаются<br />с хорошего диалога.</h1>
        <p className="mt-6 text-lg leading-relaxed text-[#736a86]">Одно пространство для вашего бизнеса.<br />Понятный контекст. Продуманный следующий шаг.</p>
        <div className="mt-10 rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#eeeafa] p-3"><MessageCircle className="size-5 text-[#7152e8]" /></div><div><p className="font-semibold">Ваш бизнес — в центре</p><p className="mt-1 text-sm text-[#736a86]">Люди, продукты и договорённости</p></div></div>
          <div className="mt-5 flex gap-2 border-t border-[#e5dff4] pt-5 text-sm text-[#736a86]"><Check className="size-5 shrink-0 text-[#7152e8]" />Вы решаете, что и когда отправить клиенту</div></div>
      </div><div className="flex items-center gap-2 text-xs text-[#736a86]"><ShieldCheck className="size-4" />Данные рабочих пространств изолированы</div><div className="dot-grid pointer-events-none absolute -right-8 bottom-0 size-48 opacity-30" />
    </section>
    <section className="flex items-center justify-center bg-surface px-6 py-12"><div className="w-full max-w-sm">
      <div className="mb-10 flex items-center gap-2 text-lg font-bold lg:hidden"><Sparkles className="text-primary" />Sales Copilot</div>
      <p className="mb-3 text-xs font-semibold tracking-widest text-primary">ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО</p>
      <h2 className="text-3xl font-semibold tracking-tight">{registering ? 'Начнём знакомство' : 'С возвращением'}</h2>
      <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">{registering ? 'Создайте аккаунт и пространство для вашего бизнеса.' : 'Войдите, чтобы продолжить работу с вашим бизнесом.'}</p>
      <form noValidate onSubmit={form.handleSubmit(values => mutation.mutate(values))} className="space-y-5">
        {registering && <><Field id="name" label="Ваше имя" error={form.formState.errors.name?.message}><Input id="name" autoComplete="name" {...form.register('name')} aria-invalid={!!form.formState.errors.name} /></Field>
          <Field id="workspaceName" label="Название бизнеса" error={form.formState.errors.workspaceName?.message}><Input id="workspaceName" placeholder="Например, Студия Анны" autoComplete="organization" {...form.register('workspaceName')} aria-invalid={!!form.formState.errors.workspaceName} /></Field></>}
        <Field id="email" label="Email" error={form.formState.errors.email?.message}><Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register('email')} aria-invalid={!!form.formState.errors.email} /></Field>
        <Field id="password" label="Пароль" error={form.formState.errors.password?.message} hint={registering ? 'От 12 символов, не более 72 байт. Используйте уникальный пароль.' : undefined}>
          <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} {...form.register('password')} aria-invalid={!!form.formState.errors.password} />
        </Field>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Показать пароль</label>
        {mutation.error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{mutation.error.message}</p>}
        <Button className="w-full" type="submit" disabled={mutation.isPending}>{mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <>{registering ? 'Создать аккаунт' : 'Войти'}<ArrowRight className="size-4" /></>}</Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">{registering ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'} <Link className="font-semibold text-primary hover:underline" href={registering ? '/login' : '/register'}>{registering ? 'Войти' : 'Зарегистрироваться'}</Link></p>
    </div></section>
  </main>;
}
