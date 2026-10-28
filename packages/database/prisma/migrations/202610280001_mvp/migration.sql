-- Additive MVP migration; preserves Foundation accounts and business data.
ALTER TABLE "workspaces" ADD COLUMN "profile" JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN "demoVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "pipeline_stages_id_workspaceId_key" ON "pipeline_stages" ("id", "workspaceId");
CREATE TYPE "ChannelKind" AS ENUM ('DEMO', 'TELEGRAM', 'INSTAGRAM');
CREATE TYPE "PrivacyMode" AS ENUM ('EXCLUDED', 'CANDIDATE', 'CLIENT');
CREATE TYPE "SendStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNCERTAIN');

CREATE TABLE "contacts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "username" VARCHAR(100),
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "contacts_id_workspaceId_key" ON "contacts" ("id", "workspaceId");

CREATE TABLE "contact_identities" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "platform" "ChannelKind" NOT NULL,
  "connectionKey" TEXT NOT NULL,
  "externalId" TEXT NOT NULL
);
CREATE UNIQUE INDEX "contact_identities_workspaceId_platform_connecti_c9c3f967f8" ON "contact_identities" ("workspaceId", "platform", "connectionKey", "externalId");

CREATE TABLE "products" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "amount" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "format" TEXT NOT NULL DEFAULT '',
  "duration" TEXT NOT NULL DEFAULT '',
  "audience" TEXT NOT NULL DEFAULT '',
  "limitations" TEXT NOT NULL DEFAULT '',
  "outcomes" TEXT NOT NULL DEFAULT '',
  "paymentOptions" TEXT NOT NULL DEFAULT '',
  "faq" TEXT NOT NULL DEFAULT '',
  "cases" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "products_id_workspaceId_key" ON "products" ("id", "workspaceId");

CREATE TABLE "channel_connections" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "channel" "ChannelKind" NOT NULL DEFAULT 'TELEGRAM',
  "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
  "label" TEXT NOT NULL DEFAULT 'Telegram',
  "accountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "channel_connections_id_workspaceId_key" ON "channel_connections" ("id", "workspaceId");

CREATE TABLE "conversations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "connectionId" UUID,
  "externalChatId" TEXT,
  "contactId" UUID,
  "source" "ChannelKind" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "username" TEXT,
  "chatType" TEXT NOT NULL DEFAULT 'private',
  "mode" "PrivacyMode" NOT NULL DEFAULT 'CANDIDATE',
  "version" INTEGER NOT NULL DEFAULT 0,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "waitingForReply" BOOLEAN NOT NULL DEFAULT FALSE,
  "retentionDays" INTEGER NOT NULL DEFAULT 30,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "conversations_id_workspaceId_key" ON "conversations" ("id", "workspaceId");
CREATE UNIQUE INDEX "conversations_workspaceId_connectionId_externalChatId_key" ON "conversations" ("workspaceId", "connectionId", "externalChatId");

CREATE TABLE "messages" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "connectionId" UUID,
  "externalChatId" TEXT,
  "externalMessageId" TEXT,
  "commandId" UUID,
  "suggestionId" UUID,
  "direction" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'text',
  "text" TEXT NOT NULL,
  "replyToExternalId" TEXT,
  "status" "SendStatus" NOT NULL DEFAULT 'SENT',
  "error" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "messages_commandId_key" ON "messages" ("commandId");
CREATE UNIQUE INDEX "messages_id_workspaceId_key" ON "messages" ("id", "workspaceId");
CREATE UNIQUE INDEX "messages_workspaceId_connectionId_externalChatId_f3442ca6c7" ON "messages" ("workspaceId", "connectionId", "externalChatId", "externalMessageId");

CREATE TABLE "message_commands" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "key" UUID NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "status" "SendStatus" NOT NULL DEFAULT 'PENDING',
  "externalMessageId" TEXT,
  "error" TEXT,
  "startedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "message_commands_messageId_key" ON "message_commands" ("messageId");
CREATE UNIQUE INDEX "message_commands_workspaceId_key_key" ON "message_commands" ("workspaceId", "key");

CREATE TABLE "deals" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "productId" UUID,
  "pipelineId" UUID NOT NULL,
  "stageId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "amount" DECIMAL(14,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "status" "StageKind" NOT NULL DEFAULT 'OPEN',
  "onHold" BOOLEAN NOT NULL DEFAULT FALSE,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "nextActionAt" TIMESTAMP(3),
  "lossReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "deals_id_workspaceId_key" ON "deals" ("id", "workspaceId");

CREATE TABLE "deal_conversations" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "dealId" UUID NOT NULL,
  "conversationId" UUID NOT NULL
);
CREATE UNIQUE INDEX "deal_conversations_dealId_conversationId_key" ON "deal_conversations" ("dealId", "conversationId");

CREATE TABLE "deal_stage_history" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "dealId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "fromStage" TEXT,
  "toStage" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "knowledge_items" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ai_analyses" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "contextVersion" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ai_analyses_id_workspaceId_key" ON "ai_analyses" ("id", "workspaceId");

