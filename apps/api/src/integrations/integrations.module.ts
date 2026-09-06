import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { OAuthStateService } from "./oauth-state.service";
import { InstagramProviderFactory } from "./instagram-provider.factory";
import { TikTokProviderFactory } from "./tiktok-provider.factory";
import { ConnectedAccountsService } from "./connected-accounts.service";
import {
  IntegrationsController,
  InstagramOAuthCallbackController,
  TikTokIntegrationsController,
  TikTokOAuthCallbackController,
  ConnectedAccountsController
} from "./integrations.controller";

@Module({
  imports: [AuthModule, AuditModule, TenantGuardsModule],
  controllers: [IntegrationsController, InstagramOAuthCallbackController, TikTokIntegrationsController, TikTokOAuthCallbackController, ConnectedAccountsController],
  providers: [OAuthStateService, InstagramProviderFactory, TikTokProviderFactory, ConnectedAccountsService],
  exports: [ConnectedAccountsService, InstagramProviderFactory, TikTokProviderFactory]
})
export class IntegrationsModule {}
