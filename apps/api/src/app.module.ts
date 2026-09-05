import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CommonModule } from "./common/common.module";
import { OutboxModule } from "./common/outbox.module";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { GlobalExceptionFilter } from "./common/http-exception.filter";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { MembersModule } from "./members/members.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { MessagesModule } from "./messages/messages.module";
import { BusinessModule } from "./business/business.module";
import { ProductsModule } from "./products/products.module";
import { ServicesModule } from "./services/services.module";
import { KnowledgeModule } from "./knowledge/knowledge.module";

@Module({
  imports: [
    CommonModule,
    OutboxModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    MembersModule,
    AuditModule,
    HealthModule,
    NotificationsModule,
    IntegrationsModule,
    WebhooksModule,
    ConversationsModule,
    MessagesModule,
    BusinessModule,
    ProductsModule,
    ServicesModule,
    KnowledgeModule
  ],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
