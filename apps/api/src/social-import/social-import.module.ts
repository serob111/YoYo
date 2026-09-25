import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { OutboxModule } from "../common/outbox.module";
import { SocialImportController } from "./social-import.controller";
import { SocialImportService } from "./social-import.service";

@Module({
  imports: [AuthModule, TenantGuardsModule, OutboxModule],
  controllers: [SocialImportController],
  providers: [SocialImportService],
  exports: [SocialImportService]
})
export class SocialImportModule {}
