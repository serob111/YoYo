import { z } from "zod";

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime()
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
