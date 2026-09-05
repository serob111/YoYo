import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { OutboxModule } from "../common/outbox.module";
import { KnowledgeController } from "./knowledge.controller";
import { KnowledgeService } from "./knowledge.service";

@Module({
  imports: [AuthModule, TenantGuardsModule, OutboxModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService]
})
export class KnowledgeModule {}
