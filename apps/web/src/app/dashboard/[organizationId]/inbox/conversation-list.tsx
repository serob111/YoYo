"use client";

import { cn } from "@/lib/utils";
import { useConversations } from "@/lib/conversations-hooks";
import { ProviderBadge } from "@/components/provider-badge";
import { AutomationStateBadge } from "@/components/automation-state-badge";
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
            "flex flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted",
            selectedConversationId === conversation.id && "bg-muted"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="truncate text-sm font-medium">{conversation.contactDisplayName}</span>
            <RelativeTime date={conversation.lastMessageAt} />
          </div>
          <div className="flex items-center gap-1.5">
            <ProviderBadge provider={conversation.provider} />
            <AutomationStateBadge state={conversation.automationState} />
            {conversation.assignedUserId && <span className="text-xs text-muted-foreground">Assigned</span>}
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
