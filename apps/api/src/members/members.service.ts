import { Injectable } from "@nestjs/common";
import type { InviteMemberInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthTokenService } from "../auth/auth-token.service";
import { SessionService } from "../auth/session.service";
import { EmailQueueService } from "../notifications/email-queue.service";
import { ConflictDomainError, InvalidOrExpiredTokenError, NotFoundDomainError, DomainError } from "../common/domain-errors";
import type { RequestMeta } from "../auth/auth.service";

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: AuthTokenService,
    private readonly sessions: SessionService,
    private readonly emailQueue: EmailQueueService
  ) {}

  async invite(organizationId: string, input: InviteMemberInput, invitedByUserId: string) {
    const organization = await this.prisma.client.organization.findUniqueOrThrow({ where: { id: organizationId } });

    const { member, invitedUser } = await this.prisma.client.$transaction(async (tx) => {
      let invitedUser = await tx.user.findUnique({ where: { email: input.email } });
      if (!invitedUser) {
        invitedUser = await tx.user.create({ data: { email: input.email, name: input.email.split("@")[0]! } });
      }

      const existingMembership = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: invitedUser.id } }
      });
      if (existingMembership && existingMembership.status !== "REMOVED") {
        throw new ConflictDomainError("This person is already a member or has a pending invite.");
      }

      const member = existingMembership
        ? await tx.organizationMember.update({
            where: { id: existingMembership.id },
            data: { role: input.role, status: "INVITED", invitedByUserId, invitedAt: new Date(), joinedAt: null }
          })
        : await tx.organizationMember.create({
            data: { organizationId, userId: invitedUser.id, role: input.role, status: "INVITED", invitedByUserId }
          });

      await this.audit.record(
        {
          organizationId,
          actorId: invitedByUserId,
          action: "member.invited",
          entityType: "OrganizationMember",
          entityId: member.id,
          metadata: { email: input.email, role: input.role }
        },
        tx
      );

      return { member, invitedUser };
    });

    const { rawToken } = await this.tokens.issue({
      userId: invitedUser.id,
      purpose: "ORGANIZATION_INVITE",
      organizationMemberId: member.id,
      ttlMinutes: 60 * 24 * 7
    });

    await this.emailQueue.send({
      template: "ORGANIZATION_INVITE",
      to: invitedUser.email,
      organizationId,
      data: { tokenId: rawToken, organizationName: organization.name }
    });

    return member;
  }

  async acceptInvite(rawToken: string, meta: RequestMeta) {
    const token = await this.tokens.consume(rawToken, "ORGANIZATION_INVITE");
    if (!token.organizationMemberId) {
      throw new InvalidOrExpiredTokenError("invite");
    }

    const member = await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findUnique({ where: { id: token.organizationMemberId! } });
      if (!existing || existing.status === "REMOVED") {
        throw new InvalidOrExpiredTokenError("invite");
      }
      const updated = await tx.organizationMember.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", joinedAt: new Date() }
      });
      await this.audit.record(
        {
          organizationId: updated.organizationId,
          actorId: token.userId,
          action: "member.joined",
          entityType: "OrganizationMember",
          entityId: updated.id,
          metadata: {}
        },
        tx
      );
      return updated;
    });

    const { rawToken: sessionToken } = await this.sessions.createSession(token.userId, meta);
    return { member, rawSessionToken: sessionToken };
  }

  async list(organizationId: string, cursor?: string, take = 50) {
    const members = await this.prisma.client.organizationMember.findMany({
      where: { organizationId, status: { not: "REMOVED" } },
      orderBy: { invitedAt: "asc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { email: true, name: true } } }
    });
    const hasMore = members.length > take;
    const page = hasMore ? members.slice(0, take) : members;
    return {
      items: page.map((m) => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        status: m.status,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }

  async changeRole(organizationId: string, memberId: string, newRole: string, actorId: string) {
    const member = await this.findActiveOrThrow(organizationId, memberId);
    if (member.role === "OWNER") {
      throw new DomainError("CANNOT_MODIFY_OWNER", "The organization owner's role cannot be changed here.", 400);
    }
    if (newRole === "OWNER") {
      throw new DomainError("CANNOT_GRANT_OWNER", "Ownership transfer is not supported yet.", 400);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.organizationMember.update({
        where: { id: memberId },
        data: { role: newRole as never }
      });
      await this.audit.record(
        {
          organizationId,
          actorId,
          action: "member.role_changed",
          entityType: "OrganizationMember",
          entityId: memberId,
          metadata: { from: member.role, to: newRole }
        },
        tx
      );
      return updated;
    });
  }

  async remove(organizationId: string, memberId: string, actorId: string) {
    const member = await this.findActiveOrThrow(organizationId, memberId);
    if (member.role === "OWNER") {
      throw new DomainError("CANNOT_REMOVE_OWNER", "The organization owner cannot be removed.", 400);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.organizationMember.update({
        where: { id: memberId },
        data: { status: "REMOVED" }
      });
      await this.audit.record(
        {
          organizationId,
          actorId,
          action: "member.removed",
          entityType: "OrganizationMember",
          entityId: memberId,
          metadata: {}
        },
        tx
      );
      return updated;
    });
  }

  private async findActiveOrThrow(organizationId: string, memberId: string) {
    const member = await this.prisma.client.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || member.organizationId !== organizationId || member.status === "REMOVED") {
      throw new NotFoundDomainError("Member");
    }
    return member;
  }
}
