"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { CreateViewingInput } from "@yoyo/contracts";
import { LeadPicker, type PickedLead } from "@/components/lead-picker";
import { PropertyPicker, type PickedProperty } from "@/components/property-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

export function ViewingForm({
  organizationId,
  fixedProperty,
  onSubmit,
  isPending
}: {
  organizationId: string;
  fixedProperty?: PickedProperty;
  onSubmit: (input: CreateViewingInput) => void;
  isPending: boolean;
}) {
  const { t: translateText } = useI18n();
  const [property, setProperty] = useState<PickedProperty | null>(fixedProperty ?? null);
  const [lead, setLead] = useState<PickedLead | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!property || !lead || !scheduledFor) return;
    onSubmit({
      propertyId: property.id,
      leadId: lead.id,
      scheduledFor: new Date(scheduledFor).toISOString(),
      notes: notes.trim() === "" ? null : notes
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        {!fixedProperty && (
          <div className="grid gap-1 text-sm font-medium">
             {translateText("Property")} <PropertyPicker organizationId={organizationId} selected={property} onSelect={setProperty} />
          </div>
        )}
        <div className="grid gap-1 text-sm font-medium">
           {translateText("Lead")} <LeadPicker organizationId={organizationId} selected={lead} onSelect={setLead} />
        </div>
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Date & time")} <Input type="datetime-local" required value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Notes")} <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !property || !lead || !scheduledFor}>
           {translateText("Schedule")} </Button>
      </DialogFooter>
    </form>
  );
}
