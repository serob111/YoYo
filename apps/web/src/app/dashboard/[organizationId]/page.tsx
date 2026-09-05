"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { Organization } from "@yoyo/contracts";
import { apiRequest } from "@/lib/api-client";

export default function DashboardHomePage() {
  const params = useParams<{ organizationId: string }>();
  const { data: organization } = useQuery<Organization>({
    queryKey: ["organizations", params.organizationId],
    queryFn: () => apiRequest(`/organizations/${params.organizationId}`)
  });

  return (
    <div>
      <h1 className="text-xl font-semibold">{organization?.name ?? "Dashboard"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your role: <span className="font-medium">{organization?.myRole}</span>
      </p>
      <p className="mt-6 text-slate-500">
        Messaging, CRM, AI, and content features land in later phases. This is the Phase 1 foundation shell.
      </p>
    </div>
  );
}
