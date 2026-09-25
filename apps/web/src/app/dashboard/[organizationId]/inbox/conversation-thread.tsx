"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { Conversation, ConversationAutomationState } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useConnectedAccounts } from "@/lib/integrations-hooks";
import { useAssignConversation, useMessages, useSendMessage, useSetAutomationState, flattenMessagesOldestFirst } from "@/lib/conversations-hooks";
import { MessageBubble } from "@/components/message-bubble";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api-client";

const AUTOMATION_STATES: ConversationAutomationState[] = ["AI_ACTIVE", "HUMAN_ACTIVE", "PAUSED", "CLOSED"];

export function ConversationThread({
  organizationId,
  conversation,
  currentUserId
}: {
  organizationId: string;
  conversation: Conversation;
  currentUserId: string | undefined;
}) {
  const { t: translateText, locale, intlLocale } = useI18n();
  const { data: organization } = useOrganization(organizationId);
  const canReply = useCan(organization?.myRole, "replyConversation");
  const canTakeOver = useCan(organization?.myRole, "takeOverConversation");
  const canManageAI = useCan(organization?.myRole, "manageAI");

  const { data: accounts } = useConnectedAccounts(organizationId);
  const account = accounts?.find((a) => a.id === conversation.connectedAccountId);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(organizationId, conversation.id);
  const messages = flattenMessagesOldestFirst(data?.pages);

  const sendMessage = useSendMessage(organizationId, conversation.id);
  const assign = useAssignConversation(organizationId, conversation.id);
  const setAutomationState = useSetAutomationState(organizationId, conversation.id);

  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try {
      await sendMessage.mutateAsync({ text });
      setText("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Could not send message.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="font-medium">{conversation.contactDisplayName}</h2>
          {account && account.status !== "CONNECTED" && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
              <StatusBadge status={account.status} />  {translateText("Reconnect this account to send messages.")} </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canManageAI && (
            <Select value={conversation.automationState} onValueChange={(value) => setAutomationState.mutate(value as ConversationAutomationState)}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTOMATION_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {translateText(state)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canTakeOver && (
            <Button
              variant="outline"
              size="sm"
              disabled={!currentUserId || conversation.assignedUserId === currentUserId || assign.isPending}
              onClick={() => currentUserId && assign.mutate({ assignedUserId: currentUserId })}
            >
              {conversation.assignedUserId === currentUserId ? translateText("Claimed by you") : translateText("Claim")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {hasNextPage && (
          <Button variant="ghost" className="mb-3 w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? translateText("Loading...") : translateText("Load older messages")}
          </Button>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </div>

      {canReply && (
        <form onSubmit={onSend} className="flex gap-2 border-t border-border p-3">
          <Textarea
            className="min-h-10"
            placeholder={translateText("Type a reply...")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend(e);
              }
            }}
          />
          <Button type="submit" disabled={sendMessage.isPending || !text.trim()}>
             {translateText("Send")} </Button>
        </form>
      )}
      {error && <p className="px-3 pb-2 text-sm text-red-600">{translateText(error)}</p>}
    </div>
  );
}
