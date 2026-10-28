import {
  ForbiddenException,
  Global,
  Inject,
  Injectable,
  Module,
  NotFoundException,
} from "@nestjs/common";
import { Database } from "../infrastructure";
import type { Prisma } from "@sales/database";
@Injectable()
export class PrivacyEngine {
  constructor(@Inject(Database) private db: Database) {}
  async conversation(
    workspaceId: string,
    id: string,
    tx: Prisma.TransactionClient = this.db,
    lock = false,
  ) {
    if (lock)
      await tx.$queryRaw`SELECT id FROM conversations WHERE id=${id}::uuid AND "workspaceId"=${workspaceId}::uuid FOR UPDATE`;
    const c = await tx.conversation.findFirst({ where: { id, workspaceId } });
    if (!c) throw new NotFoundException("Диалог не найден");
    return c;
  }
  async client(
    workspaceId: string,
    id: string,
    tx: Prisma.TransactionClient = this.db,
    lock = false,
  ) {
    const c = await this.conversation(workspaceId, id, tx, lock);
    if (c.mode !== "CLIENT")
      throw new ForbiddenException("Переписка не выбрана для работы");
    return c;
  }
  async ai(workspaceId: string, id: string) {
    const c = await this.conversation(workspaceId, id);
    const allowed = c.mode === "CLIENT" && c.source === "DEMO";
    const reason =
      c.mode !== "CLIENT"
        ? "Диалог исключён или ещё не выбран для работы"
        : c.source !== "DEMO"
          ? "Реальная Telegram-переписка запрещена для внешней LLM: необходимы отдельно подтверждённые права и политика источника"
          : "Синтетический демонстрационный источник";
    await this.db.aiPolicyDecision.create({
      data: { workspaceId, conversationId: id, allowed, reason },
    });
    if (!allowed) throw new ForbiddenException(reason);
    return c;
  }
  async purge(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    conversationId: string,
  ) {
    // Delete content and every generated derivative, retain only command digests
    // so a delayed retry cannot resend a previously accepted command.
    await tx.message.deleteMany({ where: { workspaceId, conversationId } });
    await tx.aiAnalysis.deleteMany({ where: { workspaceId, conversationId } });
    await tx.task.deleteMany({ where: { workspaceId, conversationId } });
    await tx.dealConversation.deleteMany({
      where: { workspaceId, conversationId },
    });
    await tx.messageCommand.updateMany({
      where: { workspaceId, conversationId, status: "PENDING" },
      data: { status: "FAILED", error: "Разрешение отозвано" },
    });
  }
}
@Global()
@Module({ providers: [PrivacyEngine], exports: [PrivacyEngine] })
export class PrivacyModule {}
