import type { OrganizationRole, PrismaClient } from "@yoyo/database";
import { randomUUID } from "node:crypto";

export async function createTestUser(
  prisma: PrismaClient,
  overrides: Partial<{ email: string; name: string; passwordHash: string; emailVerifiedAt: Date }> = {}
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `test-${randomUUID()}@example.com`,
      name: overrides.name ?? "Test User",
      passwordHash: overrides.passwordHash,
      emailVerifiedAt: overrides.emailVerifiedAt ?? new Date()
    }
  });
}

export async function createTestOrganization(
  prisma: PrismaClient,
  overrides: Partial<{ name: string; slug: string }> = {}
) {
  const suffix = randomUUID().slice(0, 8);
  return prisma.organization.create({
    data: {
      name: overrides.name ?? `Test Org ${suffix}`,
      slug: overrides.slug ?? `test-org-${suffix}`
    }
  });
}

export async function createTestMembership(
  prisma: PrismaClient,
  params: { organizationId: string; userId: string; role: OrganizationRole; status?: "INVITED" | "ACTIVE" | "REMOVED" }
) {
  return prisma.organizationMember.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      role: params.role,
      status: params.status ?? "ACTIVE",
      joinedAt: (params.status ?? "ACTIVE") === "ACTIVE" ? new Date() : null
    }
  });
}

export async function createOrgWithOwner(prisma: PrismaClient, overrides: { orgName?: string; ownerEmail?: string } = {}) {
  const owner = await createTestUser(prisma, { email: overrides.ownerEmail });
  const organization = await createTestOrganization(prisma, { name: overrides.orgName });
  const membership = await createTestMembership(prisma, {
    organizationId: organization.id,
    userId: owner.id,
    role: "OWNER"
  });
  return { owner, organization, membership };
}
