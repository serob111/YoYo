import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { createContactSchema, type CreateContactInput } from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ContactsService } from "./contacts.service";

@Controller("organizations/:organizationId/contacts")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  async list(@Param("organizationId") organizationId: string, @Query("cursor") cursor?: string, @Query("search") search?: string) {
    return this.contacts.list(organizationId, cursor, search);
  }

  @Get(":contactId")
  async get(@Param("organizationId") organizationId: string, @Param("contactId") contactId: string) {
    return this.contacts.getOrThrow(organizationId, contactId);
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactInput) {
    return this.contacts.create(organizationId, body);
  }
}
