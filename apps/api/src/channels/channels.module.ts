import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  Post,
  Delete,
  Query,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import { authStepSchema, channelEventSchema, idSchema } from "@sales/shared";
import { type AuthRequest, Public, GatewayOnly } from "../security";
import { AiModule } from "../ai/ai.module";
import { TelegramAdapter } from "./gateway.client";
import { MessagesService } from "./messages.service";
import { ChannelsService } from "./channels.service";
import { AutomationService } from "./automation.service";
@Controller()
class ChannelsController {
  constructor(
    @Inject(ChannelsService) private channels: ChannelsService,
    @Inject(MessagesService) private messages: MessagesService,
    @Inject(TelegramAdapter) private gateway: TelegramAdapter,
  ) {}
  @Get("connections") async list(@Req() r: AuthRequest) {
    const rows = await this.channels.list(r.currentUser.workspaceId);
    return rows.map((row) => {
      if (r.currentUser.role === "MEMBER" && "auth" in row && row.auth)
        return { ...row, auth: { state: row.auth.state } };
      return row;
    });
  }
  @Get("connections/setup") setup() {
    return this.channels.setup();
  }
  @Post("connections/telegram/start") start(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    z.object({})
      .strict()
      .parse(b ?? {});
    return this.channels.start(r.currentUser);
  }
  @Post("connections/telegram/auth-step") auth(
    @Req() r: AuthRequest,
    @Body() b: unknown,
  ) {
    const d = authStepSchema.parse(b);
    return this.channels.auth(r.currentUser, d.connectionId, d.kind, d.value);
  }
  @Post("connections/:id/sync") sync(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.channels.sync(r.currentUser, idSchema.parse(id));
  }
  @Delete("connections/:id") disconnect(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.channels.disconnect(r.currentUser, id);
  }
  @Post("conversations/:id/sync") history(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.channels.history(r.currentUser.workspaceId, id, cursor);
  }
  @Post("conversations/:id/messages") @HttpCode(202) send(
    @Req() r: AuthRequest,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.messages.send(r.currentUser, idSchema.parse(id), b);
  }
  @Get("message-commands/:id") command(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.messages.result(r.currentUser.workspaceId, idSchema.parse(id));
  }
  @Post("message-commands/:id/retry") retry(
    @Req() r: AuthRequest,
    @Param("id") id: string,
  ) {
    return this.messages.retry(r.currentUser, idSchema.parse(id));
  }
  @Public()
  @GatewayOnly()
  @Post("internal/channel-events")
  @HttpCode(200)
  event(@Body() b: unknown) {
    return this.messages.ingest(channelEventSchema.parse(b));
  }
}
@Module({
  imports: [AiModule],
  controllers: [ChannelsController],
  providers: [
    TelegramAdapter,
    MessagesService,
    ChannelsService,
    AutomationService,
  ],
  exports: [MessagesService, ChannelsService],
})
export class ChannelsModule {}
