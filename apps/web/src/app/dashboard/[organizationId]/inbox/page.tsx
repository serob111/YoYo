"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks";
import { useConversations } from "@/lib/conversations-hooks";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";

export default function InboxPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: user } = useCurrentUser();
  const { data } = useConversations(organizationId);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const selectedConversation = data?.pages
    .flatMap((page) => page.items)
    .find((conversation) => conversation.id === selectedConversationId);

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-lg border border-border">
      <div className="w-80 shrink-0 overflow-y-auto border-r border-border">
        <ConversationList organizationId={organizationId} selectedConversationId={selectedConversationId} onSelect={setSelectedConversationId} />
      </div>
      <div className="flex-1">
        {selectedConversation ? (
          <ConversationThread organizationId={organizationId} conversation={selectedConversation} currentUserId={user?.id} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a conversation to view messages.
          </div>
        )}
      </div>
    </div>
  );
}
