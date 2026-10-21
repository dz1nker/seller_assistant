CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "StageKind" AS ENUM ('OPEN', 'WON', 'LOST');

CREATE TABLE "users" (
  "id" UUID NOT NULL PRIMARY KEY,
  "email" VARCHAR(254) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL PRIMARY KEY,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Minsk',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "workspace_members" (
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'MEMBER',
  PRIMARY KEY ("workspaceId", "userId"),
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

CREATE TABLE "sessions" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "accessHash" TEXT NOT NULL,
  "refreshHash" TEXT NOT NULL,
  "accessExpiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId", "userId") REFERENCES "workspace_members"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessions_accessHash_key" ON "sessions"("accessHash");
CREATE UNIQUE INDEX "sessions_refreshHash_key" ON "sessions"("refreshHash");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX "sessions_refreshExpiresAt_idx" ON "sessions"("refreshExpiresAt");

CREATE TABLE "pipelines" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pipelines_id_workspaceId_key" ON "pipelines"("id", "workspaceId");
CREATE INDEX "pipelines_workspaceId_idx" ON "pipelines"("workspaceId");

CREATE TABLE "pipeline_stages" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "pipelineId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" "StageKind" NOT NULL DEFAULT 'OPEN',
  FOREIGN KEY ("pipelineId", "workspaceId") REFERENCES "pipelines"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pipeline_stages_pipelineId_position_key" ON "pipeline_stages"("pipelineId", "position");
CREATE INDEX "pipeline_stages_workspaceId_idx" ON "pipeline_stages"("workspaceId");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "workspaceId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "audit_logs"("workspaceId", "createdAt");
