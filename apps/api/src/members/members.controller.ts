import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  acceptInviteSchema,
  changeMemberRoleSchema,
  inviteMemberSchema,
  type AcceptInviteInput,
  type ChangeMemberRoleInput,
  type InviteMemberInput
} from "@yoyo/contracts";
import type { ApiEnv } from "@yoyo/config";
import { CurrentUser, type CurrentUserPayload } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { setCsrfCookie, setSessionCookie } from "../auth/cookies.util";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { API_ENV } from "../common/env.tokens";
import { MembersService } from "./members.service";

@Controller("organizations/:organizationId/members")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Post("invite")
  @RequireCapability("manageMembers")
  @UseGuards(CsrfGuard)
  async invite(
    @Param("organizationId") organizationId: string,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.members.invite(organizationId, body, user.id);
  }

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("cursor") cursor?: string) {
    return this.members.list(organizationId, cursor);
  }

  @Patch(":memberId/role")
  @RequireCapability("manageMembers")
  @UseGuards(CsrfGuard)
  async changeRole(
    @Param("organizationId") organizationId: string,
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema)) body: ChangeMemberRoleInput,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.members.changeRole(organizationId, memberId, body.role, user.id);
  }

  @Delete(":memberId")
  @RequireCapability("manageMembers")
  @UseGuards(CsrfGuard)
  async remove(
    @Param("organizationId") organizationId: string,
    @Param("memberId") memberId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.members.remove(organizationId, memberId, user.id);
  }
}

// Accepting an invite happens without an existing session/org membership, so it
// lives on its own top-level route rather than under the org-scoped controller above.
@Controller("members")
export class MemberInviteAcceptanceController {
  constructor(
    private readonly members: MembersService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  @Post("accept-invite")
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { member, rawSessionToken } = await this.members.acceptInvite(body.token, {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    setSessionCookie(res, this.env, rawSessionToken);
    setCsrfCookie(res, this.env);
    return { organizationId: member.organizationId, role: member.role };
  }
}
