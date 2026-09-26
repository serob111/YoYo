"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle, InstagramLogo, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import type { PropertyImportCandidateDto } from "@yoyo/contracts";
import { useConnectedAccounts } from "@/lib/integrations-hooks";
import { useProperties } from "@/lib/properties-hooks";
import {
  useIgnoreImportCandidate,
  useImportCandidate,
  useImportCandidates,
  useLatestSocialSync,
  useLinkImportCandidate,
  useStartSocialSync,
  useUpdateImportCandidate
} from "@/lib/social-import-hooks";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";

type FilterKey = "ALL" | "HIGH" | "NEEDS_REVIEW" | "DUPLICATES" | "IMPORTED" | "IGNORED";
const PROPERTY_STATUSES = ["DRAFT", "ACTIVE", "UNDER_OFFER", "SOLD", "RENTED", "ARCHIVED"] as const;

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} />
    </div>
  );
}

function ConfidenceBadge({ confidence, translateText }: { confidence: number; translateText: (s: string) => string }) {
  if (confidence >= 0.75) return <Badge className="bg-emerald-500/15 text-emerald-700">{translateText("High confidence")}</Badge>;
  if (confidence >= 0.5) return <Badge className="bg-amber-500/15 text-amber-700">{translateText("Medium confidence")}</Badge>;
  return <Badge className="bg-muted text-muted-foreground">{translateText("Needs review")}</Badge>;
}

