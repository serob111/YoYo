import { Module } from "@nestjs/common";
import { TenantContextGuard } from "./tenant-context.guard";
import { CapabilityGuard } from "./capability.guard";

/**
 * Shared module for the two guards used by every org-scoped controller
 * (TenantContextGuard, CapabilityGuard). Import this instead of redeclaring
 * the guards as providers in each feature module.
 */
@Module({
  providers: [TenantContextGuard, CapabilityGuard],
  exports: [TenantContextGuard, CapabilityGuard]
})
export class TenantGuardsModule {}
