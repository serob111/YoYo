import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RateLimitModule } from "../common/rate-limit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthTokenService } from "./auth-token.service";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import { SessionGuard } from "./session.guard";

@Module({
  imports: [NotificationsModule, RateLimitModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTokenService, PasswordService, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard, AuthTokenService]
})
export class AuthModule {}
