import { z } from "zod";
export const idSchema = z.uuid();
export const moneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Укажите сумму с точностью до копеек")
  .nullable()
  .default(null);
export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .default("RUB");
export const contactSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    username: z.string().trim().max(100).nullable().default(null),
    notes: z.string().max(8000).default(""),
  })
  .strict();
export const productSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(8000).default(""),
    amount: moneySchema,
    currency: currencySchema,
    format: z.string().max(500).default(""),
    duration: z.string().max(500).default(""),
    audience: z.string().max(2000).default(""),
    limitations: z.string().max(2000).default(""),
    outcomes: z.string().max(2000).default(""),
    paymentOptions: z.string().max(2000).default(""),
    faq: z.string().max(4000).default(""),
    cases: z.string().max(4000).default(""),
  })
  .strict();
export const businessProfileSchema = z
  .object({
    specialization: z.string().max(2000).default(""),
    experience: z.string().max(2000).default(""),
    audience: z.string().max(2000).default(""),
    positioning: z.string().max(2000).default(""),
    approach: z.string().max(2000).default(""),
    advantages: z.string().max(2000).default(""),
    address: z.enum(["ты", "вы"]).default("вы"),
    tone: z.enum(["formal", "friendly"]).default("friendly"),
    emoji: z.boolean().default(false),
    responseLength: z.enum(["short", "medium", "long"]).default("medium"),
    examples: z.string().max(4000).default(""),
    forbidden: z.string().max(2000).default(""),
  })
  .strict();
export const privacySchema = z
  .object({
    mode: z.enum(["EXCLUDED", "CANDIDATE", "CLIENT"]),
    contactId: idSchema.nullable().optional(),
    retentionDays: z.number().int().min(1).max(365).optional(),
  })
  .strict();
export const conversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    contactId: idSchema.nullable().default(null),
  })
  .strict();
export const sendSchema = z
  .object({
    key: idSchema,
    text: z.string().trim().min(1).max(4096),
    replyToExternalId: z
      .string()
      .regex(/^-?\d+$/)
      .optional(),
    suggestionId: idSchema.optional(),
  })
  .strict();
export const dealSchema = z
  .object({
    contactId: idSchema,
    productId: idSchema.nullable().default(null),
    pipelineId: idSchema,
    stageId: idSchema,
    title: z.string().trim().min(1).max(200),
    amount: moneySchema,
    currency: currencySchema,
    conversationId: idSchema.optional(),
  })
  .strict();
export const dealPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    amount: moneySchema.removeDefault().optional(),
    currency: currencySchema.removeDefault().optional(),
    onHold: z.boolean().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
    nextActionAt: z.iso.datetime().nullable().optional(),
    lossReason: z.string().max(2000).nullable().optional(),
    version: z.number().int().min(0),
  })
  .strict();
export const moveSchema = z
  .object({
    stageId: idSchema,
    version: z.number().int().min(0),
    confirmWon: z.boolean().default(false),
    lossReason: z.string().max(2000).nullable().default(null),
  })
  .strict();
export const pipelineSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();
export const stagesSchema = z
  .object({
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    confirmWon: z.boolean().default(false),
    stages: z
      .array(
        z
          .object({
            id: idSchema.optional(),
            name: z.string().trim().min(1).max(120),
            kind: z.enum(["OPEN", "WON", "LOST"]),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    replacements: z.record(idSchema, idSchema).default({}),
  })
  .strict();
export const knowledgeSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(20000),
  })
  .strict();
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    conversationId: idSchema.nullable().default(null),
    dealId: idSchema.nullable().default(null),
    dueAt: z.iso.datetime().nullable().default(null),
    priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  })
  .strict();
export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    dueAt: z.iso.datetime().nullable().optional(),
    done: z.boolean().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
    version: z.number().int().min(0),
  })
  .strict();
export interface ContactView {
  isDemo: boolean;
  id: string;
  name: string;
  username: string | null;
  notes: string;
  updatedAt: string;
}
export interface ProductView extends z.infer<typeof productSchema> {
  isDemo: boolean;
  id: string;
  updatedAt: string;
}
export interface StageView {
  id: string;
  name: string;
  position: number;
  kind: "OPEN" | "WON" | "LOST";
}
export interface PipelineView {
  version: string;
  id: string;
  name: string;
  stages: StageView[];
}
export interface DealView {
  isDemo: boolean;
  id: string;
  contactId: string;
  productId: string | null;
  pipelineId: string;
  stageId: string;
  title: string;
  amount: string | null;
  currency: string;
  status: "OPEN" | "WON" | "LOST";
  onHold: boolean;
  priority: string;
  nextActionAt: string | null;
  lossReason: string | null;
  version: number;
  closedAt: string | null;
  updatedAt: string;
  contact: ContactView;
  product: ProductView | null;
  conversations: { conversationId: string }[];
  history?: {
    id: string;
    fromStage: string | null;
    toStage: string;
    createdAt: string;
  }[];
}
export interface ConversationView {
  id: string;
  source: "DEMO" | "TELEGRAM" | "INSTAGRAM";
  connectionId: string | null;
  title: string;
  username: string | null;
  chatType: string;
  mode: "EXCLUDED" | "CANDIDATE" | "CLIENT";
  contactId: string | null;
  version: number;
  unreadCount: number;
  waitingForReply: boolean;
  retentionDays: number;
  lastActivityAt: string;
  contact: ContactView | null;
  dealLinks: { deal: DealView }[];
}
export interface MessageView {
  id: string;
  conversationId: string;
  direction: "IN" | "OUT";
  text: string;
  kind: string;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "UNCERTAIN";
  error: string | null;
  sentAt: string;
  editedAt: string | null;
  replyToExternalId: string | null;
  externalMessageId: string | null;
  commandId: string | null;
  suggestionId: string | null;
}
export interface TaskView {
  id: string;
  title: string;
  dueAt: string | null;
  doneAt: string | null;
  priority: string;
  version: number;
  conversationId: string | null;
  dealId: string | null;
}
export interface KnowledgeView {
  id: string;
  title: string;
  text: string;
  updatedAt: string;
}
export interface NotificationView {
  id: string;
  title: string;
  readAt: string | null;
  createdAt: string;
}
