import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { getOrCreateDefaultPipeline } from "@yoyo/database";
import { createTestAutomation, createTestConnectedAccount, createTestContact, createTestFollowUp } from "@yoyo/testing";
import { TokenEncryptionService } from "@yoyo/crypto";
import { executeFollowUp, processAutomationTrigger } from "@yoyo/worker-automations";
import { buildTestApp, getPrisma, resetTestDatabase, resetTestRedis } from "./utils/test-app";
import { signupUser } from "./utils/auth-helpers";

const tokenEncryption = new TokenEncryptionService(process.env.ENCRYPTION_KEY!);

describe("Automations & follow-ups flow", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetTestDatabase(app);
    await resetTestRedis(app);
  });

  async function seedOrgWithContact() {
    const owner = await signupUser(app);
    const orgRes = await request(app.getHttpServer())
      .post("/organizations")
      .set("Cookie", owner.cookieHeader)
      .set("x-csrf-token", owner.csrfToken)
      .send({ name: "Test Bakery" })
      .expect(201);
    const organizationId: string = orgRes.body.id;

    const prisma = getPrisma(app);
    const contact = await createTestContact(prisma, { organizationId, displayName: "Jane Customer" });
    return { owner, organizationId, contact };
  }

  async function seedLeadWithConversation(organizationId: string, contactId: string) {
    const prisma = getPrisma(app);
    const connectedAccount = await createTestConnectedAccount(prisma, { organizationId, encryptedAccessToken: tokenEncryption.encrypt("fake-token") });
    const conversation = await prisma.conversation.create({
      data: { organizationId, connectedAccountId: connectedAccount.id, contactId, provider: "INSTAGRAM" }
    });
    const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
    const lead = await prisma.lead.create({
      data: {
        organizationId,
        contactId,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        title: "Test lead",
        sourceConversationId: conversation.id
      }
    });
    return { lead, conversation, pipeline };
  }

  describe("processAutomationTrigger", () => {
    it("fires a LEAD_CREATED automation's CREATE_FOLLOW_UP action when a lead is created via the API", async () => {
      const { owner, organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      await createTestAutomation(prisma, {
        organizationId,
        triggerType: "LEAD_CREATED",
        actionType: "CREATE_FOLLOW_UP",
        actionConfig: { delayMinutes: 60, followUpActionType: "SEND_MESSAGE", text: "Just checking in!" }
      });

      const leadRes = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/leads`)
        .set("Cookie", owner.cookieHeader)
        .set("x-csrf-token", owner.csrfToken)
        .send({ contactId: contact.id, title: "New inquiry" })
        .expect(201);

      const outboxRow = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: leadRes.body.id, eventType: "lead.created" } });
      const result = await processAutomationTrigger(prisma, {
        outboxEventId: outboxRow.id,
        eventType: "lead.created",
        organizationId,
        leadId: leadRes.body.id,
        payload: {}
      });

      expect(result).toBe("processed");
      const followUp = await prisma.followUp.findFirstOrThrow({ where: { leadId: leadRes.body.id } });
      expect(followUp.actionType).toBe("SEND_MESSAGE");
      expect(followUp.scheduledFor.getTime()).toBeGreaterThan(Date.now());

      const execution = await prisma.automationExecution.findFirstOrThrow({ where: { triggerEventId: outboxRow.id } });
      expect(execution.status).toBe("COMPLETED");
    });

    it("only fires a LEAD_STAGE_CHANGED automation scoped to one toStageId when that exact stage is reached", async () => {
      const { organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
      const qualifiedStage = pipeline.stages.find((s) => s.name === "Qualified")!;
      const contactedStage = pipeline.stages.find((s) => s.name === "Contacted")!;
      const lead = await prisma.lead.create({
        data: { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, title: "Scoped test lead" }
      });

      await createTestAutomation(prisma, {
        organizationId,
        triggerType: "LEAD_STAGE_CHANGED",
        triggerConfig: { toStageId: qualifiedStage.id },
        actionType: "CREATE_TASK",
        actionConfig: { title: "Lead is qualified!" }
      });

      // Move to Contacted (not the scoped stage) - should not fire.
      const eventA = await prisma.outboxEvent.create({
        data: { organizationId, aggregateType: "Lead", aggregateId: lead.id, eventType: "lead.stage_changed", payload: { toStageId: contactedStage.id } }
      });
      await processAutomationTrigger(prisma, {
        outboxEventId: eventA.id,
        eventType: "lead.stage_changed",
        organizationId,
        leadId: lead.id,
        payload: { toStageId: contactedStage.id }
      });
      expect(await prisma.task.count({ where: { leadId: lead.id } })).toBe(0);

      // Move to Qualified (the scoped stage) - should fire.
      const eventB = await prisma.outboxEvent.create({
        data: { organizationId, aggregateType: "Lead", aggregateId: lead.id, eventType: "lead.stage_changed", payload: { toStageId: qualifiedStage.id } }
      });
      await processAutomationTrigger(prisma, {
        outboxEventId: eventB.id,
        eventType: "lead.stage_changed",
        organizationId,
        leadId: lead.id,
        payload: { toStageId: qualifiedStage.id }
      });
      expect(await prisma.task.count({ where: { leadId: lead.id } })).toBe(1);
    });

    it("does not duplicate an AutomationExecution or its action when processed concurrently for the same trigger event", async () => {
      const { organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      const pipeline = await getOrCreateDefaultPipeline(prisma, organizationId);
      const lead = await prisma.lead.create({
        data: { organizationId, contactId: contact.id, pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, title: "Concurrency test lead" }
      });
      await createTestAutomation(prisma, {
        organizationId,
        triggerType: "LEAD_CREATED",
        actionType: "CREATE_TASK",
        actionConfig: { title: "Follow up on new lead" }
      });
      const outboxRow = await prisma.outboxEvent.create({
        data: { organizationId, aggregateType: "Lead", aggregateId: lead.id, eventType: "lead.created", payload: {} }
      });

      await Promise.all([
        processAutomationTrigger(prisma, { outboxEventId: outboxRow.id, eventType: "lead.created", organizationId, leadId: lead.id, payload: {} }),
        processAutomationTrigger(prisma, { outboxEventId: outboxRow.id, eventType: "lead.created", organizationId, leadId: lead.id, payload: {} })
      ]);

      const executions = await prisma.automationExecution.findMany({ where: { triggerEventId: outboxRow.id } });
      expect(executions).toHaveLength(1);
      expect(await prisma.task.count({ where: { leadId: lead.id } })).toBe(1);
    });
  });

  describe("executeFollowUp", () => {
    it("sends a message through the existing outbound-send pipeline for a SEND_MESSAGE follow-up", async () => {
      const { organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      const { lead } = await seedLeadWithConversation(organizationId, contact.id);
      const followUp = await createTestFollowUp(prisma, {
        organizationId,
        leadId: lead.id,
        actionType: "SEND_MESSAGE",
        actionConfig: { text: "Just checking in on your order!" }
      });

      const result = await executeFollowUp(prisma, followUp.id);

      expect(result).toBe("sent");
      const updated = await prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id } });
      expect(updated.status).toBe("SENT");
      expect(updated.executedAt).not.toBeNull();

      const message = await prisma.message.findFirstOrThrow({ where: { organizationId, direction: "OUTBOUND" } });
      expect(message).toMatchObject({ senderType: "AUTOMATION", direction: "OUTBOUND", status: "PENDING", text: "Just checking in on your order!" });
      const outboxRows = await prisma.outboxEvent.findMany({ where: { aggregateId: message.id } });
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]?.eventType).toBe("message.outbound_pending");

      const activity = await prisma.activity.findFirstOrThrow({ where: { leadId: lead.id } });
      expect(activity.type).toBe("SYSTEM");
    });

    it("creates a Task for a CREATE_TASK follow-up", async () => {
      const { organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      const { lead } = await seedLeadWithConversation(organizationId, contact.id);
      const followUp = await createTestFollowUp(prisma, {
        organizationId,
        leadId: lead.id,
        actionType: "CREATE_TASK",
        actionConfig: { title: "Call the customer back" }
      });

      const result = await executeFollowUp(prisma, followUp.id);

      expect(result).toBe("sent");
      const task = await prisma.task.findFirstOrThrow({ where: { leadId: lead.id } });
      expect(task.title).toBe("Call the customer back");
    });

    it("does not double-send when two workers claim the same follow-up concurrently", async () => {
      const { organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      const { lead } = await seedLeadWithConversation(organizationId, contact.id);
      const followUp = await createTestFollowUp(prisma, { organizationId, leadId: lead.id });

      const [a, b] = await Promise.all([executeFollowUp(prisma, followUp.id), executeFollowUp(prisma, followUp.id)]);

      expect([a, b].sort()).toEqual(["sent", "skipped"]);
      const messages = await prisma.message.findMany({ where: { organizationId, direction: "OUTBOUND" } });
      expect(messages).toHaveLength(1);
    });
  });

  describe("cancellation", () => {
    it("cancels a lead's pending follow-ups when it's moved to a Won/Lost stage", async () => {
      const { owner, organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);

      const leadRes = await request(app.getHttpServer())
        .post(`/organizations/${organizationId}/leads`)
        .set("Cookie", owner.cookieHeader)
        .set("x-csrf-token", owner.csrfToken)
        .send({ contactId: contact.id, title: "Closing soon" })
        .expect(201);

      const followUp = await createTestFollowUp(prisma, {
        organizationId,
        leadId: leadRes.body.id,
        scheduledFor: new Date(Date.now() + 24 * 60 * 60_000)
      });

      const pipelineRes = await request(app.getHttpServer()).get(`/organizations/${organizationId}/pipeline`).set("Cookie", owner.cookieHeader).expect(200);
      const wonStage = pipelineRes.body.stages.find((s: { name: string }) => s.name === "Won");

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/leads/${leadRes.body.id}/stage`)
        .set("Cookie", owner.cookieHeader)
        .set("x-csrf-token", owner.csrfToken)
        .send({ stageId: wonStage.id })
        .expect(200);

      const updated = await prisma.followUp.findUniqueOrThrow({ where: { id: followUp.id } });
      expect(updated.status).toBe("CANCELLED");
      expect(updated.cancelledAt).not.toBeNull();
    });

    it("rejects cancelling a follow-up that is no longer pending", async () => {
      const { owner, organizationId, contact } = await seedOrgWithContact();
      const prisma = getPrisma(app);
      const { lead } = await seedLeadWithConversation(organizationId, contact.id);
      const followUp = await createTestFollowUp(prisma, { organizationId, leadId: lead.id });
      await executeFollowUp(prisma, followUp.id);

      await request(app.getHttpServer())
        .patch(`/organizations/${organizationId}/follow-ups/${followUp.id}/cancel`)
        .set("Cookie", owner.cookieHeader)
        .set("x-csrf-token", owner.csrfToken)
        .expect(409);
    });
  });
});
