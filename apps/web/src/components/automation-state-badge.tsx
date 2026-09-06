import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationAutomationState } from "@yoyo/contracts";

const STYLES: Record<ConversationAutomationState, string> = {
  AI_ACTIVE: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  HUMAN_ACTIVE: "bg-green-100 text-green-800 hover:bg-green-100",
  PAUSED: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  CLOSED: "bg-slate-100 text-slate-600 hover:bg-slate-100"
};

const LABELS: Record<ConversationAutomationState, string> = {
  AI_ACTIVE: "AI active",
  HUMAN_ACTIVE: "Human",
  PAUSED: "Paused",
  CLOSED: "Closed"
};

export function AutomationStateBadge({ state }: { state: ConversationAutomationState }) {
  return <Badge className={cn(STYLES[state])}>{LABELS[state]}</Badge>;
}
