"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChatCircle, InstagramLogo } from "@phosphor-icons/react";
import { useCurrentUser } from "@/lib/hooks";
import { useConversations } from "@/lib/conversations-hooks";
import { useConnectedAccounts, connectAccountHref } from "@/lib/integrations-hooks";
import { EmptyState } from "@/components/empty-state";
import { ConversationList } from "./conversation-list";
import { ConversationThread } from "./conversation-thread";

export default function InboxPage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const searchParams = useSearchParams();
  const organizationId = params.organizationId;
  const { data: user } = useCurrentUser();
  const { data } = useConversations(organizationId);
  const { data: connectedAccounts } = useConnectedAccounts(organizationId);
  const hasConnectedAccount = (connectedAccounts?.length ?? 0) > 0;
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(searchParams.get("conversation"));

  const conversations = data?.pages.flatMap((page) => page.items) ?? [];
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId);

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-border">
      <div className="w-80 shrink-0 overflow-y-auto border-r border-border">
        {conversations.length === 0 ? (
          hasConnectedAccount ? (
            <EmptyState
              icon={ChatCircle}
              title={translateText("No conversations yet")}
              description={translateText("New messages from Instagram or TikTok will show up here automatically.")}
            />
          ) : (
            <EmptyState
              icon={InstagramLogo}
              title={translateText("Connect a channel to start")}
              description={translateText("Link your Instagram or TikTok account so customer messages start flowing in.")}
              action={{ label: "Connect Instagram", href: connectAccountHref(organizationId, "instagram"), external: true }}
            />
          )
        ) : (
          <ConversationList organizationId={organizationId} selectedConversationId={selectedConversationId} onSelect={setSelectedConversationId} />
        )}
      </div>
      <div className="flex-1">
        {selectedConversation ? (
          <ConversationThread organizationId={organizationId} conversation={selectedConversation} currentUserId={user?.id} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {conversations.length === 0 ? translateText("Once you're connected, conversations will open here.") : translateText("Select a conversation to view messages.")}
          </div>
        )}
      </div>
    </div>
  );
}
