import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTagInput, TagDto } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useTags(organizationId: string) {
  return useQuery<TagDto[]>({
    queryKey: ["organizations", organizationId, "tags"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/tags`)
  });
}

export function useCreateTag(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => apiRequest<TagDto>(`/organizations/${organizationId}/tags`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "tags"] })
  });
}
