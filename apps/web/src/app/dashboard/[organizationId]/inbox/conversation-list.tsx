"use client";

import { cn } from "@/lib/utils";
import { useConversations } from "@/lib/conversations-hooks";
import { AutomationStateBadge } from "@/components/automation-state-badge";
import { ChannelAvatar } from "@/components/channel-avatar";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ConversationList({
  organizationId,
  selectedConversationId,
  onSelect
}: {
  organizationId: string;
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
}) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversations(organizationId);
  const conversations = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>;
  }

  return (
    <div className="flex flex-col">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          className={cn(
            "flex items-start gap-3 border-b border-border px-3.5 py-3 text-left transition-colors hover:bg-secondary/60",
            selectedConversationId === conversation.id && "bg-secondary"
          )}
        >
          <ChannelAvatar name={conversation.contactDisplayName} provider={conversation.provider} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{conversation.contactDisplayName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                <RelativeTime date={conversation.lastMessageAt} />
              </span>
            </div>
            {conversation.lastMessageText && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{conversation.lastMessageText}</p>}
            <div className="mt-1.5 flex items-center gap-1.5">
              <AutomationStateBadge state={conversation.automationState} />
              {conversation.assignedUserId && <span className="text-xs text-muted-foreground">Assigned</span>}
            </div>
          </div>
        </button>
      ))}
      {hasNextPage && (
        <Button variant="ghost" className="m-2" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
          {isFetchingNextPage ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
