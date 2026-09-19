import { Module } from "@nestjs/common";
import { RateLimitService } from "./rate-limit.service";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";
import { StorefrontRateLimitGuard } from "./storefront-rate-limit.guard";

@Module({
  providers: [RateLimitService, AuthRateLimitGuard, StorefrontRateLimitGuard],
  exports: [RateLimitService, AuthRateLimitGuard, StorefrontRateLimitGuard]
})
export class RateLimitModule {}
