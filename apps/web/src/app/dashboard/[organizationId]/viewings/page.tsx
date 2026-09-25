"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { CreateViewingInput, UpdateViewingInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useCreateViewing, useUpdateViewing, useUpdateViewingStatus, useViewings, type ViewingListItem } from "@/lib/viewings-hooks";
import { ViewingForm } from "@/components/viewing-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const VIEWING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not the ISO string's UTC form.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function EditViewingForm({ viewing, onSubmit, isPending }: { viewing: ViewingListItem; onSubmit: (input: UpdateViewingInput) => void; isPending: boolean }) {
  const { t: translateText, locale, intlLocale } = useI18n();
  const [scheduledFor, setScheduledFor] = useState(toDatetimeLocal(viewing.scheduledFor));
  const [notes, setNotes] = useState(viewing.notes ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!scheduledFor) return;
    onSubmit({ scheduledFor: new Date(scheduledFor).toISOString(), notes: notes.trim() === "" ? null : notes });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Date & time")} <Input type="datetime-local" required value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Notes")} <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !scheduledFor}>
           {translateText("Save")} </Button>
      </DialogFooter>
    </form>
  );
}

export default function ViewingsPage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageCRM");

  const { data: viewings, isLoading } = useViewings(organizationId);
  const createViewing = useCreateViewing(organizationId);
  const updateStatus = useUpdateViewingStatus(organizationId);
  const updateViewing = useUpdateViewing(organizationId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingViewing, setEditingViewing] = useState<ViewingListItem | null>(null);

  function handleCreate(input: CreateViewingInput) {
    createViewing.mutate(input, { onSuccess: () => setCreateOpen(false) });
  }

  function handleEdit(input: UpdateViewingInput) {
    if (!editingViewing) return;
    updateViewing.mutate({ viewingId: editingViewing.id, input }, { onSuccess: () => setEditingViewing(null) });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translateText("Viewings")}</h1>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button />}>{translateText("Schedule viewing")}</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{translateText("Schedule a viewing")}</DialogTitle>
              </DialogHeader>
              <ViewingForm organizationId={organizationId} onSubmit={handleCreate} isPending={createViewing.isPending} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-6">
        {isLoading && <p className="text-sm text-muted-foreground">{translateText("Loading…")}</p>}
        {!isLoading && (!viewings || viewings.length === 0) && <p className="text-sm text-muted-foreground">{translateText("No viewings scheduled yet.")}</p>}

        {viewings && viewings.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translateText("Property")}</TableHead>
                <TableHead>{translateText("Lead")}</TableHead>
                <TableHead>{translateText("Scheduled for")}</TableHead>
                <TableHead>{translateText("Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viewings.map((viewing) => (
                <TableRow key={viewing.id}>
                  <TableCell>
                    <Link href={`/dashboard/${organizationId}/properties/${viewing.propertyId}`} className="hover:underline">
                      {viewing.propertyTitle}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/${organizationId}/leads/${viewing.leadId}`} className="hover:underline">
                      {viewing.leadTitle}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {new Date(viewing.scheduledFor).toLocaleString(intlLocale)}
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingViewing(viewing)}>
                           {translateText("Edit")} </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <Select
                        value={viewing.status}
                        onValueChange={(v) => v && updateStatus.mutate({ viewingId: viewing.id, status: v as (typeof VIEWING_STATUSES)[number] })}
                      >
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VIEWING_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {translateText(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      viewing.status
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!editingViewing} onOpenChange={(open) => !open && setEditingViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{translateText("Reschedule viewing")}</DialogTitle>
          </DialogHeader>
          {editingViewing && <EditViewingForm viewing={editingViewing} onSubmit={handleEdit} isPending={updateViewing.isPending} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
