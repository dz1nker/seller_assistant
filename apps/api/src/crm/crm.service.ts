import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@sales/database";
import {
  businessProfileSchema,
  contactSchema,
  conversationSchema,
  dealPatchSchema,
  dealSchema,
  defaultStages,
  idSchema,
  knowledgeSchema,
  moveSchema,
  pipelineSchema,
  privacySchema,
  productSchema,
  stagesSchema,
  taskPatchSchema,
  taskSchema,
  type CurrentUser,
} from "@sales/shared";
import { Database, Events } from "../infrastructure";
import { PrivacyEngine } from "../privacy/privacy.module";
const dealInclude = {
  contact: true,
  product: true,
  conversations: true,
} as const;
const pipelineInclude = {
  stages: { orderBy: { position: "asc" as const } },
} as const;
const stageVersion = (stages: unknown) =>
  createHash("sha256").update(JSON.stringify(stages)).digest("hex");
type Tx = Prisma.TransactionClient;
@Injectable()
export class CrmService {
  constructor(
    @Inject(Database) readonly db: Database,
    @Inject(Events) readonly events: Events,
    @Inject(PrivacyEngine) readonly privacy: PrivacyEngine,
  ) {}
  private admin(u: CurrentUser) {
    if (!["OWNER", "ADMIN"].includes(u.role))
      throw new ForbiddenException("Недостаточно прав");
  }
  async contact(ws: string, id: string, tx: Tx = this.db) {
    const row = await tx.contact.findFirst({
      where: { id: idSchema.parse(id), workspaceId: ws },
    });
    if (!row) throw new NotFoundException("Клиент не найден");
    return row;
  }
  async product(ws: string, id: string, tx: Tx = this.db) {
    const row = await tx.product.findFirst({
      where: { id: idSchema.parse(id), workspaceId: ws },
    });
    if (!row) throw new NotFoundException("Продукт не найден");
    return row;
  }
  async pipeline(ws: string, id: string, tx: Tx = this.db) {
    const row = await tx.pipeline.findFirst({
      where: { id: idSchema.parse(id), workspaceId: ws },
      include: pipelineInclude,
    });
    if (!row) throw new NotFoundException("Воронка не найдена");
    return { ...row, version: stageVersion(row.stages) };
  }
  async stage(ws: string, id: string, tx: Tx = this.db) {
    const row = await tx.pipelineStage.findFirst({
      where: { id: idSchema.parse(id), workspaceId: ws },
    });
    if (!row) throw new NotFoundException("Этап не найден");
    return row;
  }
  async deal(ws: string, id: string, tx: Tx = this.db) {
    const row = await tx.deal.findFirst({
      where: { id: idSchema.parse(id), workspaceId: ws },
      include: {
        ...dealInclude,
        history: { orderBy: { createdAt: "desc" }, take: 100 },
      },
    });
    if (!row) throw new NotFoundException("Сделка не найдена");
    return row;
  }
  async audit(tx: Tx, u: CurrentUser, action: string) {
    await tx.auditLog.create({
      data: { workspaceId: u.workspaceId, actorId: u.id, action },
    });
  }
  contacts(ws: string, q = "") {
    if (q.length > 100) throw new BadRequestException();
    return this.db.contact.findMany({
      where: {
        workspaceId: ws,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 200,
    });
  }
  async saveContact(u: CurrentUser, body: unknown, id?: string) {
    const data = contactSchema.parse(body);
    if (id) await this.contact(u.workspaceId, id);
    const row = await this.db.$transaction(async (tx) => {
      const r = id
        ? await tx.contact.update({
            where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
            data,
          })
        : await tx.contact.create({
            data: { ...data, workspaceId: u.workspaceId },
          });
      await this.audit(tx, u, "contact.saved");
      return r;
    });
    this.events.changed(u.workspaceId, "conversation.updated");
    return row;
  }
  async deleteContact(u: CurrentUser, id: string) {
    await this.contact(u.workspaceId, id);
    await this.db.$transaction(async (tx) => {
      const cs = await tx.conversation.findMany({
        where: { workspaceId: u.workspaceId, contactId: id },
      });
      for (const c of cs) await this.privacy.purge(tx, u.workspaceId, c.id);
      await tx.deal.deleteMany({
        where: { workspaceId: u.workspaceId, contactId: id },
      });
      await tx.conversation.deleteMany({
        where: { workspaceId: u.workspaceId, contactId: id },
      });
      await tx.contact.delete({
        where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
      });
      await this.audit(tx, u, "contact.deleted");
    });
    this.events.changed(u.workspaceId, "conversation.updated");
    return { deleted: true };
  }
  products(ws: string) {
    return this.db.product.findMany({
      where: { workspaceId: ws },
      orderBy: { name: "asc" },
      take: 200,
    });
  }
  async saveProduct(u: CurrentUser, body: unknown, id?: string) {
    this.admin(u);
    const data = productSchema.parse(body);
    if (id) await this.product(u.workspaceId, id);
    const row = id
      ? await this.db.product.update({
          where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
          data,
        })
      : await this.db.product.create({
          data: { ...data, workspaceId: u.workspaceId },
        });
    this.events.changed(u.workspaceId, "business.updated");
    return row;
  }
  async deleteProduct(u: CurrentUser, id: string) {
    this.admin(u);
    await this.product(u.workspaceId, id);
    await this.db.$transaction(async (tx) => {
      await tx.deal.updateMany({
        where: { workspaceId: u.workspaceId, productId: id },
        data: { productId: null, version: { increment: 1 } },
      });
      await tx.product.delete({
        where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
      });
      await this.audit(tx, u, "product.deleted");
    });
    this.events.changed(u.workspaceId, "business.updated");
    return { deleted: true };
  }
  async business(ws: string) {
    const w = await this.db.workspace.findUniqueOrThrow({ where: { id: ws } });
    return {
      profile: businessProfileSchema.parse(w.profile),
      knowledge: await this.db.knowledgeItem.findMany({
        where: { workspaceId: ws },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    };
  }
  async saveBusiness(u: CurrentUser, body: unknown) {
    this.admin(u);
    const profile = businessProfileSchema.parse(body);
    await this.db.workspace.update({
      where: { id: u.workspaceId },
      data: { profile },
    });
    this.events.changed(u.workspaceId, "business.updated");
    return this.business(u.workspaceId);
  }
  async saveKnowledge(u: CurrentUser, body: unknown, id?: string) {
    this.admin(u);
    const data = knowledgeSchema.parse(body);
    if (
      id &&
      !(await this.db.knowledgeItem.findFirst({
        where: { id: idSchema.parse(id), workspaceId: u.workspaceId },
      }))
    )
      throw new NotFoundException();
    const row = id
      ? await this.db.knowledgeItem.update({ where: { id }, data })
      : await this.db.knowledgeItem.create({
          data: { ...data, workspaceId: u.workspaceId },
        });
    this.events.changed(u.workspaceId, "business.updated");
    return row;
  }
  async deleteKnowledge(u: CurrentUser, id: string) {
    this.admin(u);
    const r = await this.db.knowledgeItem.deleteMany({
      where: { id: idSchema.parse(id), workspaceId: u.workspaceId },
    });
    if (!r.count) throw new NotFoundException();
    this.events.changed(u.workspaceId, "business.updated");
    return { deleted: true };
  }
  async pipelines(ws: string) {
    return (
      await this.db.pipeline.findMany({
        where: { workspaceId: ws },
        include: pipelineInclude,
        orderBy: { name: "asc" },
      })
    ).map((p) => ({ ...p, version: stageVersion(p.stages) }));
  }
  async createPipeline(u: CurrentUser, body: unknown) {
    this.admin(u);
    const data = pipelineSchema.parse(body);
    const p = await this.db.$transaction(async (tx) => {
      const p = await tx.pipeline.create({
        data: { ...data, workspaceId: u.workspaceId },
      });
      await tx.pipelineStage.createMany({
        data: defaultStages.map(([name, kind], position) => ({
          name,
          kind,
          position,
          workspaceId: u.workspaceId,
          pipelineId: p.id,
        })),
      });
      await this.audit(tx, u, "pipeline.created");
      return p;
    });
    this.events.changed(u.workspaceId, "deal.updated");
    return this.pipeline(u.workspaceId, p.id);
  }
  async renamePipeline(u: CurrentUser, id: string, body: unknown) {
    this.admin(u);
    await this.pipeline(u.workspaceId, id);
    await this.db.pipeline.update({
      where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
      data: pipelineSchema.parse(body),
    });
    this.events.changed(u.workspaceId, "deal.updated");
    return this.pipeline(u.workspaceId, id);
  }
  async updateStages(u: CurrentUser, id: string, body: unknown) {
    this.admin(u);
    const data = stagesSchema.parse(body);
    const ws = u.workspaceId;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pipelines WHERE id=${idSchema.parse(id)}::uuid AND "workspaceId"=${ws}::uuid FOR UPDATE`;
      const p = await this.pipeline(ws, id, tx);
      if (data.expectedVersion !== p.version)
        throw new ConflictException("Воронка изменилась. Обновите страницу");
      const ids = data.stages.flatMap((s) => (s.id ? [s.id] : []));
      if (
        new Set(ids).size !== ids.length ||
        ids.some((s) => !p.stages.some((v) => v.id === s))
      )
        throw new BadRequestException("Некорректные этапы");
      for (const s of data.stages) {
        const old = p.stages.find((v) => v.id === s.id);
        if (
          old &&
          old.kind !== s.kind &&
          (await tx.deal.count({ where: { workspaceId: ws, stageId: old.id } }))
        )
          throw new ConflictException(
            "Перед изменением типа этапа перенесите его сделки",
          );
      }
      if (!data.stages.some((s) => s.kind === "OPEN"))
        throw new BadRequestException("Нужен хотя бы один открытый этап");
      const removed = p.stages.filter((s) => !ids.includes(s.id));
      for (const old of removed) {
        const deals = await tx.deal.findMany({
          where: { workspaceId: ws, stageId: old.id },
        });
        if (deals.length) {
          const target = data.replacements[old.id];
          const dest = data.stages.find((s) => s.id === target);
          if (!target || !dest)
            throw new ConflictException("Выберите этап для переноса сделок");
          if (dest.kind === "WON" && !data.confirmWon)
            throw new BadRequestException(
              "Нужно подтвердить успешное закрытие",
            );
          for (const d of deals) {
            await tx.deal.update({
              where: { id_workspaceId: { id: d.id, workspaceId: ws } },
              data: {
                stageId: target,
                status: dest.kind,
                closedAt: dest.kind === "OPEN" ? null : new Date(),
                version: { increment: 1 },
              },
            });
            await tx.dealStageHistory.create({
              data: {
                workspaceId: ws,
                dealId: d.id,
                actorId: u.id,
                fromStage: old.name,
                toStage: dest.name,
              },
            });
          }
        }
        await tx.pipelineStage.delete({ where: { id: old.id } });
      }
      await tx.pipelineStage.updateMany({
        where: { workspaceId: ws, pipelineId: id },
        data: { position: { increment: 1000 } },
      });
      for (const [position, s] of data.stages.entries()) {
        if (s.id)
          await tx.pipelineStage.update({
            where: { id: s.id },
            data: { name: s.name, kind: s.kind, position },
          });
        else
          await tx.pipelineStage.create({
            data: {
              workspaceId: ws,
              pipelineId: id,
              name: s.name,
              kind: s.kind,
              position,
            },
          });
      }
      await this.audit(tx, u, "pipeline.stages_updated");
    });
    this.events.changed(ws, "deal.updated");
    return this.pipeline(ws, id);
  }
  async deletePipeline(u: CurrentUser, id: string) {
    this.admin(u);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pipelines WHERE id=${idSchema.parse(id)}::uuid AND "workspaceId"=${u.workspaceId}::uuid FOR UPDATE`;
      await this.pipeline(u.workspaceId, id, tx);
      if (
        await tx.deal.count({
          where: { workspaceId: u.workspaceId, pipelineId: id },
        })
      )
        throw new ConflictException(
          "Сначала перенесите сделки из этой воронки",
        );
      await tx.pipeline.delete({
        where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
      });
      await this.audit(tx, u, "pipeline.deleted");
    });
    this.events.changed(u.workspaceId, "deal.updated");
    return { deleted: true };
  }
  deals(ws: string, pipelineId?: string) {
    if (pipelineId) idSchema.parse(pipelineId);
    return this.db.deal.findMany({
      where: { workspaceId: ws, ...(pipelineId ? { pipelineId } : {}) },
      include: dealInclude,
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
  }
  async createDeal(u: CurrentUser, body: unknown) {
    const d = dealSchema.parse(body),
      ws = u.workspaceId;
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pipelines WHERE id=${d.pipelineId}::uuid AND "workspaceId"=${ws}::uuid FOR UPDATE`;
      const contact = await this.contact(ws, d.contactId, tx);
      let isDemo = contact.isDemo;
      if (d.productId)
        isDemo = isDemo || (await this.product(ws, d.productId, tx)).isDemo;
      const stage = await this.stage(ws, d.stageId, tx);
      if (stage.pipelineId !== d.pipelineId || stage.kind !== "OPEN")
        throw new BadRequestException("Выберите открытый этап этой воронки");
      if (d.conversationId) {
        const c = await this.privacy.client(ws, d.conversationId, tx, true);
        isDemo = isDemo || c.source === "DEMO";
        if (c.contactId !== d.contactId)
          throw new BadRequestException("Диалог принадлежит другому контакту");
      }
      const { conversationId, ...data } = d;
      const deal = await tx.deal.create({
        data: { ...data, workspaceId: ws, isDemo },
      });
      if (conversationId)
        await tx.dealConversation.create({
          data: { workspaceId: ws, dealId: deal.id, conversationId },
        });
      await tx.dealStageHistory.create({
        data: {
          workspaceId: ws,
          dealId: deal.id,
          actorId: u.id,
          toStage: stage.name,
        },
      });
      await this.audit(tx, u, "deal.created");
      return deal;
    });
    this.events.changed(ws, "deal.updated", result.id);
    return this.deal(ws, result.id);
  }
  async patchDeal(u: CurrentUser, id: string, body: unknown) {
    const { version, ...data } = dealPatchSchema.parse(body);
    await this.deal(u.workspaceId, id);
    const r = await this.db.deal.updateMany({
      where: { id, workspaceId: u.workspaceId, version },
      data: {
        ...data,
        nextActionAt:
          data.nextActionAt === undefined
            ? undefined
            : data.nextActionAt === null
              ? null
              : new Date(data.nextActionAt),
        version: { increment: 1 },
      },
    });
    if (!r.count)
      throw new ConflictException("Сделка изменилась. Обновите данные");
    this.events.changed(u.workspaceId, "deal.updated", id);
    return this.deal(u.workspaceId, id);
  }
  async move(u: CurrentUser, id: string, body: unknown) {
    const d = moveSchema.parse(body),
      ws = u.workspaceId;
    await this.db.$transaction(async (tx) => {
      const deal = await this.deal(ws, id, tx);
      if (deal.version !== d.version)
        throw new ConflictException("Сделка изменилась");
      // Match stage edits' lock; sort both pipelines to avoid cross-pipeline move deadlocks.
      await tx.$queryRaw`SELECT id FROM pipelines WHERE "workspaceId"=${ws}::uuid AND (id=${deal.pipelineId}::uuid OR id IN (SELECT "pipelineId" FROM pipeline_stages WHERE id=${d.stageId}::uuid AND "workspaceId"=${ws}::uuid)) ORDER BY id FOR UPDATE`;
      const dest = await this.stage(ws, d.stageId, tx);
      if (dest.kind === "WON" && !d.confirmWon)
        throw new BadRequestException("Подтвердите успешное закрытие сделки");
      if (dest.id === deal.stageId) return;
      const from = await this.stage(ws, deal.stageId, tx);
      const changed = await tx.deal.updateMany({
        where: { id, workspaceId: ws, version: d.version },
        data: {
          pipelineId: dest.pipelineId,
          stageId: dest.id,
          status: dest.kind,
          closedAt: dest.kind === "OPEN" ? null : new Date(),
          lossReason: dest.kind === "LOST" ? d.lossReason : null,
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new ConflictException("Сделка изменилась");
      await tx.dealStageHistory.create({
        data: {
          workspaceId: ws,
          dealId: id,
          actorId: u.id,
          fromStage: from.name,
          toStage: dest.name,
        },
      });
      await this.audit(tx, u, "deal.stage_changed");
    });
    this.events.changed(ws, "deal.updated", id);
    return this.deal(ws, id);
  }
  async deleteDeal(u: CurrentUser, id: string) {
    await this.deal(u.workspaceId, id);
    await this.db.deal.delete({
      where: { id_workspaceId: { id, workspaceId: u.workspaceId } },
    });
    this.events.changed(u.workspaceId, "deal.updated", id);
    return { deleted: true };
  }
  conversations(ws: string, q = "", filter = "all") {
    if (q.length > 100) throw new BadRequestException();
    return this.db.conversation.findMany({
      where: {
        workspaceId: ws,
        title: { contains: q, mode: "insensitive" },
        ...(filter === "clients"
          ? { mode: "CLIENT" as const }
          : filter === "candidates"
            ? { mode: "CANDIDATE" as const }
            : filter === "waiting"
              ? { waitingForReply: true }
              : filter === "active"
                ? { dealLinks: { some: { deal: { status: "OPEN" as const } } } }
                : filter === "withoutDeal"
                  ? {
                      dealLinks: {
                        none: { deal: { status: "OPEN" as const } },
                      },
                    }
                  : {}),
      },
      include: {
        contact: true,
        dealLinks: { include: { deal: { include: dealInclude } } },
      },
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    });
  }
  async createConversation(u: CurrentUser, body: unknown) {
    const data = conversationSchema.parse(body);
    if (data.contactId) await this.contact(u.workspaceId, data.contactId);
    const c = await this.db.conversation.create({
      data: {
        ...data,
        workspaceId: u.workspaceId,
        source: "DEMO",
        mode: "CLIENT",
      },
    });
    this.events.changed(u.workspaceId, "conversation.updated", c.id);
    return c;
  }
  async policy(u: CurrentUser, id: string, body: unknown) {
    const d = privacySchema.parse(body),
      ws = u.workspaceId;
    await this.db.$transaction(async (tx) => {
      const c = await this.privacy.conversation(
        ws,
        idSchema.parse(id),
        tx,
        true,
      );
      if (d.contactId) await this.contact(ws, d.contactId, tx);
      if (d.mode !== "CLIENT") await this.privacy.purge(tx, ws, id);
      await tx.conversation.update({
        where: { id_workspaceId: { id, workspaceId: ws } },
        data: {
          mode: d.mode,
          retentionDays: d.retentionDays,
          contactId:
            d.mode === "CLIENT"
              ? d.contactId === undefined
                ? c.contactId
                : d.contactId
              : null,
          version: { increment: 1 },
          unreadCount: 0,
          waitingForReply: false,
        },
      });
      await this.audit(tx, u, "conversation.policy_changed");
    });
    this.events.changed(ws, "conversation.updated", id);
    return this.privacy.conversation(ws, id);
  }
  async clearHistory(u: CurrentUser, id: string) {
    await this.db.$transaction(async (tx) => {
      await this.privacy.conversation(
        u.workspaceId,
        idSchema.parse(id),
        tx,
        true,
      );
      await this.privacy.purge(tx, u.workspaceId, id);
      await tx.conversation.update({
        where: { id },
        data: {
          version: { increment: 1 },
          unreadCount: 0,
          waitingForReply: false,
        },
      });
      await this.audit(tx, u, "conversation.history_cleared");
    });
    this.events.changed(u.workspaceId, "conversation.updated", id);
    return { cleared: true };
  }
  async messages(ws: string, id: string, cursor?: string, limit = 40) {
    await this.privacy.client(ws, idSchema.parse(id));
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException();
    let boundary: Prisma.MessageWhereInput = {};
    if (cursor) {
      const m = await this.db.message.findFirst({
        where: {
          id: idSchema.parse(cursor),
          workspaceId: ws,
          conversationId: id,
        },
      });
      if (!m) throw new BadRequestException("Некорректный курсор");
      boundary = {
        OR: [
          { sentAt: { lt: m.sentAt } },
          { sentAt: m.sentAt, id: { lt: m.id } },
        ],
      };
    }
    const rows = await this.db.message.findMany({
      where: { workspaceId: ws, conversationId: id, ...boundary },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    await this.db.conversation.updateMany({
      where: { id, workspaceId: ws, mode: "CLIENT" },
      data: { unreadCount: 0 },
    });
    return { items: page.reverse(), nextCursor: hasMore ? page[0]?.id : null };
  }
  tasks(ws: string) {
    return this.db.task.findMany({
      where: { workspaceId: ws },
      orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
  }
  async saveTask(u: CurrentUser, body: unknown, id?: string) {
    const ws = u.workspaceId;
    if (id) {
      const data = taskPatchSchema.parse(body);
      const { done, version, ...rest } = data;
      const r = await this.db.task.updateMany({
        where: { id: idSchema.parse(id), workspaceId: ws, version },
        data: {
          ...rest,
          dueAt:
            rest.dueAt === undefined
              ? undefined
              : rest.dueAt === null
                ? null
                : new Date(rest.dueAt),
          doneAt: done === undefined ? undefined : done ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (!r.count)
        throw new ConflictException("Задача не найдена или изменилась");
    } else {
      const d = taskSchema.parse(body);
      if (d.conversationId) await this.privacy.client(ws, d.conversationId);
      if (d.dealId) await this.deal(ws, d.dealId);
      const r = await this.db.task.create({
        data: {
          ...d,
          workspaceId: ws,
          ownerId: u.id,
          dueAt: d.dueAt ? new Date(d.dueAt) : null,
        },
      });
      id = r.id;
    }
    this.events.changed(ws, "task.created", id);
    return this.db.task.findFirstOrThrow({ where: { id, workspaceId: ws } });
  }
  async deleteTask(u: CurrentUser, id: string) {
    const r = await this.db.task.deleteMany({
      where: { id: idSchema.parse(id), workspaceId: u.workspaceId },
    });
    if (!r.count) throw new NotFoundException();
    this.events.changed(u.workspaceId, "task.created", id);
    return { deleted: true };
  }
  async overview(ws: string) {
    const [
      deals,
      tasks,
      generated,
      applied,
      sent,
      usage,
      demoDeals,
      demoSent,
      unknownUsage,
    ] = await Promise.all([
      this.db.deal.findMany({
        where: { workspaceId: ws, isDemo: false },
        select: {
          status: true,
          amount: true,
          currency: true,
          lossReason: true,
        },
      }),
      this.db.task.count({ where: { workspaceId: ws, doneAt: null } }),
      this.db.aiSuggestion.count({ where: { workspaceId: ws } }),
      this.db.aiSuggestion.count({
        where: { workspaceId: ws, feedback: { in: ["APPLIED", "SENT"] } },
      }),
      this.db.aiSuggestion.count({
        where: {
          workspaceId: ws,
          feedback: "SENT",
          analysis: { conversation: { source: "TELEGRAM" } },
        },
      }),
      this.db.aiUsage.findMany({
        where: { workspaceId: ws },
        select: { inputTokens: true, outputTokens: true, cost: true },
      }),
      this.db.deal.count({ where: { workspaceId: ws, isDemo: true } }),
      this.db.aiSuggestion.count({
        where: {
          workspaceId: ws,
          feedback: "SENT",
          analysis: { conversation: { source: "DEMO" } },
        },
      }),
      this.db.aiAnalysis.count({
        where: {
          workspaceId: ws,
          provider: { not: "DEMO_RULES" },
          usage: { none: {} },
        },
      }),
    ]);
    const totals: Record<string, string> = {};
    for (const d of deals)
      if (d.status === "WON" && d.amount !== null)
        totals[d.currency] = new Prisma.Decimal(totals[d.currency] ?? 0)
          .add(d.amount)
          .toFixed(2);
    return {
      deals: {
        demo: demoDeals,
        total: deals.length,
        open: deals.filter((d) => d.status === "OPEN").length,
        won: deals.filter((d) => d.status === "WON").length,
        lost: deals.filter((d) => d.status === "LOST").length,
        unknownAmount: deals.filter((d) => d.amount === null).length,
        wonAmounts: totals,
        lossReasons: deals
          .filter((d) => d.status === "LOST" && d.lossReason)
          .map((d) => d.lossReason),
      },
      tasks,
      ai: {
        generated,
        applied,
        sent,
        demoSent,
        inputTokens: unknownUsage
          ? null
          : usage.reduce((a, u) => a + u.inputTokens, 0),
        outputTokens: unknownUsage
          ? null
          : usage.reduce((a, u) => a + u.outputTokens, 0),
        cost:
          unknownUsage || usage.some((u) => u.cost === null)
            ? null
            : usage
                .reduce((a, u) => a.add(u.cost ?? 0), new Prisma.Decimal(0))
                .toFixed(8),
      },
    };
  }
  async demo(u: CurrentUser) {
    const ws = u.workspaceId;
    await this.db.$transaction(async (tx) => {
      const set = await tx.workspace.updateMany({
        where: { id: ws, demoVersion: 0 },
        data: { demoVersion: 1 },
      });
      if (!set.count) return;
      const p = await tx.pipeline.findFirst({
        where: { workspaceId: ws },
        include: pipelineInclude,
      });
      if (!p?.stages[0])
        throw new BadRequestException("Сначала создайте воронку");
      const product = await tx.product.create({
        data: {
          workspaceId: ws,
          isDemo: true,
          name: "Демо · консультация",
          description:
            "Синтетический продукт для проверки сценария. Не является реальным предложением.",
          amount: null,
        },
      });
      for (const [i, name] of [
        "Анна (демо)",
        "Мария (демо)",
        "Елена (демо)",
      ].entries()) {
        const contact = await tx.contact.create({
          data: {
            workspaceId: ws,
            isDemo: true,
            name,
            notes: "Синтетический демонстрационный контакт",
          },
        });
        const c = await tx.conversation.create({
          data: {
            workspaceId: ws,
            contactId: contact.id,
            source: "DEMO",
            title: name,
            mode: "CLIENT",
            version: 1,
            waitingForReply: true,
            unreadCount: 1,
          },
        });
        await tx.message.create({
          data: {
            workspaceId: ws,
            conversationId: c.id,
            direction: "IN",
            text: [
              "Здравствуйте! Подойдёт ли ваша консультация для моей задачи?",
              "Мне интересно, как устроена работа и сколько она длится.",
              "Хочу обсудить формат и условия консультации.",
            ][i]!,
            status: "SENT",
          },
        });
        const deal = await tx.deal.create({
          data: {
            workspaceId: ws,
            isDemo: true,
            contactId: contact.id,
            productId: product.id,
            pipelineId: p.id,
            stageId: p.stages[0].id,
            title: "Демо · консультация",
          },
        });
        await tx.dealConversation.create({
          data: { workspaceId: ws, dealId: deal.id, conversationId: c.id },
        });
        await tx.dealStageHistory.create({
          data: {
            workspaceId: ws,
            dealId: deal.id,
            actorId: u.id,
            toStage: p.stages[0].name,
          },
        });
      }
      await this.audit(tx, u, "demo.created");
    });
    this.events.changed(ws, "conversation.updated");
    return { created: true };
  }
}
