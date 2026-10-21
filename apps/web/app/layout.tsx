import type { Metadata } from 'next';
import { Providers } from '../components/providers';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Sales Copilot', template: '%s · Sales Copilot' }, description: 'Рабочее пространство для ваших продаж и диалогов' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>;
}
