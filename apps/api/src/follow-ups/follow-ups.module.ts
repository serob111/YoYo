import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { FollowUpsController } from "./follow-ups.controller";
import { FollowUpsService } from "./follow-ups.service";

@Module({
  imports: [AuthModule, TenantGuardsModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService]
})
export class FollowUpsModule {}
