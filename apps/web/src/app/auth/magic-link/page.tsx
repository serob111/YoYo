"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import type { Organization } from "@yoyo/contracts";

export default function MagicLinkConsumePage() {
  return (
    <Suspense fallback={<PageShell>Logging you in...</PageShell>}>
      <MagicLinkConsumeInner />
    </Suspense>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">{children}</main>;
}

function MagicLinkConsumeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("This link is missing its token.");
      return;
    }
    apiRequest("/auth/magic-link/consume", { method: "POST", body: JSON.stringify({ token }) })
      .then(() => apiRequest<Organization[]>("/organizations"))
      .then((organizations) => {
        router.push(organizations.length > 0 ? `/dashboard/${organizations[0]!.id}` : "/onboarding/create-organization");
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.error.message : "This link is invalid or has expired."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PageShell>{error ? <p className="text-red-600">{error}</p> : <p>Logging you in...</p>}</PageShell>;
}
