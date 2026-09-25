"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Buildings, Check, InstagramLogo, PaperPlaneTilt, UsersThree, X } from "@phosphor-icons/react";
import type { SetupStatus } from "@yoyo/contracts";
import { connectAccountHref } from "@/lib/integrations-hooks";
import { useSampleLead } from "@/lib/social-import-hooks";
import { Button } from "@/components/ui/button";

const SAMPLE_LEAD_MESSAGE = "I'm looking for a 2-3 bedroom apartment in Dubai Marina under AED 2M.";

function StepRow({ done, title, description, children }: { done: boolean; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-4 first:border-t-0">
      <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary text-primary-foreground" : "border border-border text-transparent"}`}>
        {done && <Check size={12} weight="bold" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${done ? "text-muted-foreground line-through" : ""}`}>{title}</p>
        {!done && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        {!done && children && <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

export function GettingStartedPanel({ organizationId, setupStatus, onDismiss }: { organizationId: string; setupStatus: SetupStatus; onDismiss: () => void }) {
  const { t: translateText } = useI18n();
  const [sampleLeadResult, setSampleLeadResult] = useState<"idle" | "sent" | "error">("idle");
  const sampleLead = useSampleLead(organizationId);

  function trySampleLead() {
    sampleLead.mutate(
      { message: SAMPLE_LEAD_MESSAGE },
      {
        onSuccess: () => setSampleLeadResult("sent"),
        onError: () => setSampleLeadResult("error")
      }
    );
  }

  return (
    <div className="relative rounded-2xl border border-border bg-card p-5">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label={translateText("Skip setup")}
      >
        <X size={16} />
      </button>

      <h2 className="text-lg font-bold tracking-tight">{translateText("Welcome to YoYo")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{translateText("Get your agency ready to receive and qualify leads.")}</p>

      <div className="mt-4">
        <StepRow done={setupStatus.agencyCreated} title={translateText("Agency created")} description="" />

        <StepRow
          done={setupStatus.inventoryConfigured}
          title={translateText("Add or import your properties")}
          description={translateText("Manually add a listing, or scan an existing Instagram account for properties you've already posted.")}
        >
          <Button size="sm" nativeButton={false} render={<Link href={`/dashboard/${organizationId}/properties`} />}>
            {translateText("Add property")}
          </Button>
          <Button size="sm" variant="secondary" nativeButton={false} render={<Link href={`/dashboard/${organizationId}/properties/import`} />}>
            <InstagramLogo size={14} /> {translateText("Import from Instagram")}
          </Button>
        </StepRow>

        <StepRow
          done={setupStatus.socialConnected}
          title={translateText("Connect a lead source")}
          description={translateText("Connect Instagram or TikTok so new customer messages reach your inbox.")}
        >
          <Button size="sm" nativeButton={false} render={<a href={connectAccountHref(organizationId, "instagram")} />}>
            {translateText("Connect Instagram")}
          </Button>
          <Button size="sm" variant="secondary" nativeButton={false} render={<a href={connectAccountHref(organizationId, "tiktok")} />}>
            {translateText("Connect TikTok")}
          </Button>
        </StepRow>

        <StepRow
          done={setupStatus.firstLeadProcessed}
          title={translateText("Process your first lead")}
          description={translateText("Send a sample buyer message through the same AI qualification flow real leads use.")}
        >
          <Button size="sm" onClick={trySampleLead} disabled={sampleLead.isPending}>
            <PaperPlaneTilt size={14} /> {sampleLead.isPending ? translateText("Sending…") : translateText("Try sample lead")}
          </Button>
          {sampleLeadResult === "sent" && (
            <span className="self-center text-xs font-medium text-emerald-600">
              {translateText("Sent! The AI is qualifying it now")} —{" "}
              <Link href={`/dashboard/${organizationId}/leads`} className="underline">
                {translateText("check Leads")}
              </Link>
            </span>
          )}
          {sampleLeadResult === "error" && (
            <span className="self-center text-xs font-medium text-destructive">{translateText("Connect Instagram or TikTok first.")}</span>
          )}
        </StepRow>

        <StepRow
          done={setupStatus.firstMatchReviewed}
          title={translateText("Review your first match")}
          description={translateText("Once a lead's preferences match one of your properties, link them from the lead's page.")}
        >
          <Button size="sm" variant="secondary" nativeButton={false} render={<Link href={`/dashboard/${organizationId}/leads`} />}>
            <UsersThree size={14} /> {translateText("Go to leads")}
          </Button>
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/dashboard/${organizationId}/properties`} />}>
            <Buildings size={14} /> {translateText("View properties")}
          </Button>
        </StepRow>
      </div>
    </div>
  );
}
