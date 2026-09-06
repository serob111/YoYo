import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { OutboxModule } from "../common/outbox.module";
import { AuditModule } from "../audit/audit.module";
import { MediaModule } from "../media/media.module";
import { ContentController } from "./content.controller";
import { ContentService } from "./content.service";

@Module({
  imports: [AuthModule, TenantGuardsModule, OutboxModule, AuditModule, MediaModule],
  controllers: [ContentController],
  providers: [ContentService]
})
export class ContentModule {}
