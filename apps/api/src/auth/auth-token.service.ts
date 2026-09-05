import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnv } from "@yoyo/config";
import type { AuthTokenPurpose, MagicLinkToken } from "@yoyo/database";
import { API_ENV } from "../common/env.tokens";
import { PrismaService } from "../common/prisma.service";
import { InvalidOrExpiredTokenError } from "../common/domain-errors";
import { generateOpaqueToken, hashToken } from "./token.util";

/**
 * Backs magic-link login, org invites, password reset, and email verification with
 * one single-use token table (see docs/adr/0004). All tokens here follow the same
 * lifecycle: issue -> single consume -> expire.
 */
@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  async issue(params: { userId: string; purpose: AuthTokenPurpose; organizationMemberId?: string; ttlMinutes?: number }): Promise<{ rawToken: string; token: MagicLinkToken }> {
    const rawToken = generateOpaqueToken();
    const token = await this.prisma.client.magicLinkToken.create({
      data: {
        userId: params.userId,
        purpose: params.purpose,
        organizationMemberId: params.organizationMemberId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + (params.ttlMinutes ?? this.env.MAGIC_LINK_TTL_MINUTES) * 60 * 1000)
      }
    });
    return { rawToken, token };
  }

  async consume(rawToken: string, expectedPurpose: AuthTokenPurpose): Promise<MagicLinkToken> {
    const token = await this.prisma.client.magicLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.purpose !== expectedPurpose) {
      throw new InvalidOrExpiredTokenError();
    }
    if (token.consumedAt || token.expiresAt.getTime() < Date.now()) {
      throw new InvalidOrExpiredTokenError();
    }
    // Atomic single-use guard: only succeeds if still unconsumed, closing the race
    // window between two concurrent requests consuming the same token.
    const result = await this.prisma.client.magicLinkToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: new Date() }
    });
    if (result.count === 0) {
      throw new InvalidOrExpiredTokenError();
    }
    return token;
  }
}
