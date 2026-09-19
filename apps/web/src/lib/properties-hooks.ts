import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertyDto, UpsertPropertyInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type PropertyDetail = PropertyDto & { leads: { leadId: string; lead: { id: string; title: string } }[] };

export function useProperties(organizationId: string) {
  return useInfiniteQuery<Page<PropertyDto>>({
    queryKey: ["organizations", organizationId, "properties"],
    queryFn: ({ pageParam }) => apiRequest(`/organizations/${organizationId}/properties${pageParam ? `?cursor=${pageParam}` : ""}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
}

export function useProperty(organizationId: string, propertyId: string, enabled = true) {
  return useQuery<PropertyDetail>({
    queryKey: ["organizations", organizationId, "properties", propertyId],
    queryFn: () => apiRequest(`/organizations/${organizationId}/properties/${propertyId}`),
    enabled
  });
}

export function useCreateProperty(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPropertyInput) =>
      apiRequest(`/organizations/${organizationId}/properties`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties"] })
  });
}

export function useUpdateProperty(organizationId: string, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPropertyInput) =>
      apiRequest(`/organizations/${organizationId}/properties/${propertyId}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties", propertyId] });
    }
  });
}

export function useLinkLeadToProperty(organizationId: string, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) =>
      apiRequest(`/organizations/${organizationId}/properties/${propertyId}/leads`, { method: "POST", body: JSON.stringify({ leadId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties", propertyId] })
  });
}

export function useUnlinkLeadFromProperty(organizationId: string, propertyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (leadId: string) => apiRequest(`/organizations/${organizationId}/properties/${propertyId}/leads/${leadId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties", propertyId] })
  });
}

export function useDeleteProperty(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (propertyId: string) => apiRequest(`/organizations/${organizationId}/properties/${propertyId}`, { method: "DELETE" }),
    // Note: this invalidation prefix-matches the deleted row's own detail query
    // key too. That's fine as long as the caller disables useProperty (see its
    // `enabled` param) before/while deleting - see the detail page.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties"] })
  });
}
