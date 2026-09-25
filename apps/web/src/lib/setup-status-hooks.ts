import { useQuery } from "@tanstack/react-query";
import type { SetupStatus } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useSetupStatus(organizationId: string) {
  return useQuery<SetupStatus>({
    queryKey: ["organizations", organizationId, "setup-status"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/setup-status`)
  });
}
