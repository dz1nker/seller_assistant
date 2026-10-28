import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import { idSchema } from "@sales/shared";
import type { AuthRequest } from "../security";
import { AiService } from "./ai.service";
const input = z
  .object({
    conversationId: idSchema,
    length: z.enum(["normal", "shorter", "longer"]).default("normal"),
  })
  .strict();
@Controller("ai")
class AiController {
  constructor(@Inject(AiService) private ai: AiService) {}
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
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
