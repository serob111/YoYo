import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Contact, CreateContactInput } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function useContacts(organizationId: string, search?: string) {
  return useQuery<Page<Contact>>({
    queryKey: ["organizations", organizationId, "contacts", { search: search ?? "" }],
    queryFn: () => apiRequest(`/organizations/${organizationId}/contacts${search ? `?search=${encodeURIComponent(search)}` : ""}`)
  });
}

// Infinite-query variant for the standalone Contacts browse page - useContacts
// above returns a single page and stays as-is since it's used by lead-form's
// inline search/create picker, which never needs "Load more".
export function useContactsList(organizationId: string, search?: string) {
  return useInfiniteQuery<Page<Contact>>({
    queryKey: ["organizations", organizationId, "contacts", "list", { search: search ?? "" }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam as string);
      if (search) params.set("search", search);
      const qs = params.toString();
      return apiRequest(`/organizations/${organizationId}/contacts${qs ? `?${qs}` : ""}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
}

export function useCreateContact(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      apiRequest<Contact>(`/organizations/${organizationId}/contacts`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations", organizationId, "contacts"] })
  });
}
