"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { LeadIntent, UpsertLeadInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useAddLeadActivity, useAddLeadTag, useLead, useRemoveLeadTag, useUpdateLead, useMoveLeadStage } from "@/lib/leads-hooks";
import { usePipeline } from "@/lib/pipeline-hooks";
import { useCreateTag, useTags } from "@/lib/tags-hooks";
import { useBuyerPreference, useUpsertBuyerPreference } from "@/lib/buyer-preferences-hooks";
import { useCancelFollowUp, useCreateFollowUp, useFollowUps } from "@/lib/follow-ups-hooks";
import { useCreateTask, useTasks, useUpdateTaskStatus } from "@/lib/tasks-hooks";
import { formatCents } from "@/lib/format";
import { LeadForm } from "@/components/lead-form";
import { BuyerPreferenceForm } from "@/components/buyer-preference-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const LEAD_INTENT_LABELS: Record<LeadIntent, string> = {
  BUYER: "Buyer",
  RENTER: "Renter",
  SELLER: "Seller",
  LANDLORD: "Landlord"
};

export default function LeadDetailPage() {
  const params = useParams<{ organizationId: string; leadId: string }>();
  const { organizationId, leadId } = params;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageCRM");

  const { data: lead, isLoading } = useLead(organizationId, leadId);
  const { data: pipeline } = usePipeline(organizationId);
  const { data: tags } = useTags(organizationId);

  const updateLead = useUpdateLead(organizationId, leadId);
  const moveStage = useMoveLeadStage(organizationId, leadId);
  const addTag = useAddLeadTag(organizationId, leadId);
  const removeTag = useRemoveLeadTag(organizationId, leadId);
  const addActivity = useAddLeadActivity(organizationId, leadId);
  const createTag = useCreateTag(organizationId);
  const { data: followUps, isLoading: followUpsLoading } = useFollowUps(organizationId, leadId);
  const createFollowUp = useCreateFollowUp(organizationId, leadId);
  const cancelFollowUp = useCancelFollowUp(organizationId, leadId);
  const { data: tasks, isLoading: tasksLoading } = useTasks(organizationId, leadId);
  const createTask = useCreateTask(organizationId, leadId);
  const updateTaskStatus = useUpdateTaskStatus(organizationId, leadId);

  const [editOpen, setEditOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [note, setNote] = useState("");
  const [prefType, setPrefType] = useState<"SALE" | "RENT">("SALE");
  const [prefFormOpen, setPrefFormOpen] = useState(false);
  const { data: buyerPreference, isLoading: prefLoading } = useBuyerPreference(organizationId, lead?.contactId ?? "", prefType);
  const upsertPreference = useUpsertBuyerPreference(organizationId, lead?.contactId ?? "");
  const [followUpActionType, setFollowUpActionType] = useState<"SEND_MESSAGE" | "CREATE_TASK">("SEND_MESSAGE");
  const [followUpSendAt, setFollowUpSendAt] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueAt, setNewTaskDueAt] = useState("");

  if (isLoading || !lead) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  function handleUpdate(input: UpsertLeadInput) {
    updateLead.mutate(input, { onSuccess: () => setEditOpen(false) });
  }

  const attachedTagIds = new Set(lead.tags.map((t) => t.tag.id));
  const availableTags = (tags ?? []).filter((tag) => !attachedTagIds.has(tag.id));

  function handleCreateAndAttachTag() {
    if (!newTagName.trim()) return;
    createTag.mutate(
      { name: newTagName.trim() },
      {
        onSuccess: (created) => {
          addTag.mutate(created.id);
          setNewTagName("");
        }
      }
    );
  }

  function handleAddNote() {
    if (!note.trim()) return;
    addActivity.mutate(note.trim(), { onSuccess: () => setNote("") });
  }

  function handleCreateFollowUp() {
    if (!followUpSendAt.trim() || !followUpText.trim()) return;
    const sendAt = new Date(followUpSendAt).toISOString();
    const input =
      followUpActionType === "SEND_MESSAGE"
        ? ({ actionType: "SEND_MESSAGE" as const, leadId, sendAt, text: followUpText.trim() })
        : ({ actionType: "CREATE_TASK" as const, leadId, sendAt, title: followUpText.trim() });
    createFollowUp.mutate(input, { onSuccess: () => setFollowUpText("") });
  }

  function handleCreateTask() {
    if (!newTaskTitle.trim()) return;
    createTask.mutate(
      { leadId, title: newTaskTitle.trim(), dueAt: newTaskDueAt.trim() === "" ? null : new Date(newTaskDueAt).toISOString() },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          setNewTaskDueAt("");
        }
      }
    );
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/dashboard/${organizationId}/leads`} className="text-sm text-muted-foreground hover:underline">
        ← Leads
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{lead.title}</h1>
        {canManage && (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger render={<Button variant="outline" />}>Edit</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit lead</DialogTitle>
              </DialogHeader>
              <LeadForm organizationId={organizationId} onSubmit={handleUpdate} submitLabel="Save" isPending={updateLead.isPending} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{formatCents(lead.valueCents, lead.currency)}</p>
        {organization?.vertical === "real_estate" && lead.intent && <Badge variant="outline">{LEAD_INTENT_LABELS[lead.intent]}</Badge>}
      </div>

      {pipeline && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Stage:</span>
          <Select
            items={Object.fromEntries(pipeline.stages.map((s) => [s.id, s.name]))}
            value={lead.stageId}
            onValueChange={(v) => v && moveStage.mutate(v)}
            disabled={!canManage}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pipeline.stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Buyer preference</h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant={prefType === "SALE" ? "default" : "outline"} onClick={() => setPrefType("SALE")}>
              For sale
            </Button>
            <Button size="sm" variant={prefType === "RENT" ? "default" : "outline"} onClick={() => setPrefType("RENT")}>
              For rent
            </Button>
          </div>
        </div>
        {prefLoading ? (
          <Skeleton className="mt-2 h-16 w-full" />
        ) : buyerPreference ? (
          <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Budget</dt>
              <dd>
                {buyerPreference.minPriceCents != null ? formatCents(buyerPreference.minPriceCents, buyerPreference.currency) : "—"}
                {" – "}
                {buyerPreference.maxPriceCents != null ? formatCents(buyerPreference.maxPriceCents, buyerPreference.currency) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Property type</dt>
              <dd>{buyerPreference.propertyType ?? "Any"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bedrooms</dt>
              <dd>{buyerPreference.bedrooms ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Min. area</dt>
              <dd>{buyerPreference.minAreaSqm != null ? `${buyerPreference.minAreaSqm} m²` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Country</dt>
              <dd>{buyerPreference.country ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">City</dt>
              <dd>{buyerPreference.city ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Districts</dt>
              <dd>{buyerPreference.districts.length > 0 ? buyerPreference.districts.join(", ") : "—"}</dd>
            </div>
            {buyerPreference.notes && (
              <div className="col-span-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Notes</dt>
                <dd>{buyerPreference.notes}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Not captured yet.</p>
        )}
        {canManage && !prefLoading && (
          <Dialog open={prefFormOpen} onOpenChange={setPrefFormOpen}>
            <DialogTrigger render={<Button size="sm" variant="outline" className="mt-2" />}>
              {buyerPreference ? "Edit preference" : "Add preferences"}
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{prefType === "SALE" ? "Buying preference" : "Renting preference"}</DialogTitle>
              </DialogHeader>
              <BuyerPreferenceForm
                transactionType={prefType}
                preference={buyerPreference}
                isPending={upsertPreference.isPending}
                onSubmit={(input) => upsertPreference.mutate(input, { onSuccess: () => setPrefFormOpen(false) })}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Follow-ups</h2>
        <div className="mt-2 flex flex-col gap-2">
          {followUpsLoading && <Skeleton className="h-14 w-full" />}
          {!followUpsLoading && (followUps ?? []).length === 0 && <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>}
          {followUps?.map((followUp) => {
            const config = followUp.actionConfig as { text?: string; title?: string };
            return (
              <div key={followUp.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={followUp.status === "PENDING" ? "default" : "outline"}>{followUp.status}</Badge>
                    <span className="text-xs text-muted-foreground">{followUp.createdByUserId ? "Manual" : "AI"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(followUp.scheduledFor).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 truncate">{followUp.actionType === "SEND_MESSAGE" ? config.text : config.title}</p>
                </div>
                {canManage && followUp.status === "PENDING" && (
                  <Button size="sm" variant="ghost" disabled={cancelFollowUp.isPending} onClick={() => cancelFollowUp.mutate(followUp.id)}>
                    Cancel
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {canManage && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Select value={followUpActionType} onValueChange={(v) => v && setFollowUpActionType(v as "SEND_MESSAGE" | "CREATE_TASK")}>
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEND_MESSAGE">Send message</SelectItem>
                  <SelectItem value="CREATE_TASK">Create task</SelectItem>
                </SelectContent>
              </Select>
              <Input type="datetime-local" value={followUpSendAt} onChange={(e) => setFollowUpSendAt(e.target.value)} className="w-56" />
            </div>
            <Textarea
              placeholder={followUpActionType === "SEND_MESSAGE" ? "Message to send…" : "Task title…"}
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
            />
            <Button
              size="sm"
              className="self-start"
              disabled={!followUpSendAt.trim() || !followUpText.trim() || createFollowUp.isPending}
              onClick={handleCreateFollowUp}
            >
              Schedule follow-up
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <div className="mt-2 flex flex-col gap-2">
          {tasksLoading && <Skeleton className="h-10 w-full" />}
          {!tasksLoading && (tasks ?? []).length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          {tasks?.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
              <div className="min-w-0">
                <p className={task.status === "DONE" ? "truncate line-through text-muted-foreground" : "truncate"}>{task.title}</p>
                {task.dueAt && <p className="text-xs text-muted-foreground">Due {new Date(task.dueAt).toLocaleDateString()}</p>}
              </div>
              {canManage ? (
                <Select
                  value={task.status}
                  onValueChange={(v) => v && updateTaskStatus.mutate({ taskId: task.id, status: v as "OPEN" | "DONE" | "CANCELLED" })}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="DONE">Done</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline">{task.status}</Badge>
              )}
            </div>
          ))}
        </div>
        {canManage && (
          <div className="mt-3 flex items-center gap-2">
            <Input placeholder="New task title" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} />
            <Input type="date" value={newTaskDueAt} onChange={(e) => setNewTaskDueAt(e.target.value)} className="w-40" />
            <Button size="sm" variant="outline" disabled={!newTaskTitle.trim() || createTask.isPending} onClick={handleCreateTask}>
              Add task
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Tags</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {lead.tags.map(({ tag }) => (
            <Badge key={tag.id} className="gap-1">
              {tag.name}
              {canManage && (
                <button aria-label={`Remove ${tag.name}`} onClick={() => removeTag.mutate(tag.id)} className="ml-1">
                  ×
                </button>
              )}
            </Badge>
          ))}
          {lead.tags.length === 0 && <span className="text-sm text-muted-foreground">No tags yet.</span>}
        </div>
        {canManage && (
          <div className="mt-2 flex items-center gap-2">
            {availableTags.length > 0 && (
              <Select onValueChange={(v) => typeof v === "string" && addTag.mutate(v)}>
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Attach existing tag" />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input placeholder="New tag name" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} className="w-40" />
            <Button size="sm" variant="outline" disabled={!newTagName.trim() || createTag.isPending} onClick={handleCreateAndAttachTag}>
              Add tag
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div className="mt-2 flex flex-col gap-2">
          {lead.activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {lead.activities.map((activity) => (
            <div key={activity.id} className="rounded-lg border border-border p-2 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{activity.type}</div>
              <div>{activity.content}</div>
            </div>
          ))}
        </div>
        {canManage && (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" className="self-start" disabled={!note.trim() || addActivity.isPending} onClick={handleAddNote}>
              Add note
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