CREATE TABLE "ai_suggestions" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "analysisId" UUID NOT NULL,
  "tone" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "feedback" TEXT NOT NULL DEFAULT 'GENERATED',
  "edited" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ai_suggestions_id_workspaceId_key" ON "ai_suggestions" ("id", "workspaceId");

CREATE TABLE "ai_usage" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "analysisId" UUID NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "cost" DECIMAL(16,8),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ai_policy_decisions" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "tasks" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "conversationId" UUID,
  "dealId" UUID,
  "title" VARCHAR(200) NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3),
  "doneAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "tasks_id_workspaceId_key" ON "tasks" ("id", "workspaceId");

CREATE TABLE "notifications" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "taskId" UUID,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "notifications_key_key" ON "notifications" ("key");

CREATE TABLE "integration_events" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "connectionId" UUID NOT NULL,
  "externalId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "integration_events_connectionId_externalId_key" ON "integration_events" ("connectionId", "externalId");
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "contacts_workspace_idx" ON "contacts" ("workspaceId");
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "contacts" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "contact_identities_workspace_idx" ON "contact_identities" ("workspaceId");
ALTER TABLE "products" ADD CONSTRAINT "products_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "products_workspace_idx" ON "products" ("workspaceId");
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "channel_connections_workspace_idx" ON "channel_connections" ("workspaceId");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "contacts" ("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connectionId_workspaceId_fkey" FOREIGN KEY ("connectionId", "workspaceId") REFERENCES "channel_connections" ("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "conversations_workspace_idx" ON "conversations" ("workspaceId");
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "conversations" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "messages_workspace_idx" ON "messages" ("workspaceId");
CREATE INDEX "message_commands_workspace_idx" ON "message_commands" ("workspaceId");
ALTER TABLE "message_commands" ADD CONSTRAINT "message_commands_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "contacts" ("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_productId_workspaceId_fkey" FOREIGN KEY ("productId", "workspaceId") REFERENCES "products" ("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipelineId_workspaceId_fkey" FOREIGN KEY ("pipelineId", "workspaceId") REFERENCES "pipelines" ("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_stageId_workspaceId_fkey" FOREIGN KEY ("stageId", "workspaceId") REFERENCES "pipeline_stages" ("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "deals_workspace_idx" ON "deals" ("workspaceId");
ALTER TABLE "deal_conversations" ADD CONSTRAINT "deal_conversations_dealId_workspaceId_fkey" FOREIGN KEY ("dealId", "workspaceId") REFERENCES "deals" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_conversations" ADD CONSTRAINT "deal_conversations_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "conversations" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "deal_conversations_workspace_idx" ON "deal_conversations" ("workspaceId");
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_dealId_workspaceId_fkey" FOREIGN KEY ("dealId", "workspaceId") REFERENCES "deals" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "deal_stage_history_workspace_idx" ON "deal_stage_history" ("workspaceId");
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "knowledge_items_workspace_idx" ON "knowledge_items" ("workspaceId");
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "conversations" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ai_analyses_workspace_idx" ON "ai_analyses" ("workspaceId");
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_analysisId_workspaceId_fkey" FOREIGN KEY ("analysisId", "workspaceId") REFERENCES "ai_analyses" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ai_suggestions_workspace_idx" ON "ai_suggestions" ("workspaceId");
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_analysisId_workspaceId_fkey" FOREIGN KEY ("analysisId", "workspaceId") REFERENCES "ai_analyses" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ai_usage_workspace_idx" ON "ai_usage" ("workspaceId");
CREATE INDEX "ai_policy_decisions_workspace_idx" ON "ai_policy_decisions" ("workspaceId");
ALTER TABLE "ai_policy_decisions" ADD CONSTRAINT "ai_policy_decisions_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversationId_workspaceId_fkey" FOREIGN KEY ("conversationId", "workspaceId") REFERENCES "conversations" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dealId_workspaceId_fkey" FOREIGN KEY ("dealId", "workspaceId") REFERENCES "deals" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tasks_workspace_idx" ON "tasks" ("workspaceId");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_taskId_workspaceId_fkey" FOREIGN KEY ("taskId", "workspaceId") REFERENCES "tasks" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "notifications_workspace_idx" ON "notifications" ("workspaceId");
CREATE INDEX "integration_events_workspace_idx" ON "integration_events" ("workspaceId");
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_workspace_fk" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE;
CREATE INDEX "messages_history_idx" ON "messages" ("workspaceId", "conversationId", "sentAt", "id");
CREATE INDEX "conversations_activity_idx" ON "conversations" ("workspaceId", "lastActivityAt");
CREATE INDEX "commands_pending_idx" ON "message_commands" ("status", "createdAt");
CREATE INDEX "tasks_due_idx" ON "tasks" ("workspaceId", "doneAt", "dueAt");
CREATE INDEX "deals_kanban_idx" ON "deals" ("workspaceId", "pipelineId", "stageId");
