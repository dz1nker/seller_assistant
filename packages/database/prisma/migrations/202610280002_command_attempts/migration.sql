ALTER TABLE "message_commands" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "stage_pipeline_workspace_key" ON "pipeline_stages" ("id", "pipelineId", "workspaceId");
ALTER TABLE "deals" DROP CONSTRAINT "deals_stageId_workspaceId_fkey";
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_pipeline_workspace_fk" FOREIGN KEY ("stageId", "pipelineId", "workspaceId") REFERENCES "pipeline_stages" ("id", "pipelineId", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
