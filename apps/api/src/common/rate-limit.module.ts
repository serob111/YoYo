import { Module } from "@nestjs/common";
import { RateLimitService } from "./rate-limit.service";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";

@Module({
  providers: [RateLimitService, AuthRateLimitGuard],
  exports: [RateLimitService, AuthRateLimitGuard]
})
export class RateLimitModule {}
