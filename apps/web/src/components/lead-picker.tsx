"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import { useLeads } from "@/lib/leads-hooks";
import { Input } from "@/components/ui/input";

export interface PickedLead {
  id: string;
  title: string;
}

export function LeadPicker({
  organizationId,
  selected,
  onSelect
}: {
  organizationId: string;
  selected: PickedLead | null;
  onSelect: (lead: PickedLead | null) => void;
}) {
  const { t: translateText } = useI18n();
  const [search, setSearch] = useState("");
  const { data } = useLeads(organizationId, { search });
  const leads = data?.pages.flatMap((page) => page.items) ?? [];

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
        <span>{selected.title}</span>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onSelect(null)}>
           {translateText("Change")} </button>
      </div>
    );
  }

  return (
    <>
      <Input placeholder={translateText("Search leads by title…")} value={search} onChange={(e) => setSearch(e.target.value)} />
      {search && (
        <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-1">
          {leads.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{translateText("No leads found.")}</p>}
          {leads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => onSelect({ id: lead.id, title: lead.title })}
            >
              {lead.title} <span className="text-muted-foreground">· {lead.contactDisplayName}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
