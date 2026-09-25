"use client";

import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./relative-time";
import type { Message } from "@yoyo/contracts";

const SENDER_LABEL: Record<Message["senderType"], string> = {
  CUSTOMER: "Customer",
  HUMAN: "You",
  AI: "AI",
  AUTOMATION: "Automation",
  SYSTEM: "System"
};

const BUBBLE_STYLES: Record<Message["senderType"], string> = {
  CUSTOMER: "bg-muted text-foreground",
  HUMAN: "bg-primary text-primary-foreground",
  AI: "bg-indigo-600 text-white",
  AUTOMATION: "bg-teal-600 text-white",
  SYSTEM: "bg-transparent text-muted-foreground text-xs italic"
};

export function MessageBubble({ message }: { message: Message }) {
  const { t: translateText, locale, intlLocale } = useI18n();
  if (message.senderType === "SYSTEM") {
    return <div className="my-1 text-center text-xs italic text-muted-foreground">{message.text}</div>;
  }

  const isOutbound = message.direction === "OUTBOUND";
  return (
    <div className={cn("flex flex-col gap-1", isOutbound ? "items-end" : "items-start")}>
      <div className={cn("max-w-[70%] rounded-lg px-3 py-2 text-sm", BUBBLE_STYLES[message.senderType])}>
        {message.text}
      </div>
      <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <span>{translateText(SENDER_LABEL[message.senderType])}</span>
        <span>·</span>
        <RelativeTime date={message.createdAt} />
        {isOutbound && <span className="lowercase">· {translateText(message.status)}</span>}
      </div>
    </div>
  );
}
