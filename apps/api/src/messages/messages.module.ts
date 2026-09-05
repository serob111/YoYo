import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TenantGuardsModule } from "../common/tenant-guards.module";
import { OutboxModule } from "../common/outbox.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [AuthModule, TenantGuardsModule, OutboxModule, ConversationsModule],
  controllers: [MessagesController],
  providers: [MessagesService]
})
export class MessagesModule {}
