import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CommonModule } from "./common/common.module";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { GlobalExceptionFilter } from "./common/http-exception.filter";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { MembersModule } from "./members/members.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [CommonModule, AuthModule, UsersModule, OrganizationsModule, MembersModule, AuditModule, HealthModule, NotificationsModule],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
