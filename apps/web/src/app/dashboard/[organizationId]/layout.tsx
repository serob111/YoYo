"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCurrentUser, useMyOrganizations } from "@/lib/hooks";
import { apiRequest } from "@/lib/api-client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ organizationId: string }>();
  const router = useRouter();
  const { data: user, isError: userError } = useCurrentUser();
  const { data: organizations } = useMyOrganizations();

  if (userError) {
    router.push("/login");
    return null;
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col gap-4 border-r border-slate-200 p-4">
        <select
          className="rounded border border-slate-300 p-1 text-sm"
          value={params.organizationId}
          onChange={(e) => router.push(`/dashboard/${e.target.value}`)}
        >
          {organizations?.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href={`/dashboard/${params.organizationId}`}>Dashboard</Link>
          <Link href={`/dashboard/${params.organizationId}/inbox`}>Inbox</Link>
          <Link href={`/dashboard/${params.organizationId}/settings/members`}>Members</Link>
          <Link href={`/dashboard/${params.organizationId}/settings/integrations`}>Integrations</Link>
        </nav>
        <div className="mt-auto text-xs text-slate-500">
          {user && <p className="mb-2">{user.email}</p>}
          <button onClick={() => void logout()} className="underline">
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
