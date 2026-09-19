import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActivityDto, LeadDto, LeadIntent, TagDto, UpdateLeadInput, UpsertLeadInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type LeadListItem = LeadDto & { contactDisplayName: string };
export type LeadDetail = LeadDto & { activities: ActivityDto[]; tags: { tag: TagDto }[] };

export function useLeads(organizationId: string, filters: { stageId?: string; contactId?: string; search?: string; intent?: LeadIntent } = {}) {
  const stageId = filters.stageId ?? "";
  const contactId = filters.contactId ?? "";
  const search = filters.search ?? "";
  const intent = filters.intent ?? "";
  return useInfiniteQuery<Page<LeadListItem>>({
    queryKey: ["organizations", organizationId, "leads", { stageId, contactId, search, intent }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam as string);
      if (stageId) params.set("stageId", stageId);
      if (contactId) params.set("contactId", contactId);
      if (search) params.set("search", search);
      if (intent) params.set("intent", intent);
      const qs = params.toString();
      return apiRequest(`/organizations/${organizationId}/leads${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
}

export function useLead(organizationId: string, leadId: string) {
  return useQuery<LeadDetail>({
    queryKey: ["organizations", organizationId, "leads", leadId],
    queryFn: () => apiRequest(`/organizations/${organizationId}/leads/${leadId}`)
  });
}

function invalidateLead(queryClient: ReturnType<typeof useQueryClient>, organizationId: string, leadId?: string) {
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "leads"] });
  if (leadId) queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "leads", leadId] });
}

export function useCreateLead(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLeadInput) => apiRequest<LeadDto>(`/organizations/${organizationId}/leads`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => invalidateLead(queryClient, organizationId)
  });
}

export function useUpdateLead(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLeadInput) =>
      apiRequest<LeadDto>(`/organizations/${organizationId}/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => invalidateLead(queryClient, organizationId, leadId)
  });
}

export function useMoveLeadStage(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) =>
      apiRequest<LeadDto>(`/organizations/${organizationId}/leads/${leadId}/stage`, { method: "PATCH", body: JSON.stringify({ stageId }) }),
    onSuccess: () => invalidateLead(queryClient, organizationId, leadId)
  });
}

// Kanban variant - the lead being moved is only known at drop time (any card
// on the board), unlike useMoveLeadStage above which is bound to one lead's
// detail page.
export function useMoveAnyLeadStage(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      apiRequest<LeadDto>(`/organizations/${organizationId}/leads/${leadId}/stage`, { method: "PATCH", body: JSON.stringify({ stageId }) }),
    onSuccess: (_result, { leadId }) => invalidateLead(queryClient, organizationId, leadId)
  });
}

export function useAddLeadTag(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      apiRequest(`/organizations/${organizationId}/leads/${leadId}/tags`, { method: "POST", body: JSON.stringify({ tagId }) }),
    onSuccess: () => invalidateLead(queryClient, organizationId, leadId)
  });
}

export function useRemoveLeadTag(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => apiRequest(`/organizations/${organizationId}/leads/${leadId}/tags/${tagId}`, { method: "DELETE" }),
    onSuccess: () => invalidateLead(queryClient, organizationId, leadId)
  });
}

export function useAddLeadActivity(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiRequest(`/organizations/${organizationId}/leads/${leadId}/activities`, { method: "POST", body: JSON.stringify({ content }) }),
    onSuccess: () => invalidateLead(queryClient, organizationId, leadId)
  });
}
