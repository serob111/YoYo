"use client";

import { useI18n } from "@/lib/i18n/provider";

import type { ContentItemDto, ContentItemStatus } from "@yoyo/contracts";
import { useContentItems } from "@/lib/content-hooks";
import { usePropertySocialSources, useMediaDownloadUrl } from "@/lib/properties-hooks";
import { ProviderBadge } from "@/components/provider-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CONTENT_STATUS_LABELS: Record<ContentItemStatus, string> = {
  DRAFT: "Draft",
  GENERATING: "Generating caption",
  GENERATION_FAILED: "Caption failed",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Scheduled",
  REJECTED: "Rejected",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PUBLISH_FAILED: "Publish failed",
  CANCELLED: "Cancelled"
};

const CONTENT_STATUS_STYLES: Record<ContentItemStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  GENERATING: "bg-slate-100 text-slate-600 hover:bg-slate-100",
  GENERATION_FAILED: "bg-red-100 text-red-800 hover:bg-red-100",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  APPROVED: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  REJECTED: "bg-red-100 text-red-800 hover:bg-red-100",
  PUBLISHING: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  PUBLISHED: "bg-green-100 text-green-800 hover:bg-green-100",
  PUBLISH_FAILED: "bg-red-100 text-red-800 hover:bg-red-100",
  CANCELLED: "bg-slate-100 text-slate-500 hover:bg-slate-100"
};

function ContentThumbnail({ organizationId, item }: { organizationId: string; item: ContentItemDto }) {
  const firstAsset = item.media?.[0];
  const { data } = useMediaDownloadUrl(organizationId, firstAsset?.storageKey ?? null);
  if (!firstAsset || !data?.url) return <div className="h-full w-full bg-muted" />;
  if (firstAsset.kind === "VIDEO") return <video src={data.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={data.url} alt="" className="h-full w-full object-cover" />;
}

export function PropertySocialTab({ organizationId, propertyId }: { organizationId: string; propertyId: string }) {
  const { t: translateText, intlLocale } = useI18n();
  const { data: contentItems } = useContentItems(organizationId, { propertyId });
  const { data: socialSources } = usePropertySocialSources(organizationId, propertyId);

  const hasContentItems = contentItems && contentItems.length > 0;
  const hasSocialSources = socialSources && socialSources.length > 0;

  if (!hasContentItems && !hasSocialSources) {
    return <p className="text-sm text-muted-foreground">{translateText("No social activity for this property yet.")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">{translateText("Published to your channels")}</h3>
        {!hasContentItems && <p className="text-sm text-muted-foreground">{translateText("Nothing published from this property yet.")}</p>}
        {hasContentItems && (
          <div className="flex flex-col gap-2">
            {contentItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                  <ContentThumbnail organizationId={organizationId} item={item} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ProviderBadge provider={item.provider} />
                    <span className="text-xs text-muted-foreground">{translateText(item.postType)}</span>
                  </div>
                  {item.caption && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.caption}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge className={cn(CONTENT_STATUS_STYLES[item.status])}>{translateText(CONTENT_STATUS_LABELS[item.status])}</Badge>
                  {(item.publishedAt ?? item.scheduledFor) && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.publishedAt ?? item.scheduledFor!).toLocaleDateString(intlLocale)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasSocialSources && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">{translateText("Original Instagram posts")}</h3>
          <div className="flex flex-col gap-2">
            {socialSources.map((item) => (
              <a
                key={item.id}
                href={item.permalink ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:border-foreground/30"
              >
                <div className="min-w-0">
                  <span className="font-medium">
                    {item.provider === "INSTAGRAM" ? "Instagram" : "TikTok"} · {translateText(item.mediaType)}
                  </span>
                  {item.caption && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.caption}</p>}
                </div>
                {item.postedAt && <span className="shrink-0 text-xs text-muted-foreground">{new Date(item.postedAt).toLocaleDateString(intlLocale)}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
