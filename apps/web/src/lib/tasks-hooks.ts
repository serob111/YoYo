import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskDto, UpsertTaskInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useTasks(organizationId: string, leadId: string) {
  return useQuery<TaskDto[]>({
    queryKey: ["organizations", organizationId, "tasks", { leadId }],
    queryFn: () => apiRequest(`/organizations/${organizationId}/tasks?leadId=${leadId}`),
    enabled: leadId !== ""
  });
}

export function useCreateTask(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertTaskInput) => apiRequest<TaskDto>(`/organizations/${organizationId}/tasks`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "tasks", { leadId }] })
  });
}

export function useUpdateTaskStatus(organizationId: string, leadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskDto["status"] }) =>
      apiRequest<TaskDto>(`/organizations/${organizationId}/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "tasks", { leadId }] });
      // Completing a task auto-appends a TASK_COMPLETED Activity server-side -
      // refresh the lead so the Activity section picks it up too.
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "leads", leadId] });
    }
  });
}
