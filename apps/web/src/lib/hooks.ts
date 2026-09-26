import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CurrentUser, DashboardStats, Organization, UpdateOrganizationVerticalInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: () => apiRequest<CurrentUser>("/me"),
    retry: false
  });
}

export function useMyOrganizations(enabled = true) {
  return useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: () => apiRequest<Organization[]>("/organizations"),
    enabled
  });
}

export function useOrganization(organizationId: string) {
  return useQuery<Organization>({
    queryKey: ["organizations", organizationId],
    queryFn: () => apiRequest<Organization>(`/organizations/${organizationId}`)
  });
}

export function useDashboardStats(organizationId: string) {
  return useQuery<DashboardStats>({
    queryKey: ["organizations", organizationId, "dashboard-stats"],
    queryFn: () => apiRequest<DashboardStats>(`/organizations/${organizationId}/dashboard-stats`)
  });
}

export function useUpdateVertical(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOrganizationVerticalInput) =>
      apiRequest<Organization>(`/organizations/${organizationId}/vertical`, { method: "PATCH", body: JSON.stringify(input) }),
    // Invalidate both the single-org query (drives the nav via layout.tsx)
    // and the org list (drives the org switcher's dropdown), so the switch is
    // reflected immediately without a full reload.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["organizations"], exact: true });
    }
  });
}
