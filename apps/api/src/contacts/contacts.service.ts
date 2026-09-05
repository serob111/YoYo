import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, cursor?: string, take = 50) {
    const contacts = await this.prisma.client.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });

    const hasMore = contacts.length > take;
    const page = hasMore ? contacts.slice(0, take) : contacts;
    return {
      items: page.map((c) => ({ id: c.id, displayName: c.displayName, createdAt: c.createdAt })),
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
}
