import { permissionsService, type Capability, type OrganizationRole } from "@yoyo/permissions";

/**
 * UX-only gate for showing/hiding mutating controls - the backend's
 * CapabilityGuard is the real enforcement. `role` is undefined while the
 * organization is still loading, in which case every capability check is
 * false (fail closed, not open) so buttons don't flash in before we know the role.
 */
export function useCan(role: OrganizationRole | undefined, capability: Capability): boolean {
  if (!role) return false;
  return permissionsService.can(role, capability);
}
