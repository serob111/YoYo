import { Injectable } from "@nestjs/common";
import { Prisma } from "@yoyo/database";
import type { CreateAutomationInput, UpdateAutomationInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.client.automation.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  async getOrThrow(organizationId: string, automationId: string) {
    const automation = await this.prisma.client.automation.findUnique({ where: { id: automationId } });
    if (!automation || automation.organizationId !== organizationId) throw new NotFoundDomainError("Automation");
    return automation;
  }

  async create(organizationId: string, input: CreateAutomationInput) {
    const { triggerType, ...triggerConfig } = input.trigger;
    const { actionType, ...actionConfig } = input.action;

    return this.prisma.client.automation.create({
      data: {
        organizationId,
        name: input.name,
        triggerType,
        triggerConfig: Object.keys(triggerConfig).length > 0 ? (triggerConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
        actionType,
        actionConfig: actionConfig as Prisma.InputJsonValue,
        enabled: input.enabled
      }
    });
  }

  async update(organizationId: string, automationId: string, input: UpdateAutomationInput) {
    await this.getOrThrow(organizationId, automationId);

    const data: Prisma.AutomationUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.trigger !== undefined) {
      const { triggerType, ...triggerConfig } = input.trigger;
      data.triggerType = triggerType;
      data.triggerConfig = Object.keys(triggerConfig).length > 0 ? (triggerConfig as Prisma.InputJsonValue) : Prisma.JsonNull;
    }
    if (input.action !== undefined) {
      const { actionType, ...actionConfig } = input.action;
      data.actionType = actionType;
      data.actionConfig = actionConfig as Prisma.InputJsonValue;
    }

    return this.prisma.client.automation.update({ where: { id: automationId }, data });
  }

  async remove(organizationId: string, automationId: string) {
    await this.getOrThrow(organizationId, automationId);
    await this.prisma.client.automation.delete({ where: { id: automationId } });
  }

  async listExecutions(organizationId: string, automationId: string) {
    await this.getOrThrow(organizationId, automationId);
    return this.prisma.client.automationExecution.findMany({ where: { automationId }, orderBy: { createdAt: "desc" } });
  }
}
