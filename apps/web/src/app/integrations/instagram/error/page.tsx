"use client";

import { useI18n } from "@/lib/i18n/provider";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMyOrganizations } from "@/lib/hooks";

const MESSAGES: Record<string, string> = {
  missing_code: "Instagram didn't return an authorization code. Please try connecting again.",
  invalid_state: "This connection attempt could not be verified and may have expired. Please try again.",
  connection_failed: "We couldn't complete the connection to Instagram. Please try again."
};

export default function InstagramOAuthErrorPage() {
  return (
    <Suspense>
      <InstagramOAuthErrorContent />
    </Suspense>
  );
}

function InstagramOAuthErrorContent() {
  const { t: translateText } = useI18n();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason") ?? "connection_failed";
  // No organizationId is available on this top-level redirect target - route
  // back to the first org's integrations page the same way the dashboard's
  // own org picker would, falling back to the marketing home page.
  const { data: organizations } = useMyOrganizations();
  const backHref = organizations?.[0] ? `/dashboard/${organizations[0].id}/settings/integrations` : "/";

  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-xl font-semibold">{translateText("Couldn't connect Instagram")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{MESSAGES[reason] ?? reason}</p>
      <Link href={backHref} className="mt-6 inline-block underline">
         {translateText("Back to integrations")} </Link>
    </div>
  );
}
