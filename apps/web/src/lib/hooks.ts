import { useQuery } from "@tanstack/react-query";
import type { CurrentUser, Organization } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: () => apiRequest<CurrentUser>("/me"),
    retry: false
  });
}

export function useMyOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: () => apiRequest<Organization[]>("/organizations")
  });
}
