"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import type { Organization } from "@yoyo/contracts";

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const organization = await apiRequest<Organization>("/organizations", { method: "POST", body: JSON.stringify({ name }) });
      router.push(`/dashboard/${organization.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Create your business</h1>
      <p className="text-sm text-slate-600">This is the organization your AI employee will work for.</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input className="rounded border border-slate-300 p-2" placeholder="Business name" value={name} onChange={(e) => setName(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-slate-900 p-2 text-white disabled:opacity-50" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create organization"}
        </button>
      </form>
    </main>
  );
}
