import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { bookViewingSchema, storefrontAvailabilityDateSchema, type BookViewingInput } from "@yoyo/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StorefrontRateLimitGuard } from "../common/storefront-rate-limit.guard";
import { StorefrontService } from "./storefront.service";

// No session/tenant/CSRF guards at all - genuinely public. Routed by org slug
// (not id) since this is meant to be a shareable public URL. Only the booking
// route (a public write) gets a guard, and it's a rate limiter, not auth.
@Controller("storefront")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get(":orgSlug")
  async get(@Param("orgSlug") orgSlug: string) {
    return this.storefront.getStorefront(orgSlug);
  }

  @Get(":orgSlug/properties/:propertyId")
  async getProperty(@Param("orgSlug") orgSlug: string, @Param("propertyId") propertyId: string) {
    return this.storefront.getProperty(orgSlug, propertyId);
  }

  @Get(":orgSlug/properties/:propertyId/availability")
  async getAvailability(
    @Param("orgSlug") orgSlug: string,
    @Param("propertyId") propertyId: string,
    @Query("date", new ZodValidationPipe(storefrontAvailabilityDateSchema)) date: string
  ) {
    return this.storefront.getAvailability(orgSlug, propertyId, date);
  }

  @Post(":orgSlug/properties/:propertyId/book-viewing")
  @UseGuards(StorefrontRateLimitGuard)
  async bookViewing(
    @Param("orgSlug") orgSlug: string,
    @Param("propertyId") propertyId: string,
    @Body(new ZodValidationPipe(bookViewingSchema)) body: BookViewingInput
  ) {
    return this.storefront.bookViewing(orgSlug, propertyId, body);
  }
}
