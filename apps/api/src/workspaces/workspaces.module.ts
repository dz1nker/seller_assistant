import { Body, Controller, ForbiddenException, Get, Inject, Module, Patch, Req } from '@nestjs/common';
import { workspacePatchSchema } from '@sales/shared';
import { Database } from '../infrastructure';
import type { AuthRequest } from '../security';
@Controller('workspaces/current')
class WorkspacesController {
  constructor(@Inject(Database) private db: Database) {}
  @Get()
  current(@Req() req: AuthRequest) {
    return this.db.workspace.findUniqueOrThrow({ where: { id: req.currentUser.workspaceId }, select: {
      id: true, name: true, description: true, timezone: true, createdAt: true,
      members: { select: { userId: true, role: true, user: { select: { name: true } } } },
      pipelines: { select: { id: true, name: true, stages: { orderBy: { position: 'asc' }, select: { id: true, name: true, position: true, kind: true } } } },
    } }).then(workspace => ({ ...workspace, members: workspace.members.map(m => ({ userId: m.userId, name: m.user.name, role: m.role })) }));
  }
  @Patch()
  async update(@Req() req: AuthRequest, @Body() body: unknown) {
    if (!['OWNER', 'ADMIN'].includes(req.currentUser.role)) throw new ForbiddenException('Недостаточно прав');
    const data = workspacePatchSchema.parse(body);
    await this.db.$transaction(async tx => {
      await tx.workspace.update({ where: { id: req.currentUser.workspaceId }, data });
      await tx.auditLog.create({ data: { workspaceId: req.currentUser.workspaceId, actorId: req.currentUser.id, action: 'workspace.updated' } });
    });
    return this.current(req);
  }
}
@Module({ controllers: [WorkspacesController] })
export class WorkspacesModule {}
