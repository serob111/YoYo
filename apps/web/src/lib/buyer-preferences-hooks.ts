import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BuyerPreferenceDto, TransactionType, UpsertBuyerPreferenceInput } from "@yoyo/contracts";
import { apiRequest, ApiRequestError } from "./api-client";

// GET 404s when no preference has been captured yet for this contact +
// transactionType - that's a normal "not captured yet" state, not an error,
// so it's mapped to `null` here rather than left to throw into react-query's
// error state.
export function useBuyerPreference(organizationId: string, contactId: string, transactionType: TransactionType) {
  return useQuery<BuyerPreferenceDto | null>({
    queryKey: ["organizations", organizationId, "contacts", contactId, "buyer-preferences", transactionType],
    enabled: contactId !== "",
    queryFn: async () => {
      try {
        return await apiRequest<BuyerPreferenceDto>(
          `/organizations/${organizationId}/contacts/${contactId}/buyer-preferences?transactionType=${transactionType}`
        );
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) return null;
        throw error;
      }
    }
  });
}

export function useUpsertBuyerPreference(organizationId: string, contactId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBuyerPreferenceInput) =>
      apiRequest<BuyerPreferenceDto>(`/organizations/${organizationId}/contacts/${contactId}/buyer-preferences`, {
        method: "PUT",
        body: JSON.stringify(input)
      }),
    onSuccess: (result) =>
      queryClient.invalidateQueries({
        queryKey: ["organizations", organizationId, "contacts", contactId, "buyer-preferences", result.transactionType]
      })
  });
}
