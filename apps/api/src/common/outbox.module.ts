import { Module } from "@nestjs/common";
import { OutboxService } from "./outbox.service";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

@Module({
  providers: [OutboxService, OutboxDispatcherService],
  exports: [OutboxService, OutboxDispatcherService]
})
export class OutboxModule {}
