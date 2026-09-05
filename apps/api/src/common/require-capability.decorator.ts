import { SetMetadata } from "@nestjs/common";
import type { Capability } from "@yoyo/permissions";

export const CAPABILITY_KEY = "required_capability";

export const RequireCapability = (capability: Capability) => SetMetadata(CAPABILITY_KEY, capability);
