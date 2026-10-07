"use client";

import { useI18n } from "@/lib/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROPERTY_STATUS_LABELS } from "@/lib/property-labels";
import type { PropertyStatus } from "@yoyo/contracts";

const STYLES: Record<PropertyStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  ACTIVE: "bg-green-100 text-green-800 hover:bg-green-100",
  UNDER_OFFER: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  SOLD: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  RENTED: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  ARCHIVED: "bg-slate-100 text-slate-500 hover:bg-slate-100"
};

export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  const { t: translateText } = useI18n();
  return <Badge className={cn(STYLES[status])}>{translateText(PROPERTY_STATUS_LABELS[status])}</Badge>;
}
