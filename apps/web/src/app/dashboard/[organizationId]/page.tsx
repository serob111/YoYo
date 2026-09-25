"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, CalendarBlank, ChatCircle, ClockCountdown, InstagramLogo, MapPin, Robot, TrendUp, UsersThree, type Icon } from "@phosphor-icons/react";
import { useCurrentUser, useDashboardStats, useOrganization } from "@/lib/hooks";
import { useConversations } from "@/lib/conversations-hooks";
import { useLeads } from "@/lib/leads-hooks";
import { usePipeline } from "@/lib/pipeline-hooks";
import { useViewings } from "@/lib/viewings-hooks";
import { useProperties } from "@/lib/properties-hooks";
import { useConnectedAccounts, connectAccountHref } from "@/lib/integrations-hooks";
import { formatCents, formatPrice } from "@/lib/format";
import { InitialsAvatar } from "@/components/initials-avatar";
import { PropertyArt } from "@/components/property-art";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConversationList } from "./inbox/conversation-list";
import { ConversationThread } from "./inbox/conversation-thread";

function PanelHeader({ title, count, href, linkLabel }: { title: string; count?: number; href: string; linkLabel: string }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {count != null && count > 0 && <Badge className="bg-primary text-primary-foreground">{count}</Badge>}
      <Link href={href} className="ml-auto flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        {linkLabel} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: Icon;
  label: string;
  value: string;
  tone?: "warning";
}) {
  const { t: translateText, locale, intlLocale } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone === "warning" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"}`}>
        <Icon size={18} weight="bold" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight tabular-nums">{value}</p>
        <p className="truncate text-xs font-medium text-muted-foreground">{translateText(label)}</p>
      </div>
    </div>
  );
}

