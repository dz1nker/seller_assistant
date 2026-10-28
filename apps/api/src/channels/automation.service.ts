import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { createHash } from "node:crypto";
import type Redis from "ioredis";
import { AppConfig } from "../config";
import { Cache, Database, Events } from "../infrastructure";
import { MessagesService } from "./messages.service";
@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private connections: Redis[] = [];
  private activeTick?: Promise<void>;
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopped = false;
  private lastRetention = 0;
  constructor(
    @Inject(Database) private db: Database,
    @Inject(Cache) private cache: Cache,
    @Inject(Events) private events: Events,
    @Inject(AppConfig) private config: AppConfig,
    @Inject(MessagesService) private messages: MessagesService,
  ) {}
  onModuleInit() {
    const namespace = createHash("sha256")
      .update(new URL(this.config.values.DATABASE_URL).pathname)
      .digest("hex")
      .slice(0, 12);
    const name = `sales-outbox-${namespace}`;
    const connection = this.cache.redis.duplicate({
      maxRetriesPerRequest: null,
    });
    const workerConnection = connection.duplicate();
    this.connections = [connection, workerConnection];
    this.queue = new Queue(name, { connection });
    this.worker = new Worker(
      name,
      async (job) => {
        await this.messages.deliver(String(job.data.commandId));
      },
      { connection: workerConnection, concurrency: 2 },
    );
    this.worker.on("error", () => {});
    const poll = () => {
      if (!this.activeTick)
        this.activeTick = this.tick().finally(() => {
          this.activeTick = undefined;
        });
    };
    this.timer = setInterval(poll, 1500);
    poll();
  }
  async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const pending = await this.db.messageCommand.findMany({
        where: {
          OR: [
            { status: "PENDING" },
            {
              status: "SENDING",
              startedAt: { lt: new Date(Date.now() - 60000) },
            },
          ],
        },
        take: 100,
        orderBy: { createdAt: "asc" },
      });
      for (const c of pending) {
        const id = `${c.id}-${c.attempts}`;
        const old = await this.queue?.getJob(id);
        if (old && ["completed", "failed"].includes(await old.getState()))
          await old.remove();
        await this.queue?.add(
          "send",
          { commandId: c.id },
          {
            jobId: id,
            attempts: 1,
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 86400, count: 1000 },
          },
        );
      }
      const due = await this.db.task.findMany({
        where: { dueAt: { lte: new Date() }, doneAt: null },
        take: 200,
      });
      for (const task of due) {
        const r = await this.db.notification.createMany({
          data: [
            {
              workspaceId: task.workspaceId,
              taskId: task.id,
              key: `task:${task.id}:${task.version}`,
              title: `Напоминание: ${task.title}`,
            },
          ],
          skipDuplicates: true,
        });
        if (r.count)
          this.events.changed(
            task.workspaceId,
            "notification.created",
            task.id,
          );
      }
      if (Date.now() - this.lastRetention > 3600000) {
        this.lastRetention = Date.now();
        const cs = await this.db.conversation.findMany({
          where: { mode: "CLIENT" },
          select: { id: true, workspaceId: true, retentionDays: true },
          take: 1000,
        });
        for (const c of cs) {
          await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM conversations WHERE id=${c.id}::uuid FOR UPDATE`;
            const r = await tx.message.deleteMany({
              where: {
                workspaceId: c.workspaceId,
                conversationId: c.id,
                sentAt: {
                  lt: new Date(Date.now() - c.retentionDays * 86400000),
                },
                status: { notIn: ["PENDING", "SENDING"] },
              },
            });
            if (r.count) {
              await tx.aiAnalysis.deleteMany({
                where: { workspaceId: c.workspaceId, conversationId: c.id },
              });
              await tx.conversation.update({
                where: { id: c.id },
                data: { version: { increment: 1 } },
              });
            }
          });
        }
      }
    } catch {
    } finally {
      this.busy = false;
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.activeTick;
    await this.worker?.close();
    await this.queue?.close();
    for (const c of this.connections) c.disconnect();
  }
}
