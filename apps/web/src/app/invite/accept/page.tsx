"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api-client";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<PageShell>Joining organization...</PageShell>}>
      <AcceptInviteInner />
    </Suspense>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">{children}</main>;
}

function AcceptInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("This invite link is missing its token.");
      return;
    }
    apiRequest<{ organizationId: string }>("/members/accept-invite", { method: "POST", body: JSON.stringify({ token }) })
      .then(({ organizationId }) => router.push(`/dashboard/${organizationId}`))
      .catch((err) => setError(err instanceof ApiRequestError ? err.error.message : "This invite is invalid or has expired."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PageShell>{error ? <p className="text-red-600">{error}</p> : <p>Joining organization...</p>}</PageShell>;
}
