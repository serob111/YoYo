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
import { ContactsModule } from "./contacts/contacts.module";
import { PipelinesModule } from "./pipelines/pipelines.module";
import { LeadsModule } from "./leads/leads.module";
import { TasksModule } from "./tasks/tasks.module";
import { TagsModule } from "./tags/tags.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { AutomationsModule } from "./automations/automations.module";
import { MediaModule } from "./media/media.module";
import { ContentModule } from "./content/content.module";
import { PropertiesModule } from "./properties/properties.module";
import { ViewingsModule } from "./viewings/viewings.module";
import { BuyerPreferencesModule } from "./buyer-preferences/buyer-preferences.module";
import { StorefrontModule } from "./storefront/storefront.module";
import { SocialImportModule } from "./social-import/social-import.module";
import { DemoModule } from "./demo/demo.module";

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
    KnowledgeModule,
    ContactsModule,
    PipelinesModule,
    LeadsModule,
    TasksModule,
    TagsModule,
    FollowUpsModule,
    AutomationsModule,
    MediaModule,
    ContentModule,
    PropertiesModule,
    ViewingsModule,
    BuyerPreferencesModule,
    StorefrontModule,
    SocialImportModule,
    DemoModule
  ],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