function CandidateCard({ organizationId, candidate }: { organizationId: string; candidate: PropertyImportCandidateDto }) {
  const { t: translateText, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [importStatus, setImportStatus] = useState<(typeof PROPERTY_STATUSES)[number]>("DRAFT");
  const [linkPropertyId, setLinkPropertyId] = useState<string>("");
  const [fields, setFields] = useState({ title: candidate.title, priceCents: Number(candidate.priceCents ?? 0), bedrooms: candidate.bedrooms ?? 0 });

  const update = useUpdateImportCandidate(organizationId, candidate.id);
  const doImport = useImportCandidate(organizationId, candidate.id);
  const link = useLinkImportCandidate(organizationId, candidate.id);
  const ignore = useIgnoreImportCandidate(organizationId, candidate.id);
  const { data: propertiesData } = useProperties(organizationId);
  const existingProperties = propertiesData?.pages.flatMap((p) => p.items) ?? [];

  const isPending = candidate.status === "PENDING_REVIEW";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex flex-col gap-2">
              <Input value={fields.title} onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))} />
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={fields.priceCents / 100}
                  onChange={(e) => setFields((f) => ({ ...f, priceCents: Math.round(Number(e.target.value) * 100) }))}
                  placeholder={translateText("Price")}
                />
                <Input
                  type="number"
                  value={fields.bedrooms}
                  onChange={(e) => setFields((f) => ({ ...f, bedrooms: Number(e.target.value) }))}
                  placeholder={translateText("Bedrooms")}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ title: fields.title, priceCents: fields.priceCents, bedrooms: fields.bedrooms }, { onSuccess: () => setEditing(false) })
                  }
                >
                  {translateText("Save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  {translateText("Cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-semibold">{candidate.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {candidate.transactionType === "RENT" ? translateText("For rent") : translateText("For sale")} · {translateText(candidate.propertyType)} ·{" "}
                {[candidate.district, candidate.city].filter(Boolean).join(", ") || translateText("Location unknown")}
              </p>
              <p className="mt-1 text-sm font-bold tabular-nums">{formatCents(candidate.priceCents, candidate.currency, locale)}</p>
              {candidate.bedrooms != null && <p className="text-xs text-muted-foreground">{candidate.bedrooms} {translateText("bedrooms")}</p>}
            </>
          )}
        </div>
        <ConfidenceBadge confidence={candidate.confidence} translateText={translateText} />
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground">{translateText("Detected from")}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {candidate.items.map((item) => (
            <a
              key={item.id}
              href={item.permalink ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border px-2 py-0.5 text-[0.7rem] text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              {translateText(item.mediaType)} {item.postedAt ? `· ${new Date(item.postedAt).toLocaleDateString(locale)}` : ""}
            </a>
          ))}
        </div>
      </div>

      {candidate.possibleExistingPropertyId && isPending && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <Warning size={14} />
          {translateText("Possible existing property:")} <span className="font-semibold">{candidate.possibleExistingPropertyTitle}</span>
        </div>
      )}

      {isPending ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Select value={importStatus} onValueChange={(v) => v && setImportStatus(v as (typeof PROPERTY_STATUSES)[number])}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {translateText(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={doImport.isPending} onClick={() => doImport.mutate({ status: importStatus })}>
            {translateText("Import")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {translateText("Edit")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinking((v) => !v)}>
            {translateText("Link to existing property")}
          </Button>
          <Button size="sm" variant="ghost" disabled={ignore.isPending} onClick={() => ignore.mutate()}>
            {translateText("Ignore")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 border-t border-border pt-3">
          <Badge className="bg-secondary text-secondary-foreground">
            {candidate.status === "IMPORTED" && translateText("Imported")}
            {candidate.status === "LINKED_EXISTING" && translateText("Linked to existing property")}
            {candidate.status === "IGNORED" && translateText("Ignored")}
          </Badge>
          {candidate.importedPropertyId && (
            <Link href={`/dashboard/${organizationId}/properties/${candidate.importedPropertyId}`} className="ml-2 text-xs font-medium text-primary hover:underline">
              {translateText("View property")}
            </Link>
          )}
        </div>
      )}

      {linking && isPending && (
        <div className="mt-2 flex items-center gap-2">
          <Select value={linkPropertyId} onValueChange={(v) => v && setLinkPropertyId(v)}>
            <SelectTrigger size="sm" className="w-56">
              <SelectValue placeholder={translateText("Choose a property")} />
            </SelectTrigger>
            <SelectContent>
              {existingProperties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!linkPropertyId || link.isPending} onClick={() => link.mutate({ propertyId: linkPropertyId }, { onSuccess: () => setLinking(false) })}>
            {translateText("Link")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ImportFromInstagramPage() {
  const { t: translateText } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const searchParams = useSearchParams();
  const organizationId = params.organizationId;

  const { data: connectedAccounts } = useConnectedAccounts(organizationId);
  const instagramAccounts = (connectedAccounts ?? []).filter((a) => a.provider === "INSTAGRAM" && a.status === "CONNECTED");

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(searchParams.get("accountId"));
  useEffect(() => {
    if (!selectedAccountId && instagramAccounts.length === 1) setSelectedAccountId(instagramAccounts[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instagramAccounts.length]);

  const startSync = useStartSocialSync(organizationId);
  const { data: latestSync } = useLatestSocialSync(organizationId, selectedAccountId);
  const isRunning = latestSync ? latestSync.status === "QUEUED" || latestSync.status === "RUNNING" : false;
  const hasEverSynced = !!latestSync;

  const [filter, setFilter] = useState<FilterKey>("ALL");
  const { data: candidates, isLoading: candidatesLoading } = useImportCandidates(organizationId, { connectedAccountId: selectedAccountId ?? undefined });

  const selectedAccount = instagramAccounts.find((a) => a.id === selectedAccountId);

  const filtered = (candidates ?? []).filter((c) => {
    switch (filter) {
      case "HIGH":
        return c.status === "PENDING_REVIEW" && c.confidence >= 0.75;
      case "NEEDS_REVIEW":
        return c.status === "PENDING_REVIEW" && c.confidence < 0.75;
      case "DUPLICATES":
        return c.status === "PENDING_REVIEW" && c.possibleExistingPropertyId != null;
      case "IMPORTED":
        return c.status === "IMPORTED" || c.status === "LINKED_EXISTING";
      case "IGNORED":
        return c.status === "IGNORED";
      default:
        return true;
    }
  });

  const possibleCount = (candidates ?? []).filter((c) => c.status === "PENDING_REVIEW").length;

  return (
    <div>
      <Link href={`/dashboard/${organizationId}/properties`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={12} /> {translateText("Properties")}
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{translateText("Import from Instagram")}</h1>

      {instagramAccounts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={InstagramLogo}
            title={translateText("Connect Instagram first")}
            description={translateText("Connect a business Instagram account before scanning for existing listings.")}
            action={{ label: "Connect Instagram", href: `/dashboard/${organizationId}/settings/integrations`, external: false }}
          />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Select value={selectedAccountId ?? ""} onValueChange={(v) => v && setSelectedAccountId(v)}>
              <SelectTrigger size="sm" className="w-56">
                <SelectValue placeholder={translateText("Choose connected account")} />
              </SelectTrigger>
              <SelectContent>
                {instagramAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    @{a.username ?? a.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedAccountId && (
              <Button size="sm" disabled={isRunning || startSync.isPending} onClick={() => startSync.mutate(selectedAccountId)}>
                <MagnifyingGlass size={14} /> {isRunning ? translateText("Scanning…") : translateText("Scan Instagram")}
              </Button>
            )}

            {selectedAccount && latestSync && (
              <span className="text-xs text-muted-foreground">
                {selectedAccount.username && `Instagram: @${selectedAccount.username}`}
                {latestSync.status === "COMPLETED" && ` — ${latestSync.totalItems} ${translateText("media items analyzed")}, ${possibleCount} ${translateText("possible properties")}`}
              </span>
            )}
          </div>

          {selectedAccountId && latestSync && (
            <div className="mt-3 rounded-2xl border border-border bg-card p-4">
              {latestSync.status === "QUEUED" && <p className="text-sm text-muted-foreground">{translateText("Preparing your Instagram scan…")}</p>}
              {latestSync.status === "RUNNING" && (
                <>
                  <p className="text-sm font-medium">
                    {translateText("Scanning Instagram")} — {latestSync.processedItems} / {latestSync.totalItems || "…"}
                  </p>
                  <div className="mt-2">
                    <ProgressBar value={latestSync.totalItems > 0 ? latestSync.processedItems / latestSync.totalItems : 0} />
                  </div>
                </>
              )}
              {latestSync.status === "COMPLETED" && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CheckCircle size={16} weight="fill" /> {possibleCount} {translateText("possible properties found")}
                </p>
              )}
              {latestSync.status === "PARTIAL" && (
                <p className="text-sm text-amber-700">
                  {latestSync.processedItems} {translateText("items analyzed")} — {latestSync.errorCount} {translateText("could not be processed")}
                </p>
              )}
              {latestSync.status === "FAILED" && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-destructive">{translateText("We couldn't complete the scan.")}</p>
                  <Button size="sm" variant="outline" onClick={() => startSync.mutate(selectedAccountId)}>
                    {translateText("Retry")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {selectedAccountId && !hasEverSynced && !isRunning && (
            <div className="mt-6">
              <EmptyState
                icon={MagnifyingGlass}
                title={translateText("Ready to scan")}
                description={translateText("We'll analyze this account's existing posts and reels for real-estate listings.")}
              />
            </div>
          )}

          {hasEverSynced && (
            <div className="mt-6">
              <div className="flex flex-wrap gap-1.5">
                {(["ALL", "HIGH", "NEEDS_REVIEW", "DUPLICATES", "IMPORTED", "IGNORED"] as FilterKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${filter === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"}`}
                  >
                    {translateText(
                      { ALL: "All", HIGH: "High confidence", NEEDS_REVIEW: "Needs review", DUPLICATES: "Possible duplicates", IMPORTED: "Imported", IGNORED: "Ignored" }[key]
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {candidatesLoading && <p className="text-sm text-muted-foreground">{translateText("Loading…")}</p>}
                {!candidatesLoading && filtered.length === 0 && <p className="text-sm text-muted-foreground">{translateText("No candidates in this filter.")}</p>}
                {filtered.map((candidate) => (
                  <CandidateCard key={candidate.id} organizationId={organizationId} candidate={candidate} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
