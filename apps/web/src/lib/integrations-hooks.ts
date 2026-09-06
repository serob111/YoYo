import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConnectedAccount } from "@yoyo/contracts";
import { apiRequest, API_URL } from "./api-client";

export function useConnectedAccounts(organizationId: string) {
  return useQuery<ConnectedAccount[]>({
    queryKey: ["organizations", organizationId, "integrations"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/integrations`)
  });
}

export function useDisconnectAccount(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectedAccountId: string) =>
      apiRequest(`/organizations/${organizationId}/integrations/${connectedAccountId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "integrations"] })
  });
}

/** OAuth connect is a full-page browser redirect, not a fetch call - build the href, don't wrap it in a mutation. */
export function connectAccountHref(organizationId: string, provider: "instagram" | "tiktok"): string {
  return `${API_URL}/organizations/${organizationId}/integrations/${provider}/authorize`;
}
