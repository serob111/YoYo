import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { MembersController, MemberInviteAcceptanceController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [AuthModule, AuditModule, NotificationsModule, TenantGuardsModule],
  controllers: [MembersController, MemberInviteAcceptanceController],
  providers: [MembersService]
})
export class MembersModule {}
