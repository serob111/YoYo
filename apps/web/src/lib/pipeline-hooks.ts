import { useQuery } from "@tanstack/react-query";
import type { PipelineDto } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function usePipeline(organizationId: string) {
  return useQuery<PipelineDto>({
    queryKey: ["organizations", organizationId, "pipeline"],
    queryFn: () => apiRequest(`/organizations/${organizationId}/pipeline`)
  });
}
