"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMyOrganizations } from "@/lib/hooks";

const MESSAGES: Record<string, string> = {
  missing_code: "TikTok didn't return an authorization code. Please try connecting again.",
  invalid_state: "This connection attempt could not be verified and may have expired. Please try again.",
  connection_failed: "We couldn't complete the connection to TikTok. Please try again."
};

export default function TikTokOAuthErrorPage() {
  return (
    <Suspense>
      <TikTokOAuthErrorContent />
    </Suspense>
  );
}

function TikTokOAuthErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "connection_failed";
  const { data: organizations } = useMyOrganizations();
  const backHref = organizations?.[0] ? `/dashboard/${organizations[0].id}/settings/integrations` : "/";

  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-xl font-semibold">Couldn&apos;t connect TikTok</h1>
      <p className="mt-2 text-sm text-muted-foreground">{MESSAGES[reason] ?? reason}</p>
      <Link href={backHref} className="mt-6 inline-block underline">
        Back to integrations
      </Link>
    </div>
  );
}
