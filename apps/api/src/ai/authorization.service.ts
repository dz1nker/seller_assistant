import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  aiAuthorizationSchema,
  type CurrentUser,
  type AiAccessView,
} from "@sales/shared";
import { Database, Events } from "../infrastructure";
import { PrivacyEngine } from "../privacy/privacy.module";
import { AppConfig } from "../config";
import { aiProviderFingerprint, aiSetup } from "./provider";

@Injectable()
export class AiAuthorizations {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PrivacyEngine) private privacy: PrivacyEngine,
    @Inject(AppConfig) private config: AppConfig,
    @Inject(Events) private events: Events,
  ) {}
  admin(u: CurrentUser) {
    if (!["OWNER", "ADMIN"].includes(u.role))
      throw new ForbiddenException(
        "Разрешения ИИ проверяет владелец или администратор",
      );
  }
  async status(ws: string, id: string): Promise<AiAccessView> {
    const {
      allowed,
      reason,
      authorization: a,
    } = await this.privacy.inspectAi(ws, id);
    return {
      allowed,
      reason,
      provider: aiSetup(this.config),
      authorization: a
        ? {
            id: a.id,
            expiresAt: a.expiresAt.toISOString(),
            createdAt: a.createdAt.toISOString(),
            revokedAt: a.revokedAt?.toISOString() ?? null,
            providerEndpoint: a.providerEndpoint,
            providerModel: a.providerModel,
          }
        : null,
    };
  }
  async grant(u: CurrentUser, id: string, body: unknown) {
    this.admin(u);
    const d = aiAuthorizationSchema.parse(body);
    const expiresAt = new Date(d.expiresAt);
    if (
      expiresAt.getTime() < Date.now() + 60000 ||
      expiresAt.getTime() > Date.now() + 365 * 86400000
    )
      throw new BadRequestException(
        "Срок разрешения должен быть в будущем, не более года",
      );
    const provider = aiSetup(this.config);
    if (d.providerRevision !== provider.revision)
      throw new BadRequestException(
        "ИИ-провайдер изменился. Обновите страницу и проверьте получателя данных",
      );
    if (provider.provider !== "openai" || !provider.configured)
      throw new ServiceUnavailableException(
        "Сначала подключите ИИ-провайдера через AI_PROVIDER=openai и AI_API_KEY",
      );
    await this.db.$transaction(async (tx) => {
      const c = await this.privacy.client(u.workspaceId, id, tx, true);
      if (c.source !== "TELEGRAM")
        throw new BadRequestException(
          "Отдельное разрешение поддерживается для Telegram-диалогов",
        );
      await tx.aiAuthorization.updateMany({
        where: {
          workspaceId: u.workspaceId,
          conversationId: id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.aiAnalysis.deleteMany({
        where: { workspaceId: u.workspaceId, conversationId: id },
      });
      const {
        policyReviewed: _p,
        rightsVerified: _r,
        providerRevision: _v,
        ...data
      } = d;
      const authorization = await tx.aiAuthorization.create({
        data: {
          ...data,
          expiresAt,
          workspaceId: u.workspaceId,
          conversationId: id,
          approvedBy: u.id,
          providerFingerprint: aiProviderFingerprint(this.config),
          providerEndpoint: provider.endpoint,
          providerModel: provider.model,
        },
      });
      await tx.conversation.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: u.workspaceId,
          actorId: u.id,
          action: "ai.authorization_granted",
          metadata: { conversationId: id, authorizationId: authorization.id },
        },
      });
    });
    this.events.changed(u.workspaceId, "ai.authorization_changed", id);
    return this.status(u.workspaceId, id);
  }
  async revoke(u: CurrentUser, id: string) {
    this.admin(u);
    await this.db.$transaction(async (tx) => {
      const c = await this.privacy.conversation(u.workspaceId, id, tx, true);
      if (c.source !== "TELEGRAM")
        throw new BadRequestException(
          "Отдельное разрешение поддерживается для Telegram-диалогов",
        );
      await tx.aiAuthorization.updateMany({
        where: {
          workspaceId: u.workspaceId,
          conversationId: id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.aiAnalysis.deleteMany({
        where: { workspaceId: u.workspaceId, conversationId: id },
      });
      await tx.conversation.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: u.workspaceId,
          actorId: u.id,
          action: "ai.authorization_revoked",
          metadata: { conversationId: id },
        },
      });
    });
    this.events.changed(u.workspaceId, "ai.authorization_changed", id);
    return this.status(u.workspaceId, id);
  }
}
