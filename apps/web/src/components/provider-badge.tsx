import { Badge } from "@/components/ui/badge";

const LABELS: Record<"INSTAGRAM" | "TIKTOK", string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok"
};

export function ProviderBadge({ provider }: { provider: "INSTAGRAM" | "TIKTOK" }) {
  return <Badge variant="secondary">{LABELS[provider]}</Badge>;
}
