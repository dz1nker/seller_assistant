import { z } from "zod";
export const authStepSchema = z
  .object({
    connectionId: z.uuid(),
    kind: z.enum(["phone", "code", "password", "email", "emailCode"]),
    value: z.string().min(1).max(256),
  })
  .strict();
export interface ConnectionView {
  id: string;
  channel: string;
  status: string;
  label: string;
  accountId: string | null;
  auth?: { state: string; link?: string; error?: string };
  capabilities?: { text: boolean; replies: boolean; attachments: boolean };
  configured?: boolean;
}
export interface ChannelCapabilities {
  text: boolean;
  replies: boolean;
  attachments: boolean;
}
export interface SendMessageInput {
  connectionId: string;
  workspaceId: string;
  chatId: string;
  commandId: string;
  attempt: number;
  resume: boolean;
  text: string;
  replyTo?: string;
}
export interface SendMessageResult {
  status: "SENDING" | "SENT" | "FAILED" | "UNCERTAIN";
  messageId?: string;
  error?: string;
}
export interface ChannelAdapter {
  getCapabilities(): ChannelCapabilities;
  connect(workspaceId: string, connectionId: string): Promise<unknown>;
  disconnect(workspaceId: string, connectionId: string): Promise<void>;
  getConversations(workspaceId: string, connectionId: string): Promise<unknown>;
  getMessages(
    workspaceId: string,
    connectionId: string,
    chatId: string,
    cursor?: string,
  ): Promise<unknown>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
export const channelEventSchema = z
  .object({
    historical: z.boolean().optional(),
    attempt: z.number().int().nonnegative().optional(),
    eventId: z.string().min(1).max(200),
    workspaceId: z.uuid(),
    connectionId: z.uuid(),
    kind: z.enum(["status", "message", "edit", "delete", "send"]),
    chatId: z.string().optional(),
    messageId: z.string().optional(),
    commandId: z.uuid().optional(),
    state: z.string().max(100).optional(),
    text: z.string().max(4096).optional(),
    messageKind: z.string().max(40).optional(),
    direction: z.enum(["IN", "OUT"]).optional(),
    timestamp: z.number().optional(),
    replyTo: z.string().optional(),
  })
  .strict()
  .superRefine((e, c) => {
    if (e.kind === "send" && (!e.commandId || e.attempt === undefined))
      c.addIssue({ code: "custom", message: "Command required" });
    if (
      ["message", "edit", "delete"].includes(e.kind) &&
      (!e.chatId || !e.messageId)
    )
      c.addIssue({ code: "custom", message: "Source identifiers required" });
    if (e.kind === "status" && !e.state)
      c.addIssue({ code: "custom", message: "State required" });
  });
export type ChannelEvent = z.infer<typeof channelEventSchema>;
