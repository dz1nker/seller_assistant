import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email().max(254).trim().toLowerCase(),
  password: z.string().min(12, 'Минимум 12 символов').max(72, 'Максимум 72 символа')
    .refine(value => new TextEncoder().encode(value).length <= 72, 'Пароль должен занимать не более 72 байт'),
}).strict();
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2, 'Укажите имя').max(100),
  workspaceName: z.string().trim().min(2, 'Укажите название бизнеса').max(120),
}).strict();
export const workspacePatchSchema = z.object({
  name: z.string().trim().min(2, 'Минимум 2 символа').max(120),
  description: z.string().trim().max(4000),
  timezone: z.string().max(64).refine(value => {
    try { new Intl.DateTimeFormat('ru', { timeZone: value }); return true; } catch { return false; }
  }, 'Неизвестный часовой пояс'),
}).strict();
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type WorkspacePatch = z.infer<typeof workspacePatchSchema>;
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';
export interface CurrentUser {
  id: string; email: string; name: string;
  workspaceId: string; role: Role;
}
export interface WorkspaceView {
  id: string; name: string; description: string; timezone: string; createdAt: string;
  members: { userId: string; name: string; role: Role }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string; position: number; kind: string }[] }[];
}
export const defaultStages = [
  ['Новый лид', 'OPEN'], ['Выявление потребности', 'OPEN'], ['Презентация', 'OPEN'],
  ['Возражения', 'OPEN'], ['Решение / оплата', 'OPEN'], ['Успешно', 'WON'], ['Проиграно', 'LOST'],
] as const;
