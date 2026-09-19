import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFollowUpInput, FollowUpDto } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useFollowUps(organizationId: string, leadId: string) {
  return useQuery<FollowUpDto[]>({
    queryKey: ["organizations", organizationId, "follow-ups", { leadId }],
    queryFn: () => apiRequest(`/organizations/${organizationId}/follow-ups?leadId=${leadId}`),
    enabled: leadId !== ""
  });
}

export function useCreateFollowUp(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) =>
      apiRequest<FollowUpDto>(`/organizations/${organizationId}/follow-ups`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "follow-ups", { leadId }] })
  });
}

export function useCancelFollowUp(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (followUpId: string) => apiRequest<FollowUpDto>(`/organizations/${organizationId}/follow-ups/${followUpId}/cancel`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "follow-ups", { leadId }] })
  });
}
