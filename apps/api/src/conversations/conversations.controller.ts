import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import {
  assignConversationSchema,
  setConversationAutomationStateSchema,
  type AssignConversationInput,
  type SetConversationAutomationStateInput
} from "@yoyo/contracts";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ConversationsService } from "./conversations.service";

@Controller("organizations/:organizationId/conversations")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("cursor") cursor?: string) {
    return this.conversations.list(organizationId, cursor);
  }

  @Patch(":conversationId")
  @RequireCapability("takeOverConversation")
  @UseGuards(CsrfGuard)
  async assign(
    @Param("organizationId") organizationId: string,
    @Param("conversationId") conversationId: string,
    @Body(new ZodValidationPipe(assignConversationSchema)) body: AssignConversationInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.conversations.assign(organizationId, conversationId, body.assignedUserId, user.id);
  }

  @Patch(":conversationId/automation-state")
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async setAutomationState(
    @Param("organizationId") organizationId: string,
    @Param("conversationId") conversationId: string,
    @Body(new ZodValidationPipe(setConversationAutomationStateSchema)) body: SetConversationAutomationStateInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.conversations.setAutomationState(organizationId, conversationId, body.automationState, user.id);
  }
}
