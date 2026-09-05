import { Injectable } from "@nestjs/common";
import type { UpdateTaskInput, UpsertTaskInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { NotFoundDomainError } from "../common/domain-errors";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, filters: { leadId?: string; assignedUserId?: string }) {
    return this.prisma.client.task.findMany({
      where: {
        organizationId,
        ...(filters.leadId ? { leadId: filters.leadId } : {}),
        ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async getOrThrow(organizationId: string, taskId: string) {
    const task = await this.prisma.client.task.findUnique({ where: { id: taskId } });
    if (!task || task.organizationId !== organizationId) throw new NotFoundDomainError("Task");
    return task;
  }

  async create(organizationId: string, input: UpsertTaskInput) {
    const lead = await this.prisma.client.lead.findUnique({ where: { id: input.leadId } });
    if (!lead || lead.organizationId !== organizationId) throw new NotFoundDomainError("Lead");

    return this.prisma.client.task.create({
      data: {
        organizationId,
        leadId: input.leadId,
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ?? null,
        assignedUserId: input.assignedUserId ?? null
      }
    });
  }

  async update(organizationId: string, taskId: string, input: UpdateTaskInput) {
    await this.getOrThrow(organizationId, taskId);
    return this.prisma.client.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt ?? null,
        assignedUserId: input.assignedUserId ?? null
      }
    });
  }

  async updateStatus(organizationId: string, taskId: string, status: "OPEN" | "DONE" | "CANCELLED") {
    const task = await this.getOrThrow(organizationId, taskId);

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { status, completedAt: status === "DONE" ? new Date() : null }
      });
      if (status === "DONE" && task.status !== "DONE") {
        await tx.activity.create({
          data: { organizationId, leadId: task.leadId, type: "TASK_COMPLETED", content: `Task completed: ${task.title}` }
        });
      }
      return updated;
    });
  }

  async remove(organizationId: string, taskId: string) {
    await this.getOrThrow(organizationId, taskId);
    await this.prisma.client.task.delete({ where: { id: taskId } });
  }
}
