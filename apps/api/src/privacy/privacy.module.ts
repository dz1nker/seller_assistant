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
import { AppConfig } from "../config";
import { aiProviderFingerprint, aiSetup } from "../ai/provider";
@Injectable()
export class PrivacyEngine {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(AppConfig) private config: AppConfig,
  ) {}
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
  async inspectAi(
    workspaceId: string,
    id: string,
    tx: Prisma.TransactionClient = this.db,
    lock = false,
  ) {
    const c = await this.conversation(workspaceId, id, tx, lock);
    const authorization =
      c.source === "TELEGRAM"
        ? await tx.aiAuthorization.findFirst({
            where: { workspaceId, conversationId: id, revokedAt: null },
            orderBy: { createdAt: "desc" },
          })
        : null;
    let allowed = false;
    let reason = "Для этого источника ИИ-анализ не поддерживается";
    if (c.mode !== "CLIENT")
      reason = "Диалог исключён или ещё не выбран для работы";
    else if (c.source === "DEMO") {
      allowed = true;
      reason = "Синтетический демонстрационный источник";
    } else if (c.source === "TELEGRAM") {
      const provider = aiSetup(this.config);
      if (!authorization)
        reason =
          "Для Telegram требуется отдельная проверка политики источника и документированных прав на обработку этого диалога";
      else if (authorization.expiresAt <= new Date())
        reason = "Срок разрешения на ИИ-анализ истёк";
      else if (
        authorization.providerFingerprint !== aiProviderFingerprint(this.config)
      )
        reason =
          "ИИ-провайдер или модель изменились. Проверьте и оформите разрешение заново";
      else if (provider.provider !== "openai" || !provider.configured)
        reason =
          "Для анализа Telegram подключите настоящего ИИ-провайдера на сервере";
      else if (
        !(await tx.workspaceMember.findFirst({
          where: {
            workspaceId,
            userId: authorization.approvedBy,
            role: { in: ["OWNER", "ADMIN"] },
          },
        }))
      )
        reason =
          "Проверивший разрешение администратор больше не имеет нужных прав";
      else {
        allowed = true;
        reason =
          "Политика источника и права на этот диалог зарегистрированы для текущего ИИ-провайдера";
      }
    }
    return { conversation: c, allowed, reason, authorization };
  }
  async ai(
    workspaceId: string,
    id: string,
    tx: Prisma.TransactionClient = this.db,
    lock = false,
  ) {
    const {
      conversation: c,
      allowed,
      reason,
      authorization,
    } = await this.inspectAi(workspaceId, id, tx, lock);
    await tx.aiPolicyDecision.create({
      data: { workspaceId, conversationId: id, allowed, reason },
    });
    if (!allowed) throw new ForbiddenException(reason);
    return { ...c, aiAuthorizationId: authorization?.id ?? null };
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
    await tx.aiAuthorization.deleteMany({
      where: { workspaceId, conversationId },
    });
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
