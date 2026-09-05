import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  updateTaskSchema,
  updateTaskStatusSchema,
  upsertTaskSchema,
  type UpdateTaskInput,
  type UpdateTaskStatusInput,
  type UpsertTaskInput
} from "@yoyo/contracts";
import { SessionGuard } from "../auth/session.guard";
import { TenantContextGuard } from "../common/tenant-context.guard";
import { CapabilityGuard } from "../common/capability.guard";
import { RequireCapability } from "../common/require-capability.decorator";
import { CsrfGuard } from "../common/csrf.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TasksService } from "./tasks.service";

@Controller("organizations/:organizationId/tasks")
@UseGuards(SessionGuard, TenantContextGuard, CapabilityGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async list(
    @Param("organizationId") organizationId: string,
    @Query("leadId") leadId?: string,
    @Query("assignedUserId") assignedUserId?: string
  ) {
    return this.tasks.list(organizationId, { leadId, assignedUserId });
  }

  @Post()
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async create(@Param("organizationId") organizationId: string, @Body(new ZodValidationPipe(upsertTaskSchema)) body: UpsertTaskInput) {
    return this.tasks.create(organizationId, body);
  }

  @Patch(":taskId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async update(
    @Param("organizationId") organizationId: string,
    @Param("taskId") taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTaskInput
  ) {
    return this.tasks.update(organizationId, taskId, body);
  }

  @Patch(":taskId/status")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async updateStatus(
    @Param("organizationId") organizationId: string,
    @Param("taskId") taskId: string,
    @Body(new ZodValidationPipe(updateTaskStatusSchema)) body: UpdateTaskStatusInput
  ) {
    return this.tasks.updateStatus(organizationId, taskId, body.status);
  }

  @Delete(":taskId")
  @RequireCapability("manageCRM")
  @UseGuards(CsrfGuard)
  async remove(@Param("organizationId") organizationId: string, @Param("taskId") taskId: string) {
    await this.tasks.remove(organizationId, taskId);
    return { success: true };
  }
}
