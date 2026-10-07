import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertyDto, PropertyMediaDto, UpsertPropertyInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export interface PropertySocialSource {
  id: string;
  provider: "INSTAGRAM" | "TIKTOK";
  mediaType: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL";
  caption: string | null;
  permalink: string | null;
  postedAt: string | null;
  thumbnailUrl: string | null;
}

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

export function usePropertyMedia(organizationId: string, propertyId: string) {
  return useQuery<PropertyMediaDto[]>({
    queryKey: ["organizations", organizationId, "properties", propertyId, "media"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/properties/${propertyId}/media`)
  });
}

function usePropertyMediaMutation<TVariables>(
  organizationId: string,
  propertyId: string,
  mutationFn: (variables: TVariables) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties", propertyId, "media"] })
  });
}

export function useReorderPropertyMedia(organizationId: string, propertyId: string) {
  return usePropertyMediaMutation(organizationId, propertyId, (mediaIds: string[]) =>
    apiRequest(`/organizations/${organizationId}/properties/${propertyId}/media/reorder`, { method: "PATCH", body: JSON.stringify({ mediaIds }) })
  );
}

export function useSetCoverPropertyMedia(organizationId: string, propertyId: string) {
  return usePropertyMediaMutation(organizationId, propertyId, (mediaId: string) =>
    apiRequest(`/organizations/${organizationId}/properties/${propertyId}/media/${mediaId}/set-cover`, { method: "POST" })
  );
}

export function useDeletePropertyMedia(organizationId: string, propertyId: string) {
  return usePropertyMediaMutation(organizationId, propertyId, (mediaId: string) =>
    apiRequest(`/organizations/${organizationId}/properties/${propertyId}/media/${mediaId}`, { method: "DELETE" })
  );
}

// Presigned URLs expire in 15 minutes server-side (StorageClient's default) -
// a 5 minute staleTime keeps thumbnails refreshing well before that without
// re-signing on every render.
export function useMediaDownloadUrl(organizationId: string, key: string | null) {
  return useQuery<{ url: string }>({
    queryKey: ["organizations", organizationId, "media", "presigned-download", key],
    queryFn: () => apiRequest(`/organizations/${organizationId}/media/presigned-download?key=${encodeURIComponent(key!)}`),
    enabled: key != null,
    staleTime: 5 * 60 * 1000
  });
}

export function usePropertySocialSources(organizationId: string, propertyId: string) {
  return useQuery<PropertySocialSource[]>({
    queryKey: ["organizations", organizationId, "properties", propertyId, "social-sources"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/properties/${propertyId}/social-sources`)
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
