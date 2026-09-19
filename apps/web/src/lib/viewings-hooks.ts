import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateViewingInput, UpdateViewingInput, ViewingDto, ViewingStatus } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export type ViewingListItem = ViewingDto & { propertyTitle: string; leadTitle: string };

export function useViewings(organizationId: string, filters: { leadId?: string; propertyId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.leadId) params.set("leadId", filters.leadId);
  if (filters.propertyId) params.set("propertyId", filters.propertyId);
  const qs = params.toString();

  return useQuery<ViewingListItem[]>({
    queryKey: ["organizations", organizationId, "viewings", { leadId: filters.leadId ?? "", propertyId: filters.propertyId ?? "" }],
    queryFn: () => apiRequest(`/organizations/${organizationId}/viewings${qs ? `?${qs}` : ""}`)
  });
}

function invalidateViewings(queryClient: ReturnType<typeof useQueryClient>, organizationId: string) {
  queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "viewings"] });
}

export function useCreateViewing(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateViewingInput) =>
      apiRequest<ViewingDto>(`/organizations/${organizationId}/viewings`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => invalidateViewings(queryClient, organizationId)
  });
}

export function useUpdateViewing(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewingId, input }: { viewingId: string; input: UpdateViewingInput }) =>
      apiRequest<ViewingDto>(`/organizations/${organizationId}/viewings/${viewingId}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => invalidateViewings(queryClient, organizationId)
  });
}

export function useUpdateViewingStatus(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewingId, status }: { viewingId: string; status: ViewingStatus }) =>
      apiRequest<ViewingDto>(`/organizations/${organizationId}/viewings/${viewingId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => invalidateViewings(queryClient, organizationId)
  });
}