export default function DashboardHomePage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const { data: user } = useCurrentUser();
  const isRealEstate = organization?.vertical === "real_estate";

  const { data: connectedAccounts } = useConnectedAccounts(organizationId);
  const hasConnectedAccount = (connectedAccounts?.length ?? 0) > 0;
  const { data: stats } = useDashboardStats(organizationId);

  const { data: conversationsData, isLoading: conversationsLoading } = useConversations(organizationId);
  const conversations = conversationsData?.pages.flatMap((page) => page.items) ?? [];
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) setSelectedConversationId(conversations[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);
  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);

  const { data: pipeline } = usePipeline(organizationId);
  const { data: leadsData, isLoading: leadsLoading } = useLeads(organizationId);
  const openLeads = useMemo(
    () => (leadsData?.pages.flatMap((page) => page.items) ?? []).filter((lead) => !lead.closedAt).slice(0, 8),
    [leadsData]
  );

  const { data: propertiesData } = useProperties(organizationId);
  const featuredProperty = isRealEstate ? propertiesData?.pages[0]?.items.find((p) => p.status === "ACTIVE") : undefined;

  const { data: viewingsData } = useViewings(organizationId);
  const upcomingViewings = useMemo(() => {
    if (!viewingsData) return [];
    const now = Date.now();
    return viewingsData.filter((v) => v.status === "SCHEDULED" && new Date(v.scheduledFor).getTime() >= now).slice(0, 3);
  }, [viewingsData]);

  const aiConversationsTotal = (stats?.aiHandledConversations ?? 0) + (stats?.humanHandledConversations ?? 0);
  const aiHandledShare = aiConversationsTotal > 0 ? Math.round(((stats?.aiHandledConversations ?? 0) / aiConversationsTotal) * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard icon={UsersThree} label={translateText("New leads this week")} value={String(stats.newLeadsThisWeek)} />
          <KpiCard
            icon={ClockCountdown}
            label={translateText("Overdue follow-ups")}
            value={String(stats.overdueFollowUps)}
            tone={stats.overdueFollowUps > 0 ? "warning" : undefined}
          />
          <KpiCard icon={TrendUp} label={translateText("Conversion rate")} value={stats.conversionRate != null ? `${Math.round(stats.conversionRate * 100)}%` : "—"} />
          <KpiCard icon={Robot} label={translateText("AI-handled conversations")} value={aiHandledShare != null ? `${aiHandledShare}%` : "—"} />
        </div>
      )}

      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card lg:grid-cols-[320px_minmax(0,1fr)_320px]" style={{ minHeight: 620 }}>
        <div className="flex flex-col border-b border-border lg:border-b-0 lg:border-r">
          <PanelHeader title={translateText("Conversations")} count={conversations.length} href={`/dashboard/${organizationId}/inbox`} linkLabel="All" />
          <div className="flex-1 overflow-y-auto">
            {conversationsLoading ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : conversations.length === 0 ? (
              hasConnectedAccount ? (
                <EmptyState
                  icon={ChatCircle}
                  title={translateText("No conversations yet")}
                  description={translateText("New messages from Instagram or TikTok will show up here automatically.")}
                  compact
                />
              ) : (
                <EmptyState
                  icon={InstagramLogo}
                  title={translateText("Connect a channel to start")}
                  description={translateText("Link your Instagram or TikTok account so customer messages start flowing in.")}
                  action={{ label: "Connect Instagram", href: connectAccountHref(organizationId, "instagram"), external: true }}
                  compact
                />
              )
            ) : (
              <ConversationList organizationId={organizationId} selectedConversationId={selectedConversationId} onSelect={setSelectedConversationId} />
            )}
          </div>
        </div>

        <div className="flex flex-col border-b border-border lg:border-b-0 lg:border-r">
          {selectedConversation ? (
            <ConversationThread organizationId={organizationId} conversation={selectedConversation} currentUserId={user?.id} />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {conversationsLoading
                ? translateText("Loading…")
                : conversations.length === 0
                  ? translateText("Once you're connected, incoming conversations will open here.")
                  : translateText("Select a conversation to view messages.")}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          {isRealEstate && featuredProperty && (
            <Link
              href={`/dashboard/${organizationId}/properties/${featuredProperty.id}`}
              className="m-3 mb-0 block overflow-hidden rounded-xl border border-border hover:border-foreground/20"
            >
              <PropertyArt propertyType={featuredProperty.propertyType} className="h-28 w-full" />
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{featuredProperty.title}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {formatPrice(featuredProperty.priceCents, featuredProperty.currency, featuredProperty.transactionType, featuredProperty.rentBillingPeriod, locale)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[featuredProperty.bedrooms != null ? `${featuredProperty.bedrooms} bd` : null, featuredProperty.district, featuredProperty.city]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </Link>
          )}
          <PanelHeader title={translateText("Active leads")} count={openLeads.length} href={`/dashboard/${organizationId}/leads`} linkLabel="All" />
          <div className="flex-1 overflow-y-auto">
            {leadsLoading && (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            )}
            {!leadsLoading && openLeads.length === 0 && (
              <EmptyState
                icon={UsersThree}
                title={translateText("No active leads yet")}
                description={
                  hasConnectedAccount
                    ? translateText("Leads are created automatically from conversations, or you can add one yourself.")
                    : translateText("Once conversations come in, leads show up here - or add one yourself.")
                }
                action={{ label: "Go to leads", href: `/dashboard/${organizationId}/leads` }}
                compact
              />
            )}
            {openLeads.map((lead) => {
              const stageIndex = pipeline?.stages.findIndex((s) => s.id === lead.stageId) ?? -1;
              const totalStages = pipeline?.stages.length ?? 1;
              const progress = stageIndex >= 0 && totalStages > 1 ? Math.round(((stageIndex + 1) / totalStages) * 100) : 100;
              const stageName = pipeline?.stages.find((s) => s.id === lead.stageId)?.name ?? "—";
              return (
                <Link
                  key={lead.id}
                  href={`/dashboard/${organizationId}/leads/${lead.id}`}
                  className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 hover:bg-secondary/60"
                >
                  <InitialsAvatar name={lead.contactDisplayName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{lead.contactDisplayName}</span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{formatCents(lead.valueCents, lead.currency, locale)}</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{stageName}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {isRealEstate && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
               {translateText("Upcoming viewings")} {upcomingViewings.length > 0 && <Badge className="bg-primary text-primary-foreground">{upcomingViewings.length}</Badge>}
            </h2>
            <Link href={`/dashboard/${organizationId}/viewings`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
               {translateText("All viewings")} <ArrowRight size={12} />
            </Link>
          </div>
          {upcomingViewings.length === 0 ? (
            <EmptyState
              icon={CalendarBlank}
              title={translateText("No viewings scheduled")}
              description={translateText("Schedule one from a lead's page, or a client can book directly from your public storefront.")}
              compact
            />
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {upcomingViewings.map((viewing) => (
                <Link key={viewing.id} href={`/dashboard/${organizationId}/properties/${viewing.propertyId}`} className="relative border-l-2 border-border pl-5 hover:border-primary">
                  <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card" />
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <CalendarBlank size={13} />
                    {new Date(viewing.scheduledFor).toLocaleString(intlLocale, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <p className="mt-1.5 truncate text-sm font-semibold">{viewing.propertyTitle}</p>
                  <p className="mt-2.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <MapPin size={13} />
                    {viewing.leadTitle}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
