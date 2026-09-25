"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import { useProperties } from "@/lib/properties-hooks";
import { Input } from "@/components/ui/input";

export interface PickedProperty {
  id: string;
  title: string;
}

// Filters client-side over the first page of properties - there's no backend
// search param for properties yet (unlike contacts/leads). Fine for the
// property counts a single agency has today; revisit if that stops being true.
export function PropertyPicker({
  organizationId,
  selected,
  onSelect
}: {
  organizationId: string;
  selected: PickedProperty | null;
  onSelect: (property: PickedProperty | null) => void;
}) {
  const { t: translateText } = useI18n();
  const [search, setSearch] = useState("");
  const { data } = useProperties(organizationId);
  const properties = data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = search ? properties.filter((p) => p.title.toLowerCase().includes(search.toLowerCase())) : properties;

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
      <Input placeholder={translateText("Search properties by title…")} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-1">
        {filtered.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{translateText("No properties found.")}</p>}
        {filtered.map((property) => (
          <button
            key={property.id}
            type="button"
            className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => onSelect({ id: property.id, title: property.title })}
          >
            {property.title}
          </button>
        ))}
      </div>
    </>
  );
}
