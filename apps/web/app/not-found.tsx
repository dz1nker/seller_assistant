import Link from 'next/link';
export default function NotFound() { return <main className="flex min-h-dvh flex-col items-center justify-center gap-5 p-6"><h1 className="text-3xl font-semibold">Страница не найдена</h1><Link href="/today" className="text-primary hover:underline">Перейти в рабочее пространство</Link></main>; }
