import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { BuyerPreferencesController } from "./buyer-preferences.controller";
import { BuyerPreferencesService } from "./buyer-preferences.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [BuyerPreferencesController],
  providers: [BuyerPreferencesService]
})
export class BuyerPreferencesModule {}
