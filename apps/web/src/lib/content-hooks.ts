import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContentItemDto, CreateContentItemInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

function invalidateContent(queryClient: ReturnType<typeof useQueryClient>, organizationId: string, contentItemId?: string) {
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "content"] });
  if (contentItemId) queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "content", contentItemId] });
}

export function useContentItems(organizationId: string, filters: { propertyId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  const qs = params.toString();

  return useQuery<ContentItemDto[]>({
    queryKey: ["organizations", organizationId, "content", { propertyId: filters.propertyId ?? "" }],
    queryFn: () => apiRequest(`/organizations/${organizationId}/content${qs ? `?${qs}` : ""}`),
    enabled: !filters.propertyId || filters.propertyId.length > 0
  });
}

// Caption generation happens async (outbox -> worker-content), so the
// wizard polls this item while a generation is in flight and stops once it
// lands on a terminal caption state.
export function useContentItem(organizationId: string, contentItemId: string | null) {
  return useQuery<ContentItemDto>({
    queryKey: ["organizations", organizationId, "content", contentItemId],
    queryFn: () => apiRequest(`/organizations/${organizationId}/content/${contentItemId}`),
    enabled: contentItemId != null,
    refetchInterval: (query) => (query.state.data?.status === "GENERATING" ? 1500 : false)
  });
}

export function useCreateContentItem(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContentItemInput) =>
      apiRequest<ContentItemDto>(`/organizations/${organizationId}/content`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => invalidateContent(queryClient, organizationId)
  });
}

export function useAddContentMediaFromPropertyMedia(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentItemId, propertyMediaId, order }: { contentItemId: string; propertyMediaId: string; order: number }) =>
      apiRequest(`/organizations/${organizationId}/content/${contentItemId}/media/from-property-media`, {
        method: "POST",
        body: JSON.stringify({ propertyMediaId, order })
      }),
    onSuccess: (_data, variables) => invalidateContent(queryClient, organizationId, variables.contentItemId)
  });
}

export function useGenerateCaption(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentItemId, instruction }: { contentItemId: string; instruction?: string }) =>
      apiRequest<ContentItemDto>(`/organizations/${organizationId}/content/${contentItemId}/generate-caption`, {
        method: "POST",
        body: JSON.stringify({ instruction })
      }),
    onSuccess: (_data, variables) => invalidateContent(queryClient, organizationId, variables.contentItemId)
  });
}

export function useUpdateContentItem(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentItemId, caption }: { contentItemId: string; caption: string }) =>
      apiRequest<ContentItemDto>(`/organizations/${organizationId}/content/${contentItemId}`, { method: "PATCH", body: JSON.stringify({ caption }) }),
    onSuccess: (_data, variables) => invalidateContent(queryClient, organizationId, variables.contentItemId)
  });
}

export function useSubmitContentItem(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contentItemId: string) =>
      apiRequest<ContentItemDto>(`/organizations/${organizationId}/content/${contentItemId}/submit`, { method: "POST" }),
    onSuccess: (_data, contentItemId) => invalidateContent(queryClient, organizationId, contentItemId)
  });
}

export function useApproveContentItem(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ contentItemId, scheduledFor }: { contentItemId: string; scheduledFor?: string }) =>
      apiRequest<ContentItemDto>(`/organizations/${organizationId}/content/${contentItemId}/approve`, {
        method: "POST",
        body: JSON.stringify(scheduledFor ? { scheduledFor } : {})
      }),
    onSuccess: (_data, variables) => invalidateContent(queryClient, organizationId, variables.contentItemId)
  });
}
