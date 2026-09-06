import { Module } from "@nestjs/common";
import { OutboxService } from "./outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";
import { FollowUpDispatcherService } from "./follow-up-dispatcher.service";
import { ContentDispatcherService } from "./content-dispatcher.service";

@Module({
  providers: [OutboxService, OutboxDispatcherService, FollowUpDispatcherService, ContentDispatcherService],
  exports: [OutboxService, OutboxDispatcherService, FollowUpDispatcherService, ContentDispatcherService]
})
export class OutboxModule {}
