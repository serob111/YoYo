import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { sendMessageSchema, type SendMessageInput } from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MessagesService } from "./messages.service";

@Controller("organizations/:organizationId/conversations/:conversationId/messages")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Param("conversationId") conversationId: string, @Query("cursor") cursor?: string) {
    return this.messages.list(organizationId, conversationId, cursor);
  }

  @Post()
  @RequireCapability("replyConversation")
  @UseGuards(CsrfGuard)
  async send(
    @Param("organizationId") organizationId: string,
    @Param("conversationId") conversationId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.messages.send(organizationId, conversationId, user.id, body.text);
  }
}
