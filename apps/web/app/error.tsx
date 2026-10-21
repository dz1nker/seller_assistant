'use client';
import { ErrorNotice } from '../components/feedback';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) { return <ErrorNotice error={new Error('Не удалось открыть страницу. Повторите попытку.')} retry={reset} />; }
