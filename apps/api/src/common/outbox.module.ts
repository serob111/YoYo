import { Module } from "@nestjs/common";
import { OutboxService } from "./outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { FollowUpDispatcherService } from "./follow-up-dispatcher.service";

@Module({
  providers: [OutboxService, OutboxDispatcherService, FollowUpDispatcherService],
  exports: [OutboxService, OutboxDispatcherService, FollowUpDispatcherService]
})
export class OutboxModule {}
