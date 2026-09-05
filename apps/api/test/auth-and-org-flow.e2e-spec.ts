import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { buildTestApp, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";
import { parseSetCookies, cookieHeader } from "./utils/cookies";
import { findLastEmailToken, closeEmailQueueInspector } from "./utils/email-queue-inspector";

describe("Signup -> create org -> invite -> accept -> role change (Phase 1 exit flow)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await closeEmailQueueInspector();
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  it("walks the full end-to-end flow", async () => {
    const owner = await signupUser(app);

    const createOrgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Acme Bakery" })
      .expect(201);

    expect(createOrgRes.body.myRole).toBe("OWNER");
    const organizationId: string = createOrgRes.body.id;

    const inviteEmail = "agent@example.com";
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/members/invite`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ email: inviteEmail, role: "AGENT" })
      .expect(201);

    const inviteToken = await findLastEmailToken(inviteEmail, "ORGANIZATION_INVITE");

    const acceptRes = await request(app.getHttpServer()).post("/members/accept-invite").send({ token: inviteToken }).expect(201);
    expect(acceptRes.body.role).toBe("AGENT");
    const agentCookies = parseSetCookies(acceptRes.headers["set-cookie"] as unknown as string[]);
    const agentCookieHeader = cookieHeader(agentCookies);
    const agentCsrfToken = agentCookies["yoyo_csrf"]!;

    const membersRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/members`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    expect(membersRes.body.items).toHaveLength(2);
    const agentMember = membersRes.body.items.find((m: { email: string }) => m.email === inviteEmail);
    expect(agentMember.status).toBe("ACTIVE");

    // The newly accepted agent cannot manage members (not OWNER/ADMIN).
    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/members/invite`)
      .set("Cookie", agentCookieHeader)
      .set("x-csrf-token", agentCsrfToken)
      .send({ email: "someone-else@example.com", role: "VIEWER" })
      .expect(403);

    const roleChangeRes = await request(app.getHttpServer())
      .patch(`/organizations/${organizationId}/members/${agentMember.id}/role`)
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ role: "MANAGER" })
      .expect(200);
    expect(roleChangeRes.body.role).toBe("MANAGER");

    const auditRes = await request(app.getHttpServer())
      .get(`/organizations/${organizationId}/audit-log`)
      .set("Cookie", owner.cookieHeader)
      .expect(200);
    const actions = auditRes.body.items.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["organization.created", "member.invited", "member.joined", "member.role_changed"]));
  });

  it("rejects a CSRF-missing mutation from an authenticated session", async () => {
    const owner = await signupUser(app);
    await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      // no x-csrf-token header
      .send({ name: "No CSRF Co" })
      .expect(403);
  });

  it("enforces rate limiting on repeated failed logins", async () => {
    const owner = await signupUser(app, { password: "the-real-password-123" });
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).post("/auth/login").send({ email: owner.email, password: "wrong-password" });
    }
    await request(app.getHttpServer()).post("/auth/login").send({ email: owner.email, password: "wrong-password" }).expect(429);
  });
});
