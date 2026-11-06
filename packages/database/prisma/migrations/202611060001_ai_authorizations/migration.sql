ALTER TABLE audit_logs ADD COLUMN metadata JSONB;
CREATE TABLE ai_authorizations (
  id UUID PRIMARY KEY,
  "workspaceId" UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  "conversationId" UUID NOT NULL,
  "approvedBy" UUID NOT NULL,
  "sourcePolicyReference" VARCHAR(1000) NOT NULL,
  "sourcePolicyVersion" VARCHAR(200) NOT NULL,
  "rightsBasis" VARCHAR(40) NOT NULL,
  "rightsReference" VARCHAR(1000) NOT NULL,
  "reviewNotes" VARCHAR(2000) NOT NULL,
  "providerFingerprint" VARCHAR(64) NOT NULL,
  "providerEndpoint" VARCHAR(1000) NOT NULL,
  "providerModel" VARCHAR(100) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ai_authorizations_conversation_fk FOREIGN KEY ("conversationId", "workspaceId") REFERENCES conversations(id, "workspaceId") ON DELETE CASCADE,
  CONSTRAINT ai_authorizations_scope_key UNIQUE(id, "workspaceId", "conversationId"),
  CONSTRAINT ai_authorizations_rights_check CHECK ("rightsBasis" IN ('DOCUMENTED_CONSENT','CONTRACTUAL_RIGHTS','OTHER_DOCUMENTED_RIGHTS')),
  CONSTRAINT ai_authorizations_expiry_check CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX ai_authorizations_conversation_idx ON ai_authorizations("workspaceId", "conversationId", "createdAt");
CREATE UNIQUE INDEX ai_authorizations_active_key ON ai_authorizations("workspaceId", "conversationId") WHERE "revokedAt" IS NULL;
ALTER TABLE ai_analyses ADD COLUMN "authorizationId" UUID;
ALTER TABLE ai_analyses ADD CONSTRAINT ai_analyses_authorization_fk FOREIGN KEY ("authorizationId", "workspaceId", "conversationId") REFERENCES ai_authorizations(id, "workspaceId", "conversationId") ON DELETE CASCADE;
