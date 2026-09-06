import { Injectable } from "@nestjs/common";
import { TokenEncryptionService } from "@yoyo/crypto";
import type { Provider } from "@yoyo/database";
import type { ProviderCapabilities, ProviderProfile, TokenSet } from "@yoyo/integrations";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotFoundDomainError } from "../common/domain-errors";
import { InstagramProviderFactory } from "./instagram-provider.factory";
import { TikTokProviderFactory } from "./tiktok-provider.factory";

@Injectable()
export class ConnectedAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly instagramProviderFactory: InstagramProviderFactory,
    private readonly tiktokProviderFactory: TikTokProviderFactory
  ) {}

  async upsertFromOAuth(
    organizationId: string,
    actorId: string,
    provider: Provider,
    profile: ProviderProfile,
    tokens: TokenSet,
    capabilities: ProviderCapabilities,
    providerMetadata: Record<string, unknown> = {}
  ) {
    const encryptedAccessToken = this.tokenEncryption.encrypt(tokens.accessToken);

    const existing = await this.prisma.client.connectedAccount.findUnique({
      where: { provider_externalAccountId: { provider, externalAccountId: profile.externalAccountId } }
    });

    if (existing && existing.organizationId !== organizationId) {
      // This external account is already connected to a DIFFERENT organization.
      // Per docs/architecture/tenant-model.md, one external account maps to
      // exactly one org - refuse rather than silently reassigning ownership.
      throw new NotFoundDomainError(`${provider} account is already connected to another organization and cannot be connected here. Contact support`);
    }

    const data = {
      organizationId,
      provider,
      externalAccountId: profile.externalAccountId,
      displayName: profile.displayName,
      username: profile.username,
      accountType: profile.accountType,
      avatarUrl: profile.avatarUrl,
      status: "CONNECTED" as const,
      encryptedAccessToken,
      tokenExpiresAt: tokens.expiresAt,
      grantedScopes: tokens.scopes,
      capabilities: capabilities as unknown as object,
      providerMetadata: providerMetadata as object,
      lastSyncAt: new Date()
    };

    const account = await this.prisma.client.$transaction(async (tx) => {
      const saved = existing
        ? await tx.connectedAccount.update({ where: { id: existing.id }, data })
        : await tx.connectedAccount.create({ data });

      await this.audit.record(
        {
          organizationId,
          actorId,
          action: existing ? "integration.reconnected" : "integration.connected",
          entityType: "ConnectedAccount",
          entityId: saved.id,
          metadata: { provider, username: profile.username }
        },
        tx
      );

      return saved;
    });

    return account;
  }

  async list(organizationId: string) {
    return this.prisma.client.connectedAccount.findMany({
      where: { organizationId, status: { not: "DISCONNECTED" } },
      orderBy: { createdAt: "desc" }
    });
  }

  async disconnect(organizationId: string, connectedAccountId: string, actorId: string) {
    const account = await this.prisma.client.connectedAccount.findUnique({ where: { id: connectedAccountId } });
    if (!account || account.organizationId !== organizationId || account.status === "DISCONNECTED") {
      throw new NotFoundDomainError("Connected account");
    }

    try {
      const provider = account.provider === "TIKTOK" ? this.tiktokProviderFactory.create() : this.instagramProviderFactory.create();
      await provider.revokeAccess({ externalAccountId: account.externalAccountId, accessToken: this.tokenEncryption.decrypt(account.encryptedAccessToken) });
    } catch {
      // Best-effort; proceed to mark disconnected in our own system regardless.
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.connectedAccount.update({ where: { id: connectedAccountId }, data: { status: "DISCONNECTED" } });
      await this.audit.record(
        {
          organizationId,
          actorId,
          action: "integration.disconnected",
          entityType: "ConnectedAccount",
          entityId: connectedAccountId,
          metadata: { provider: account.provider }
        },
        tx
      );
      return updated;
    });
  }
}
