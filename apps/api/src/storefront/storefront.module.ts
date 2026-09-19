import { Module } from "@nestjs/common";
import { RateLimitModule } from "../common/rate-limit.module";
import { StorefrontController } from "./storefront.controller";
import { StorefrontService } from "./storefront.service";

@Module({
  imports: [RateLimitModule],
  controllers: [StorefrontController],
  providers: [StorefrontService]
})
export class StorefrontModule {}
