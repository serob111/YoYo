import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutomationDto, AutomationExecutionDto, CreateAutomationInput, UpdateAutomationInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useAutomations(organizationId: string) {
  return useQuery<AutomationDto[]>({
    queryKey: ["organizations", organizationId, "automations"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/automations`)
  });
}

export function useAutomationExecutions(organizationId: string, automationId: string, enabled: boolean) {
  return useQuery<AutomationExecutionDto[]>({
    queryKey: ["organizations", organizationId, "automations", automationId, "executions"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/automations/${automationId}/executions`),
    enabled
  });
}

export function useCreateAutomation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationInput) =>
      apiRequest<AutomationDto>(`/organizations/${organizationId}/automations`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "automations"] })
  });
}

export function useUpdateAutomation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ automationId, input }: { automationId: string; input: UpdateAutomationInput }) =>
      apiRequest<AutomationDto>(`/organizations/${organizationId}/automations/${automationId}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "automations"] })
  });
}

export function useDeleteAutomation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) => apiRequest(`/organizations/${organizationId}/automations/${automationId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "automations"] })
  });
}
