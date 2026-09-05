import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnv } from "@yoyo/config";
import type { Session, User } from "@yoyo/database";
import { API_ENV } from "../common/env.tokens";
import { PrismaService } from "../common/prisma.service";
import { generateOpaqueToken, hashToken } from "./token.util";

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  async createSession(userId: string, meta: { ipAddress?: string; userAgent?: string }): Promise<{ rawToken: string; session: Session }> {
    const rawToken = generateOpaqueToken();
    const session = await this.prisma.client.session.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + this.env.SESSION_TTL_HOURS * 60 * 60 * 1000),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      }
    });
    return { rawToken, session };
  }

  async resolveSession(rawToken: string): Promise<(Session & { user: User }) | null> {
    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true }
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    if (session.user.status !== "ACTIVE") return null;
    return session;
  }

  async revokeSession(rawToken: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
