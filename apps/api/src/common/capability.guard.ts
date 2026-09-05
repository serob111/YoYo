import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { permissionsService, type Capability } from "@yoyo/permissions";
import { InsufficientPermissionError, TenantAccessDeniedError } from "./domain-errors";
import { CAPABILITY_KEY } from "./require-capability.decorator";

/**
 * Must run after TenantContextGuard (needs request.membership.role already resolved).
 * The single place PermissionsService.can() is consulted — see docs/architecture/rbac.md.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<Capability | undefined>(CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!capability) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.membership) {
      throw new TenantAccessDeniedError();
    }
    if (!permissionsService.can(request.membership.role, capability)) {
      throw new InsufficientPermissionError(capability);
    }
    return true;
  }
}
