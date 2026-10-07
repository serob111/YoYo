"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useRef, useState } from "react";
import type { ConnectedAccount, ContentPostType } from "@yoyo/contracts";
import type { Locale } from "@/lib/i18n/config";
import { useConnectedAccounts } from "@/lib/integrations-hooks";
import { usePropertyMedia, type PropertyDetail } from "@/lib/properties-hooks";
import { usePropertyMediaUpload } from "@/lib/use-presigned-upload";
import {
  useAddContentMediaFromPropertyMedia,
  useApproveContentItem,
  useContentItem,
  useCreateContentItem,
  useGenerateCaption,
  useSubmitContentItem,
  useUpdateContentItem
} from "@/lib/content-hooks";
import { getPostTypeOptions } from "@/lib/publish-options";
import { formatPrice } from "@/lib/format";
import { PropertyMediaThumbnail } from "@/components/property-media-manager";
import { ProviderBadge } from "@/components/provider-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Step = "channel" | "media" | "caption" | "review";

function buildCaptionInstruction(property: PropertyDetail, locale: Locale): string {
  const location = [property.district, property.city, property.country].filter(Boolean).join(", ");
  const price = formatPrice(property.priceCents, property.currency, property.transactionType, property.rentBillingPeriod, locale);
  const parts = [
    `Property: ${property.title}`,
    location ? `Location: ${location}` : null,
    `${property.transactionType === "RENT" ? "For rent" : "For sale"} at ${price}`,
    property.description ? `Details: ${property.description}` : null
  ].filter((part): part is string => part != null);
  return parts.join(". ");
}

