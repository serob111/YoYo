import { Injectable } from "@nestjs/common";
import type { CreateContactInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, cursor?: string, search?: string, take = 50) {
    const contacts = await this.prisma.client.contact.findMany({
      where: {
        organizationId,
        ...(search ? { displayName: { contains: search, mode: "insensitive" } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    const hasMore = contacts.length > take;
    const page = hasMore ? contacts.slice(0, take) : contacts;
    return {
      items: page.map((c) => ({ id: c.id, displayName: c.displayName, phone: c.phone, email: c.email, createdAt: c.createdAt })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null
    };
  }

  async getOrThrow(organizationId: string, contactId: string) {
    const contact = await this.prisma.client.contact.findUnique({
      where: { id: contactId },
      include: { leads: { orderBy: { createdAt: "desc" } } }
    });
    if (!contact || contact.organizationId !== organizationId) throw new NotFoundDomainError("Contact");
    return contact;
  }

  async create(organizationId: string, input: CreateContactInput) {
    return this.prisma.client.contact.create({
      data: { organizationId, displayName: input.displayName, phone: input.phone ?? null, email: input.email ?? null }
    });
  }
}
