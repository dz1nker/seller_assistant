import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { defaultStages } from '@sales/shared';
export async function provisionOwner(tx: Prisma.TransactionClient, input: {
  email: string; name: string; workspaceName: string; passwordHash: string;
}) {
  const workspaceId = randomUUID();
  const user = await tx.user.create({ data: {
    email: input.email, name: input.name, passwordHash: input.passwordHash,
  } });
  await tx.workspace.create({ data: {
    id: workspaceId, name: input.workspaceName,
    members: { create: { userId: user.id, role: 'OWNER' } },
    auditLogs: { create: { actorId: user.id, action: 'workspace.created' } },
  } });
  const pipeline = await tx.pipeline.create({ data: { name: 'Продажи', workspaceId } });
  await tx.pipelineStage.createMany({ data: defaultStages.map(([name, kind], position) => ({
    name, kind, position, workspaceId, pipelineId: pipeline.id,
  })) });
  return { user, workspaceId };
}
