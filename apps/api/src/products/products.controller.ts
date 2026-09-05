import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { upsertProductSchema, type UpsertProductInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductsService } from "./products.service";

@Controller("organizations/:organizationId/products")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string) {
    return this.products.list(organizationId);
  }

  @Post()
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async create(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(upsertProductSchema)) body: UpsertProductInput) {
    return this.products.create(organizationId, body);
  }

  @Patch(":productId")
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(upsertProductSchema)) body: UpsertProductInput
  ) {
    return this.products.update(organizationId, productId, body);
  }

  @Delete(":productId")
  @RequireCapability("manageAI")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("productId") productId: string) {
    await this.products.remove(organizationId, productId);
    return { success: true };
  }
}
