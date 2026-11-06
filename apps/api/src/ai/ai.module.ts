import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Delete,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import { idSchema } from "@sales/shared";
import type { AuthRequest } from "../security";
import { AiService } from "./ai.service";
import { AiAuthorizations } from "./authorization.service";
import { AiProvider, aiSetup } from "./provider";
import { AppConfig } from "../config";
import { Cache } from "../infrastructure";
import { HttpException } from "@nestjs/common";
const input = z
  .object({
    conversationId: idSchema,
    length: z.enum(["normal", "shorter", "longer"]).default("normal"),
  })
  .strict();
@Controller("ai")
class AiController {
  constructor(
    @Inject(AiService) private ai: AiService,
    @Inject(AiAuthorizations) private authorizations: AiAuthorizations,
    @Inject(AiProvider) private provider: AiProvider,
    @Inject(AppConfig) private config: AppConfig,
    @Inject(Cache) private cache: Cache,
  ) {}
  @Get("setup") setup() {
    return aiSetup(this.config);
  }
  @Post("test") async test(@Req() r: AuthRequest, @Body() b: unknown) {
    this.authorizations.admin(r.currentUser);
    z.object({})
      .strict()
      .parse(b ?? {});
    if (
      (await this.cache.increment(`ai-test:${r.currentUser.workspaceId}`, 60)) >
      3
    )
      throw new HttpException(
        "Подождите минуту перед следующей проверкой ИИ",
        429,
      );
    return this.provider.test();
  }
  @Get("conversations/:id/access") access(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.authorizations.status(
      r.currentUser.workspaceId,
      idSchema.parse(id),
    );
  }
  @Post("conversations/:id/authorization") authorize(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.authorizations.grant(r.currentUser, idSchema.parse(id), b);
  }
  @Delete("conversations/:id/authorization") revoke(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.authorizations.revoke(r.currentUser, idSchema.parse(id));
  }
  @Post("analyze") analyze(@Req() r: AuthRequest, @Body() b: unknown) {
    const d = input.parse(b);
    return this.ai.generate(
      r.currentUser.workspaceId,
      d.conversationId,
      d.length,
    );
  }
  @Post("suggest") suggest(@Req() r: AuthRequest, @Body() b: unknown) {
    return this.analyze(r, b);
  }
  @Get("conversations/:id") list(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.ai.list(r.currentUser.workspaceId, idSchema.parse(id));
  }
  @Post("suggestions/:id/feedback") feedback(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    const d = z
      .object({ feedback: z.enum(["APPLIED", "REJECTED"]) })
      .strict()
      .parse(b);
    return this.ai.feedback(
      r.currentUser.workspaceId,
      idSchema.parse(id),
      d.feedback,
    );
  }
}
@Module({
  controllers: [AiController],
  providers: [AiService, AiProvider, AiAuthorizations],
  exports: [AiService],
})
export class AiModule {}
