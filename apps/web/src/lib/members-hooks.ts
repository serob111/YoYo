import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteMemberInput, Member } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useMembers(organizationId: string) {
  return useQuery<{ items: Member[]; nextCursor: string | null }>({
    queryKey: ["organizations", organizationId, "members"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/members`)
  });
}

export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteMemberInput) =>
      apiRequest(`/organizations/${organizationId}/members/invite`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] })
  });
}

export function useChangeMemberRole(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      apiRequest(`/organizations/${organizationId}/members/${memberId}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] })
  });
}

export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => apiRequest(`/organizations/${organizationId}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] })
  });
}
