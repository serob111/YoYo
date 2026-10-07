"use client";

import { useRef } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useDeletePropertyMedia,
  useMediaDownloadUrl,
  usePropertyMedia,
  useReorderPropertyMedia,
  useSetCoverPropertyMedia
} from "@/lib/properties-hooks";
import { usePropertyMediaUpload } from "@/lib/use-presigned-upload";
import { PROPERTY_MEDIA_SOURCE_LABELS } from "@/lib/property-labels";
import type { PropertyMediaDto } from "@yoyo/contracts";
import { ChevronDownIcon, ChevronUpIcon, RotateCcwIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";

export function PropertyMediaThumbnail({ organizationId, media }: { organizationId: string; media: PropertyMediaDto }) {
  const { t: translateText } = useI18n();
  const { data } = useMediaDownloadUrl(organizationId, media.storageKey);
  const src = media.externalUrl ?? data?.url;

  if (!src) {
    return <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">{translateText("Loading...")}</div>;
  }
  if (media.kind === "VIDEO") {
    return <video src={src} className="h-full w-full object-cover" muted playsInline preload="metadata" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="h-full w-full object-cover" />;
}

export function PropertyMediaManager({ organizationId, propertyId }: { organizationId: string; propertyId: string }) {
  const { t: translateText } = useI18n();
  const { data: media = [] } = usePropertyMedia(organizationId, propertyId);
  const reorder = useReorderPropertyMedia(organizationId, propertyId);
  const setCover = useSetCoverPropertyMedia(organizationId, propertyId);
  const remove = useDeletePropertyMedia(organizationId, propertyId);
  const { uploads, upload, retry, dismiss } = usePropertyMediaUpload(organizationId, propertyId, () => {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = [...media].sort((a, b) => a.position - b.position);

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => upload(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const next = [...sorted];
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate(next.map((m) => m.id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{translateText("Media")}</h3>
        <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
          {translateText("Add media")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div key={u.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="flex-1 truncate">{u.fileName}</span>
              {u.status === "uploading" && (
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${u.progress}%` }} />
                </div>
              )}
              {u.status === "error" && (
                <>
                  <span className="text-xs text-destructive">{translateText("Failed")}</span>
                  <Button type="button" size="icon-xs" variant="ghost" onClick={() => retry(u.id)}>
                    <RotateCcwIcon className="size-3.5" />
                  </Button>
                </>
              )}
              {u.status !== "uploading" && (
                <Button type="button" size="icon-xs" variant="ghost" onClick={() => dismiss(u.id)}>
                  <XIcon className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translateText("No media yet.")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {sorted.map((item, index) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
              <PropertyMediaThumbnail organizationId={organizationId} media={item} />

              <div className="absolute left-1.5 top-1.5 flex gap-1">
                {item.isCover && <Badge variant="secondary">{translateText("Cover")}</Badge>}
                {item.source !== "MANUAL" && <Badge variant="outline">{translateText(PROPERTY_MEDIA_SOURCE_LABELS[item.source])}</Badge>}
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-0.5">
                  <Button type="button" size="icon-xs" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ChevronUpIcon className="size-3.5" />
                  </Button>
                  <Button type="button" size="icon-xs" variant="ghost" disabled={index === sorted.length - 1} onClick={() => move(index, 1)}>
                    <ChevronDownIcon className="size-3.5" />
                  </Button>
                </div>
                <div className="flex gap-0.5">
                  {!item.isCover && (
                    <Button type="button" size="icon-xs" variant="ghost" title={translateText("Set as cover")} onClick={() => setCover.mutate(item.id)}>
                      <StarIcon className="size-3.5" />
                    </Button>
                  )}
                  <Button type="button" size="icon-xs" variant="ghost" title={translateText("Delete")} onClick={() => remove.mutate(item.id)}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
