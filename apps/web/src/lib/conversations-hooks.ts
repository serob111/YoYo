import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssignConversationInput, Conversation, ConversationAutomationState, Message, SendMessageInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function useConversations(organizationId: string) {
  return useInfiniteQuery<Page<Conversation>>({
    queryKey: ["organizations", organizationId, "conversations"],
    queryFn: ({ pageParam }) =>
      apiRequest(`/organizations/${organizationId}/conversations${pageParam ? `?cursor=${pageParam}` : ""}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // No realtime push yet (Phase 8+) - poll the list for new/updated conversations.
    refetchInterval: 15_000
  });
}

export function useMessages(organizationId: string, conversationId: string | null) {
  return useInfiniteQuery<Page<Message>>({
    queryKey: ["organizations", organizationId, "conversations", conversationId, "messages"],
    queryFn: ({ pageParam }) =>
      apiRequest(
        `/organizations/${organizationId}/conversations/${conversationId}/messages${pageParam ? `?cursor=${pageParam}` : ""}`
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: conversationId !== null,
    refetchInterval: 8_000
  });
}

/** Pages arrive newest-first, each page itself newest-first - flatten+reverse for an oldest-first chat view. */
export function flattenMessagesOldestFirst(pages: Page<Message>[] | undefined): Message[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.items).reverse();
}

function invalidateConversation(queryClient: ReturnType<typeof useQueryClient>, organizationId: string, conversationId: string) {
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "conversations", conversationId, "messages"] });
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "conversations"] });
}

export function useSendMessage(organizationId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      apiRequest(`/organizations/${organizationId}/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: () => invalidateConversation(queryClient, organizationId, conversationId)
  });
}

export function useAssignConversation(organizationId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignConversationInput) =>
      apiRequest(`/organizations/${organizationId}/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }),
    onSuccess: () => invalidateConversation(queryClient, organizationId, conversationId)
  });
}

export function useSetAutomationState(organizationId: string, conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationState: ConversationAutomationState) =>
      apiRequest(`/organizations/${organizationId}/conversations/${conversationId}/automation-state`, {
        method: "PATCH",
        body: JSON.stringify({ automationState })
      }),
    onSuccess: () => invalidateConversation(queryClient, organizationId, conversationId)
  });
}
