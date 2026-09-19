// Bulk data generator for staging load testing - NOT a general product seed
// script. Produces realistic volume (10 orgs / ~1,000 properties / ~10,000
// leads / up to 50 logins) so k6 scenarios in load-test/ have something
// resembling production scale to run against. Safe to re-run: every entity
// is keyed off a fixed "load-test-*" slug/email prefix and upserted or
// skipped if already present, so a second run doesn't duplicate data.
//
// Usage: DATABASE_URL=... ENCRYPTION_KEY=... node dist/seed-load-test.js
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { PrismaClient, OrganizationRole, MemberStatus, Provider, ConnectedAccountStatus, PropertyType, PropertyStatus, TransactionType } from "@prisma/client";
import { TokenEncryptionService } from "@yoyo/crypto";
import { getOrCreateDefaultPipeline } from "./crm-helpers";

const ORG_COUNT = 10;
const USERS_PER_ORG = 5; // 10 * 5 = 50 concurrent-login candidates
const CONTACTS_PER_ORG = 300;
const PROPERTIES_PER_ORG = 100;
const LEADS_PER_ORG = 1000;
const CHUNK_SIZE = 500;

// Known, fixed credentials so k6's crm-users.js can log in deterministically.
// Never used for anything but staging load testing.
export const LOAD_TEST_PASSWORD = "load-test-p@ssw0rd-2026";
const EMAIL_DOMAIN = "loadtest.yoyo.internal";

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const PROPERTY_TYPES: PropertyType[] = [PropertyType.APARTMENT, PropertyType.HOUSE, PropertyType.COMMERCIAL, PropertyType.LAND];
const PROPERTY_CITIES = ["Yerevan", "Tbilisi", "Batumi", "Vanadzor", "Gyumri"];

async function seedOrg(
  prisma: PrismaClient,
  tokenEncryption: TokenEncryptionService,
  passwordHash: string,
  orgIndex: number
): Promise<void> {
  const slug = `load-test-org-${orgIndex}`;
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    console.log(`[${slug}] already seeded, skipping`);
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: `Load Test Agency ${orgIndex}`,
      slug,
      vertical: "real_estate"
    }
  });

  await prisma.businessProfile.create({
    data: {
      organizationId: org.id,
      businessName: `Load Test Agency ${orgIndex}`,
      timezone: "UTC",
      aiEnabled: true
    }
  });

  const pipeline = await getOrCreateDefaultPipeline(prisma, org.id);
  const stages = pipeline.stages;

  const users = await Promise.all(
    Array.from({ length: USERS_PER_ORG }, async (_unused, userIndex) => {
      const email = `org${orgIndex}-user${userIndex}@${EMAIL_DOMAIN}`;
      return prisma.user.create({
        data: {
          email,
          passwordHash,
          name: `Load Test User ${orgIndex}-${userIndex}`,
          emailVerifiedAt: new Date()
        }
      });
    })
  );

  await prisma.organizationMember.createMany({
    data: users.map((user, userIndex) => ({
      organizationId: org.id,
      userId: user.id,
      role: userIndex === 0 ? OrganizationRole.OWNER : OrganizationRole.AGENT,
      status: MemberStatus.ACTIVE,
      joinedAt: new Date()
    }))
  });

  // Fake token - decryptable, but never sent anywhere real. externalAccountId
  // is what the k6 webhook script signs payloads against.
  const externalAccountId = `load_test_ig_${orgIndex}`;
  await prisma.connectedAccount.create({
    data: {
      organizationId: org.id,
      provider: Provider.INSTAGRAM,
      externalAccountId,
      displayName: `Load Test Agency ${orgIndex}`,
      username: `load_test_agency_${orgIndex}`,
      status: ConnectedAccountStatus.CONNECTED,
      encryptedAccessToken: tokenEncryption.encrypt(`fake-load-test-token-${orgIndex}`),
      grantedScopes: ["instagram_business_manage_messages"]
    }
  });

  // Contacts (needed as FKs for leads).
  const contactRows = Array.from({ length: CONTACTS_PER_ORG }, (_unused, i) => ({
    id: randomUUID(),
    organizationId: org.id,
    displayName: `Load Test Contact ${orgIndex}-${i}`
  }));
  for (const batch of chunk(contactRows, CHUNK_SIZE)) {
    await prisma.contact.createMany({ data: batch });
  }

  // Properties.
  const propertyRows = Array.from({ length: PROPERTIES_PER_ORG }, (_unused, i) => ({
    id: randomUUID(),
    organizationId: org.id,
    title: `Load Test Property ${orgIndex}-${i}`,
    propertyType: PROPERTY_TYPES[i % PROPERTY_TYPES.length]!,
    status: PropertyStatus.ACTIVE,
    transactionType: i % 3 === 0 ? TransactionType.RENT : TransactionType.SALE,
    priceCents: 50_000_00 + i * 1000_00,
    city: PROPERTY_CITIES[i % PROPERTY_CITIES.length],
    bedrooms: 1 + (i % 4),
    areaSqm: 40 + (i % 20) * 5
  }));
  for (const batch of chunk(propertyRows, CHUNK_SIZE)) {
    await prisma.property.createMany({ data: batch });
  }

  // Leads, spread across the pipeline's real stages and assigned round-robin
  // across seeded users (so lead lists aren't all "unassigned").
  const leadRows = Array.from({ length: LEADS_PER_ORG }, (_unused, i) => ({
    id: randomUUID(),
    organizationId: org.id,
    contactId: contactRows[i % contactRows.length]!.id,
    pipelineId: pipeline.id,
    stageId: stages[i % stages.length]!.id,
    title: `Load Test Lead ${orgIndex}-${i}`,
    assignedUserId: users[i % users.length]!.id
  }));
  for (const batch of chunk(leadRows, CHUNK_SIZE)) {
    await prisma.lead.createMany({ data: batch });
  }

  console.log(
    `[${slug}] seeded: org=${org.id} users=${users.length} contacts=${contactRows.length} properties=${propertyRows.length} leads=${leadRows.length} externalAccountId=${externalAccountId}`
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY is required (must match the target environment's real key)");

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const tokenEncryption = new TokenEncryptionService(encryptionKey);
  const passwordHash = await argon2.hash(LOAD_TEST_PASSWORD, { type: argon2.argon2id });

  try {
    for (let orgIndex = 0; orgIndex < ORG_COUNT; orgIndex++) {
      await seedOrg(prisma, tokenEncryption, passwordHash, orgIndex);
    }
    console.log(`\nDone. Login with any org${"{0-9}"}-user${"{0-4}"}@${EMAIL_DOMAIN} / "${LOAD_TEST_PASSWORD}"`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