export function PropertyPublishDialog({
  open,
  onOpenChange,
  organizationId,
  property
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  property: PropertyDetail;
}) {
  const { t: translateText, locale } = useI18n();
  const { data: accounts } = useConnectedAccounts(organizationId);
  const { data: propertyMedia = [] } = usePropertyMedia(organizationId, property.id);

  const [step, setStep] = useState<Step>("channel");
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [postType, setPostType] = useState<ContentPostType | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [instruction, setInstruction] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [published, setPublished] = useState<"now" | "scheduled" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createContentItem = useCreateContentItem(organizationId);
  const addMediaFromProperty = useAddContentMediaFromPropertyMedia(organizationId);
  const generateCaption = useGenerateCaption(organizationId);
  const updateContentItem = useUpdateContentItem(organizationId);
  const submitContentItem = useSubmitContentItem(organizationId);
  const approveContentItem = useApproveContentItem(organizationId);
  const { data: contentItem } = useContentItem(organizationId, contentItemId);
  const { uploads, upload } = usePropertyMediaUpload(organizationId, property.id, () => {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const connectedAccounts = (accounts ?? []).filter((a) => a.status === "CONNECTED");
  const postTypeOptions = account ? getPostTypeOptions(account.provider, account.capabilities) : [];
  const selectedOption = postTypeOptions.find((o) => o.value === postType);

  function reset() {
    setStep("channel");
    setAccount(null);
    setPostType(null);
    setSelectedMediaIds([]);
    setContentItemId(null);
    setCaptionDraft("");
    setInstruction("");
    setScheduleMode("now");
    setScheduledFor("");
    setPublished(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function toggleMedia(mediaId: string) {
    if (!selectedOption) return;
    setSelectedMediaIds((prev) => {
      if (prev.includes(mediaId)) return prev.filter((id) => id !== mediaId);
      if (selectedOption.maxMedia === 1) return [mediaId];
      if (prev.length >= selectedOption.maxMedia) return prev;
      return [...prev, mediaId];
    });
  }

  async function handleStartCaption() {
    if (!account || !postType) return;
    setError(null);
    try {
      const item = await createContentItem.mutateAsync({ connectedAccountId: account.id, postType, propertyId: property.id });
      for (let i = 0; i < selectedMediaIds.length; i++) {
        await addMediaFromProperty.mutateAsync({ contentItemId: item.id, propertyMediaId: selectedMediaIds[i]!, order: i });
      }
      setContentItemId(item.id);
      const seeded = buildCaptionInstruction(property, locale);
      setInstruction(seeded);
      await generateCaption.mutateAsync({ contentItemId: item.id, instruction: seeded });
      setStep("caption");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleRegenerate() {
    if (!contentItemId) return;
    setError(null);
    try {
      await generateCaption.mutateAsync({ contentItemId, instruction });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handleGoToReview() {
    if (!contentItemId) return;
    setError(null);
    try {
      if (captionDraft !== contentItem?.caption) {
        await updateContentItem.mutateAsync({ contentItemId, caption: captionDraft });
      }
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function handlePublish() {
    if (!contentItemId) return;
    setError(null);
    try {
      const submitted = await submitContentItem.mutateAsync(contentItemId);
      if (submitted.status === "PENDING_APPROVAL") {
        const scheduledIso = scheduleMode === "schedule" && scheduledFor ? new Date(scheduledFor).toISOString() : undefined;
        await approveContentItem.mutateAsync({ contentItemId, scheduledFor: scheduledIso });
      }
      setPublished(scheduleMode === "schedule" ? "scheduled" : "now");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const caption = contentItem?.caption ?? null;
  const isGenerating = contentItem?.status === "GENERATING";
  const captionValue = captionDraft || caption || "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translateText("Publish")}: {property.title}</DialogTitle>
        </DialogHeader>

        {published ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-lg font-semibold">
              {published === "now" ? translateText("Published!") : translateText("Scheduled!")}
            </p>
            <p className="text-sm text-muted-foreground">
              {published === "now"
                ? translateText("Your post is on its way - check the Social tab in a moment.")
                : translateText("Your post will go out at the scheduled time - check the Social tab.")}
            </p>
            <Button onClick={() => handleOpenChange(false)}>{translateText("Done")}</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {step === "channel" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{translateText("Channel")}</p>
                  {connectedAccounts.length === 0 && (
                    <p className="text-sm text-muted-foreground">{translateText("Connect an Instagram or TikTok account first.")}</p>
                  )}
                  <div className="flex flex-col gap-2">
                    {connectedAccounts.map((acc) => (
                      <button
                        type="button"
                        key={acc.id}
                        onClick={() => {
                          setAccount(acc);
                          setPostType(null);
                        }}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          account?.id === acc.id ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"
                        )}
                      >
                        <span className="font-medium">{acc.displayName ?? acc.username ?? acc.id}</span>
                        <ProviderBadge provider={acc.provider} />
                      </button>
                    ))}
                  </div>
                </div>

                {account && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{translateText("Format")}</p>
                    <div className="flex gap-2">
                      {postTypeOptions.map((option) => (
                        <button
                          type="button"
                          key={option.value}
                          onClick={() => setPostType(option.value)}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                            postType === option.value ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"
                          )}
                        >
                          {translateText(option.label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button disabled={!account || !postType} onClick={() => setStep("media")}>
                    {translateText("Next")}
                  </Button>
                </div>
              </div>
            )}

            {step === "media" && selectedOption && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {selectedOption.maxMedia === 1
                    ? translateText("Choose 1 photo or video.")
                    : translateText("Choose 2-10 photos for the carousel.")}
                </p>

                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {propertyMedia
                    .filter((m) => (selectedOption.value === "VIDEO" ? m.kind === "VIDEO" : m.kind === "IMAGE"))
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => toggleMedia(item.id)}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2",
                          selectedMediaIds.includes(item.id) ? "border-primary" : "border-transparent"
                        )}
                      >
                        <PropertyMediaThumbnail organizationId={organizationId} media={item} />
                        {selectedMediaIds.includes(item.id) && (
                          <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                            {selectedMediaIds.indexOf(item.id) + 1}
                          </span>
                        )}
                      </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    {translateText("Upload new")}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={selectedOption.value === "VIDEO" ? "video/*" : "image/*"}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(file);
                      e.target.value = "";
                    }}
                  />
                  {uploads.some((u) => u.status === "uploading") && <span className="text-xs text-muted-foreground">{translateText("Uploading...")}</span>}
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("channel")}>
                    {translateText("Back")}
                  </Button>
                  <Button
                    disabled={selectedMediaIds.length < selectedOption.minMedia || createContentItem.isPending || addMediaFromProperty.isPending}
                    onClick={handleStartCaption}
                  >
                    {translateText("Next")}
                  </Button>
                </div>
              </div>
            )}

            {step === "caption" && (
              <div className="flex flex-col gap-4">
                <label className="grid gap-1 text-sm font-medium">
                  {translateText("Caption")}
                  <Textarea
                    rows={6}
                    disabled={isGenerating}
                    placeholder={isGenerating ? translateText("Generating...") : undefined}
                    value={captionValue}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                  />
                </label>

                <label className="grid gap-1 text-sm font-medium">
                  {translateText("Regenerate instruction")}
                  <Textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                </label>
                <div>
                  <Button type="button" size="sm" variant="outline" disabled={isGenerating || generateCaption.isPending} onClick={handleRegenerate}>
                    {translateText("Regenerate")}
                  </Button>
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("media")}>
                    {translateText("Back")}
                  </Button>
                  <Button disabled={isGenerating || !captionValue.trim()} onClick={handleGoToReview}>
                    {translateText("Next")}
                  </Button>
                </div>
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col gap-4">
                <div className="flex gap-2 overflow-x-auto">
                  {propertyMedia
                    .filter((m) => selectedMediaIds.includes(m.id))
                    .sort((a, b) => selectedMediaIds.indexOf(a.id) - selectedMediaIds.indexOf(b.id))
                    .map((item) => (
                      <div key={item.id} className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border">
                        <PropertyMediaThumbnail organizationId={organizationId} media={item} />
                      </div>
                    ))}
                </div>
                <p className="whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm">{captionValue}</p>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("now")}
                      className={cn("rounded-lg border px-3 py-1.5 text-sm", scheduleMode === "now" ? "border-primary bg-primary/5" : "border-border")}
                    >
                      {translateText("Publish now")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode("schedule")}
                      className={cn("rounded-lg border px-3 py-1.5 text-sm", scheduleMode === "schedule" ? "border-primary bg-primary/5" : "border-border")}
                    >
                      {translateText("Schedule")}
                    </button>
                  </div>
                  {scheduleMode === "schedule" && (
                    <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                  )}
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("caption")}>
                    {translateText("Back")}
                  </Button>
                  <Button
                    disabled={submitContentItem.isPending || approveContentItem.isPending || (scheduleMode === "schedule" && !scheduledFor)}
                    onClick={handlePublish}
                  >
                    {scheduleMode === "schedule" ? translateText("Schedule") : translateText("Publish now")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
