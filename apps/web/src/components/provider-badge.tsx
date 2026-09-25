"use client";

import { useI18n } from "@/lib/i18n/provider";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<"INSTAGRAM" | "TIKTOK", string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok"
};

export function ProviderBadge({ provider }: { provider: "INSTAGRAM" | "TIKTOK" }) {
  const { t: translateText } = useI18n();
  return <Badge variant="secondary">{translateText(LABELS[provider])}</Badge>;
}
