"use client";

import { Fragment, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { AutomationDto, CreateAutomationInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useAutomationExecutions, useAutomations, useCreateAutomation, useDeleteAutomation, useUpdateAutomation } from "@/lib/automations-hooks";
import { usePipeline } from "@/lib/pipeline-hooks";
import { useTags } from "@/lib/tags-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const TRIGGER_TYPES = ["LEAD_CREATED", "LEAD_STAGE_CHANGED", "LISTING_MATCHED"] as const;
const TRIGGER_LABELS: Record<(typeof TRIGGER_TYPES)[number], string> = {
  LEAD_CREATED: "Lead created",
  LEAD_STAGE_CHANGED: "Lead stage changed",
  LISTING_MATCHED: "New listing matches a saved preference"
};

const ACTION_TYPES = ["CREATE_FOLLOW_UP", "CREATE_TASK", "ADD_TAG"] as const;
const ACTION_LABELS: Record<(typeof ACTION_TYPES)[number], string> = {
  CREATE_FOLLOW_UP: "Schedule a follow-up",
  CREATE_TASK: "Create a task",
  ADD_TAG: "Add a tag"
};

function describeTrigger(automation: AutomationDto, stageName: (id: string) => string): string {
  if (automation.triggerType === "LEAD_CREATED") return "Lead created";
  if (automation.triggerType === "LISTING_MATCHED") return "New listing matches a saved preference";
  const toStageId = (automation.triggerConfig as { toStageId?: string } | null)?.toStageId;
  return toStageId ? `Lead moved to ${stageName(toStageId)}` : "Lead moved to any stage";
}

function describeAction(automation: AutomationDto, tagName: (id: string) => string): string {
  const config = automation.actionConfig as Record<string, unknown>;
  if (automation.actionType === "CREATE_FOLLOW_UP") {
    return `Follow up ${config.delayMinutes}min later (${config.followUpActionType === "SEND_MESSAGE" ? "message" : "task"})`;
  }
  if (automation.actionType === "CREATE_TASK") {
    return `Create task "${config.title}"`;
  }
  return `Add tag "${tagName(config.tagId as string)}"`;
}

function AutomationForm({
  organizationId,
  onSubmit,
  isPending
}: {
  organizationId: string;
  onSubmit: (input: CreateAutomationInput) => void;
  isPending: boolean;
}) {
  const { data: pipeline } = usePipeline(organizationId);
  const { data: tags } = useTags(organizationId);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<(typeof TRIGGER_TYPES)[number]>("LEAD_CREATED");
  const [toStageId, setToStageId] = useState("");
  const [actionType, setActionType] = useState<(typeof ACTION_TYPES)[number]>("CREATE_FOLLOW_UP");
  const [delayMinutes, setDelayMinutes] = useState("60");
  const [followUpActionType, setFollowUpActionType] = useState<"SEND_MESSAGE" | "CREATE_TASK">("SEND_MESSAGE");
  const [followUpText, setFollowUpText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [dueInMinutes, setDueInMinutes] = useState("");
  const [tagId, setTagId] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const trigger: CreateAutomationInput["trigger"] =
      triggerType === "LEAD_CREATED"
        ? { triggerType: "LEAD_CREATED" }
        : triggerType === "LISTING_MATCHED"
          ? { triggerType: "LISTING_MATCHED" }
          : { triggerType: "LEAD_STAGE_CHANGED", toStageId: toStageId || undefined };

    let action: CreateAutomationInput["action"];
    if (actionType === "CREATE_FOLLOW_UP") {
      if (!followUpText.trim()) return;
      action = {
        actionType: "CREATE_FOLLOW_UP",
        delayMinutes: parseInt(delayMinutes, 10),
        followUpActionType,
        text: followUpActionType === "SEND_MESSAGE" ? followUpText.trim() : undefined,
        title: followUpActionType === "CREATE_TASK" ? followUpText.trim() : undefined
      };
    } else if (actionType === "CREATE_TASK") {
      if (!taskTitle.trim()) return;
      action = { actionType: "CREATE_TASK", title: taskTitle.trim(), dueInMinutes: dueInMinutes.trim() ? parseInt(dueInMinutes, 10) : undefined };
    } else {
      if (!tagId) return;
      action = { actionType: "ADD_TAG", tagId };
    }

    onSubmit({ name: name.trim(), trigger, action, enabled: true });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
          Name
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Follow up new leads" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Trigger
            <Select value={triggerType} onValueChange={(v) => v && setTriggerType(v as (typeof TRIGGER_TYPES)[number])}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TRIGGER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {triggerType === "LEAD_STAGE_CHANGED" && pipeline && (
            <label className="grid gap-1 text-sm font-medium">
              To stage
              <Select
                items={{ any: "Any stage", ...Object.fromEntries(pipeline.stages.map((s) => [s.id, s.name])) }}
                value={toStageId || "any"}
                onValueChange={(v) => setToStageId(!v || v === "any" ? "" : v)}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any stage</SelectItem>
                  {pipeline.stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        </div>

        <label className="grid gap-1 text-sm font-medium">
          Action
          <Select value={actionType} onValueChange={(v) => v && setActionType(v as (typeof ACTION_TYPES)[number])}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {actionType === "CREATE_FOLLOW_UP" && (
          <div className="grid gap-3 rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-medium">
                Delay (minutes)
                <Input type="number" min="1" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Then
                <Select value={followUpActionType} onValueChange={(v) => v && setFollowUpActionType(v as "SEND_MESSAGE" | "CREATE_TASK")}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEND_MESSAGE">Send message</SelectItem>
                    <SelectItem value="CREATE_TASK">Create task</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              {followUpActionType === "SEND_MESSAGE" ? "Message" : "Task title"}
              <Input required value={followUpText} onChange={(e) => setFollowUpText(e.target.value)} />
            </label>
          </div>
        )}

        {actionType === "CREATE_TASK" && (
          <div className="grid gap-3 rounded-lg border border-border p-3">
            <label className="grid gap-1 text-sm font-medium">
              Task title
              <Input required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Due in (minutes, optional)
              <Input type="number" min="1" value={dueInMinutes} onChange={(e) => setDueInMinutes(e.target.value)} />
            </label>
          </div>
        )}

        {actionType === "ADD_TAG" && (
          <div className="rounded-lg border border-border p-3">
            <label className="grid gap-1 text-sm font-medium">
              Tag
              <Select value={tagId} onValueChange={(v) => v && setTagId(v)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="Choose a tag" />
                </SelectTrigger>
                <SelectContent>
                  {(tags ?? []).map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {(tags ?? []).length === 0 && <p className="mt-1 text-xs text-muted-foreground">No tags exist yet - create one from a lead first.</p>}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          Create
        </Button>
      </DialogFooter>
    </form>
  );
}

function ExecutionsList({ organizationId, automationId }: { organizationId: string; automationId: string }) {
  const { data: executions, isLoading } = useAutomationExecutions(organizationId, automationId, true);
  if (isLoading) return <Skeleton className="h-8 w-full" />;
  if (!executions || executions.length === 0) return <p className="text-xs text-muted-foreground">No runs yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      {executions.slice(0, 5).map((execution) => (
        <div key={execution.id} className="flex items-center gap-2 text-xs">
          <Badge variant={execution.status === "COMPLETED" ? "default" : execution.status === "FAILED" ? "destructive" : "outline"}>
            {execution.status}
          </Badge>
          <span className="text-muted-foreground">{new Date(execution.createdAt).toLocaleString()}</span>
          {execution.errorMessage && <span className="truncate text-destructive">{execution.errorMessage}</span>}
        </div>
      ))}
    </div>
  );
}

export default function AutomationsSettingsPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageAutomations");

  const { data: automations, isLoading } = useAutomations(organizationId);
  const { data: pipeline } = usePipeline(organizationId);
  const { data: tags } = useTags(organizationId);
  const createAutomation = useCreateAutomation(organizationId);
  const updateAutomation = useUpdateAutomation(organizationId);
  const deleteAutomation = useDeleteAutomation(organizationId);

  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stageName = (id: string) => pipeline?.stages.find((s) => s.id === id)?.name ?? id;
  const tagName = (id: string) => tags?.find((t) => t.id === id)?.name ?? id;

  function handleCreate(input: CreateAutomationInput) {
    createAutomation.mutate(input, { onSuccess: () => setCreateOpen(false) });
  }

  if (!canManage) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold">Automations</h1>
        <p className="mt-2 text-sm text-muted-foreground">You do not have access to manage automations for this organization.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Automations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Rules that react to lead events - the AI&apos;s own scheduled follow-ups run independently of these.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>New automation</DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New automation</DialogTitle>
            </DialogHeader>
            <AutomationForm organizationId={organizationId} onSubmit={handleCreate} isPending={createAutomation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!isLoading && (automations ?? []).length === 0 && <p className="text-sm text-muted-foreground">No automations yet.</p>}

        {automations && automations.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation) => (
                <Fragment key={automation.id}>
                  <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === automation.id ? null : automation.id)}>
                    <TableCell className="font-medium">{automation.name}</TableCell>
                    <TableCell>{describeTrigger(automation, stageName)}</TableCell>
                    <TableCell>{describeAction(automation, tagName)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant={automation.enabled ? "default" : "outline"}
                        disabled={updateAutomation.isPending}
                        onClick={() => updateAutomation.mutate({ automationId: automation.id, input: { enabled: !automation.enabled } })}
                      >
                        {automation.enabled ? "On" : "Off"}
                      </Button>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" disabled={deleteAutomation.isPending} onClick={() => deleteAutomation.mutate(automation.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedId === automation.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-secondary/40">
                        <ExecutionsList organizationId={organizationId} automationId={automation.id} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
