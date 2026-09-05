import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { ContactsService } from "./contacts.service";

@Controller("organizations/:organizationId/contacts")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("cursor") cursor?: string) {
    return this.contacts.list(organizationId, cursor);
  }

  @Get(":contactId")
  async get(@Param("organizationId") organizationId: string, @Param("contactId") contactId: string) {
    return this.contacts.getOrThrow(organizationId, contactId);
  }
}
