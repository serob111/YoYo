import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ImportPropertyImportCandidateInput,
  LinkPropertyImportCandidateInput,
  PropertyImportCandidateDto,
  PropertyImportCandidateStatus,
  SampleLeadInput,
  SocialSyncDto,
  UpdatePropertyImportCandidateInput
} from "@yoyo/contracts";
import { apiRequest } from "./api-client";

const RUNNING_STATUSES = new Set(["QUEUED", "RUNNING"]);

export function useStartSocialSync(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectedAccountId: string) =>
      apiRequest<SocialSyncDto>(`/organizations/${organizationId}/social-syncs`, { method: "POST", body: JSON.stringify({ connectedAccountId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "social-syncs"] })
  });
}

export function useSocialSync(organizationId: string, syncId: string | null) {
  return useQuery<SocialSyncDto>({
    queryKey: ["organizations", organizationId, "social-syncs", syncId],
    queryFn: () => apiRequest(`/organizations/${organizationId}/social-syncs/${syncId}`),
    enabled: !!syncId,
    // Poll while the sync is in flight; stop once it reaches a terminal status.
    refetchInterval: (query) => (query.state.data && RUNNING_STATUSES.has(query.state.data.status) ? 1500 : false)
  });
}

export function useLatestSocialSync(organizationId: string, connectedAccountId: string | null) {
  return useQuery<SocialSyncDto | null>({
    queryKey: ["organizations", organizationId, "social-syncs", "latest", connectedAccountId],
    queryFn: () => apiRequest(`/organizations/${organizationId}/social-syncs/latest?connectedAccountId=${connectedAccountId}`),
    enabled: !!connectedAccountId,
    refetchInterval: (query) => (query.state.data && RUNNING_STATUSES.has(query.state.data.status) ? 1500 : false)
  });
}

export function useImportCandidates(organizationId: string, filters: { status?: PropertyImportCandidateStatus; connectedAccountId?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.connectedAccountId) params.set("connectedAccountId", filters.connectedAccountId);
  const qs = params.toString();
  return useQuery<PropertyImportCandidateDto[]>({
    queryKey: ["organizations", organizationId, "property-import-candidates", filters],
    queryFn: () => apiRequest(`/organizations/${organizationId}/property-import-candidates${qs ? `?${qs}` : ""}`)
  });
}

function useInvalidateCandidates(organizationId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "property-import-candidates"] });
    queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "properties"] });
    queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "setup-status"] });
  };
}

export function useUpdateImportCandidate(organizationId: string, candidateId: string) {
  const invalidate = useInvalidateCandidates(organizationId);
  return useMutation({
    mutationFn: (input: UpdatePropertyImportCandidateInput) =>
      apiRequest(`/organizations/${organizationId}/property-import-candidates/${candidateId}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: invalidate
  });
}

export function useImportCandidate(organizationId: string, candidateId: string) {
  const invalidate = useInvalidateCandidates(organizationId);
  return useMutation({
    mutationFn: (input: ImportPropertyImportCandidateInput) =>
      apiRequest(`/organizations/${organizationId}/property-import-candidates/${candidateId}/import`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate
  });
}

export function useLinkImportCandidate(organizationId: string, candidateId: string) {
  const invalidate = useInvalidateCandidates(organizationId);
  return useMutation({
    mutationFn: (input: LinkPropertyImportCandidateInput) =>
      apiRequest(`/organizations/${organizationId}/property-import-candidates/${candidateId}/link`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate
  });
}

export function useIgnoreImportCandidate(organizationId: string, candidateId: string) {
  const invalidate = useInvalidateCandidates(organizationId);
  return useMutation({
    mutationFn: () => apiRequest(`/organizations/${organizationId}/property-import-candidates/${candidateId}/ignore`, { method: "POST" }),
    onSuccess: invalidate
  });
}

export function useSampleLead(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SampleLeadInput) =>
      apiRequest<{ conversationId: string; contactId: string; messageId: string }>(`/organizations/${organizationId}/demo/sample-lead`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "leads"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "conversations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "setup-status"] });
    }
  });
}
