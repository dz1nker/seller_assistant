import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthRequest } from "../security";
import { idSchema } from "@sales/shared";
import { CrmService } from "./crm.service";
@Controller()
class CrmController {
  constructor(@Inject(CrmService) private crm: CrmService) {}
  @Get("contacts") contacts(@Req() r: AuthRequest, @Query("q") q?: string) {
    return this.crm.contacts(r.currentUser.workspaceId, q);
  }
  @Post("contacts") createContact(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.crm.saveContact(r.currentUser, b);
  }
  @Patch("contacts/:id") contact(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.saveContact(r.currentUser, b, idSchema.parse(id));
  }
  @Delete("contacts/:id") deleteContact(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.deleteContact(r.currentUser, id);
  }
  @Get("products") products(@Req() r: AuthRequest) {
    return this.crm.products(r.currentUser.workspaceId);
  }
  @Post("products") createProduct(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.crm.saveProduct(r.currentUser, b);
  }
  @Patch("products/:id") product(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.saveProduct(r.currentUser, b, idSchema.parse(id));
  }
  @Delete("products/:id") deleteProduct(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.deleteProduct(r.currentUser, id);
  }
  @Get("business") business(@Req() r: AuthRequest) {
    return this.crm.business(r.currentUser.workspaceId);
  }
  @Patch("business") saveBusiness(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.crm.saveBusiness(r.currentUser, b);
  }
  @Post("knowledge") createKnowledge(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.crm.saveKnowledge(r.currentUser, b);
  }
  @Patch("knowledge/:id") knowledge(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.saveKnowledge(r.currentUser, b, idSchema.parse(id));
  }
  @Delete("knowledge/:id") deleteKnowledge(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.deleteKnowledge(r.currentUser, id);
  }
  @Get("pipelines") pipelines(@Req() r: AuthRequest) {
    return this.crm.pipelines(r.currentUser.workspaceId);
  }
  @Post("pipelines") createPipeline(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.crm.createPipeline(r.currentUser, b);
  }
  @Patch("pipelines/:id") pipeline(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.renamePipeline(r.currentUser, id, b);
  }
  @Put("pipelines/:id/stages") stages(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.updateStages(r.currentUser, id, b);
  }
  @Delete("pipelines/:id") deletePipeline(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.deletePipeline(r.currentUser, id);
  }
  @Get("deals") deals(@Req() r: AuthRequest, @Query("pipelineId") p?: string) {
    return this.crm.deals(r.currentUser.workspaceId, p);
  }
  @Get("deals/:id") deal(@Req() r: AuthRequest, @Param("id") id: string) {
    return this.crm.deal(r.currentUser.workspaceId, id);
  }
  @Post("deals") createDeal(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.crm.createDeal(r.currentUser, b);
  }
  @Patch("deals/:id") patchDeal(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.patchDeal(r.currentUser, id, b);
  }
  @Post("deals/:id/move") move(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.move(r.currentUser, id, b);
  }
  @Delete("deals/:id") deleteDeal(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.deleteDeal(r.currentUser, id);
  }
  @Get("conversations") conversations(
    @Req() r: AuthRequest,
    @Query("q") q?: string,
    @Query("filter") filter?: string,
  ) {
    return this.crm.conversations(r.currentUser.workspaceId, q, filter);
  }
  @Get("conversations/:id") conversation(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.privacy.conversation(
      r.currentUser.workspaceId,
      idSchema.parse(id),
    );
  }
  @Post("conversations") createConversation(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    return this.crm.createConversation(r.currentUser, b);
  }
  @Patch("conversations/:id/policy") policy(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.policy(r.currentUser, id, b);
  }
  @Delete("conversations/:id/messages") clearHistory(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.clearHistory(r.currentUser, id);
  }
  @Get("conversations/:id/messages") messages(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.crm.messages(
      r.currentUser.workspaceId,
      id,
      cursor,
      limit === undefined ? 40 : Number(limit),
    );
  }
  @Get("tasks") tasks(@Req() r: AuthRequest) {
    return this.crm.tasks(r.currentUser.workspaceId);
  }
  @Post("tasks") createTask(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.crm.saveTask(r.currentUser, b);
  }
  @Patch("tasks/:id") task(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.crm.saveTask(r.currentUser, b, idSchema.parse(id));
  }
  @Delete("tasks/:id") deleteTask(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.crm.deleteTask(r.currentUser, id);
  }
  @Get("analytics/overview") overview(@Req() r: AuthRequest) {
    return this.crm.overview(r.currentUser.workspaceId);
  }
  @Post("demo/seed") demo(@Req() r: AuthRequest) {
    return this.crm.demo(r.currentUser);
  }
  @Get("notifications") notifications(@Req() r: AuthRequest) {
    return this.crm.db.notification.findMany({
      where: { workspaceId: r.currentUser.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  @Post("notifications/:id/read") async readNotification(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    await this.crm.db.notification.updateMany({
      where: { id: idSchema.parse(id), workspaceId: r.currentUser.workspaceId },
      data: { readAt: new Date() },
    });
    return { read: true };
  }
}
@Module({
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
