"use client";

import { useI18n } from "@/lib/i18n/provider";

import type { ContentItemDto } from "@yoyo/contracts";
import type { PropertyDetail } from "@/lib/properties-hooks";
import type { ViewingListItem } from "@/lib/viewings-hooks";

interface ActivityEntry {
  date: Date;
  label: string;
  detail?: string;
}

// Client-synthesized from data the page already fetched - no new backend
// audit plumbing. The existing AuditService is an org-wide admin trail with
// no per-entity filter and nothing calls it for Property mutations today,
// so a real per-property audit log is a bigger, separate change.
function buildTimeline(property: PropertyDetail, viewings: ViewingListItem[], contentItems: ContentItemDto[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [{ date: new Date(property.createdAt), label: "Property created" }];

  if (property.updatedAt !== property.createdAt) {
    entries.push({ date: new Date(property.updatedAt), label: "Property updated" });
  }

  for (const viewing of viewings) {
    entries.push({ date: new Date(viewing.createdAt), label: "Viewing scheduled", detail: viewing.leadTitle });
  }

  for (const item of contentItems) {
    entries.push({ date: new Date(item.createdAt), label: `Post created for ${item.provider === "INSTAGRAM" ? "Instagram" : "TikTok"}` });
    if (item.publishedAt) {
      entries.push({ date: new Date(item.publishedAt), label: `Published to ${item.provider === "INSTAGRAM" ? "Instagram" : "TikTok"}` });
    }
  }

  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function PropertyActivityTab({
  property,
  viewings,
  contentItems
}: {
  property: PropertyDetail;
  viewings: ViewingListItem[];
  contentItems: ContentItemDto[];
}) {
  const { t: translateText, intlLocale } = useI18n();
  const entries = buildTimeline(property, viewings, contentItems);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{translateText("No activity yet.")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
          <div>
            <span>{translateText(entry.label)}</span>
            {entry.detail && <span className="text-muted-foreground"> · {entry.detail}</span>}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{entry.date.toLocaleString(intlLocale)}</span>
        </div>
      ))}
    </div>
  );
}
