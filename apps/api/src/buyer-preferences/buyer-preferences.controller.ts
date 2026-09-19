import { Body, Controller, Get, Param, Put, Query, UseGuards } from "@nestjs/common";
import { transactionTypeSchema, upsertBuyerPreferenceSchema, type UpsertBuyerPreferenceInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BuyerPreferencesService } from "./buyer-preferences.service";

@Controller("organizations/:organizationId/contacts/:contactId/buyer-preferences")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class BuyerPreferencesController {
  constructor(private readonly buyerPreferences: BuyerPreferencesService) {}

  @Get()
  async get(
    @Param("organizationId") organizationId: string,
    @Param("contactId") contactId: string,
    @Query("transactionType", new ZodValidationPipe(transactionTypeSchema)) transactionType: "SALE" | "RENT"
  ) {
    return this.buyerPreferences.getOrThrow(organizationId, contactId, transactionType);
  }

  @Put()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async upsert(
    @Param("organizationId") organizationId: string,
    @Param("contactId") contactId: string,
    @Body(new ZodValidationPipe(upsertBuyerPreferenceSchema)) body: UpsertBuyerPreferenceInput
  ) {
    return this.buyerPreferences.upsert(organizationId, contactId, body);
  }
}
