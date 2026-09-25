"use client";

import { useI18n } from "@/lib/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConnectedAccountStatus } from "@yoyo/contracts";

const STYLES: Record<ConnectedAccountStatus, string> = {
  CONNECTED: "bg-green-100 text-green-800 hover:bg-green-100",
  ACTION_REQUIRED: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  TOKEN_EXPIRED: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  ERROR: "bg-red-100 text-red-800 hover:bg-red-100",
  DISCONNECTED: "bg-slate-100 text-slate-600 hover:bg-slate-100"
};

const LABELS: Record<ConnectedAccountStatus, string> = {
  CONNECTED: "Connected",
  ACTION_REQUIRED: "Action required",
  TOKEN_EXPIRED: "Token expired",
  ERROR: "Error",
  DISCONNECTED: "Disconnected"
};

export function StatusBadge({ status }: { status: ConnectedAccountStatus }) {
  const { t: translateText } = useI18n();
  return <Badge className={cn(STYLES[status])}>{translateText(LABELS[status])}</Badge>;
}
