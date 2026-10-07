"use client";

import { useCallback, useRef, useState } from "react";
import type { PropertyMediaDto, PropertyMediaKind } from "@yoyo/contracts";
import { apiRequest } from "./api-client";

export interface PendingUpload {
  id: string;
  fileName: string;
  progress: number;
  status: "uploading" | "done" | "error";
  errorMessage?: string;
}

function putWithProgress(url: string, file: File, contentType: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/**
 * Presigned-upload -> PUT -> confirm flow for a property's media, with
 * per-file progress and retry. XHR (not fetch) so upload.onprogress works.
 * Shared by the Media tab's upload button and the publish wizard's "upload
 * new" step - Publish picks from PropertyMedia after it lands here, so both
 * reuse this one hook rather than two separate upload implementations.
 */
export function usePropertyMediaUpload(organizationId: string, propertyId: string, onUploaded: (media: PropertyMediaDto) => void) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const filesRef = useRef(new Map<string, File>());

  const runUpload = useCallback(
    async (id: string, file: File) => {
      filesRef.current.set(id, file);
      setUploads((prev) => [...prev.filter((u) => u.id !== id), { id, fileName: file.name, progress: 0, status: "uploading" }]);

      try {
        const kind: PropertyMediaKind = file.type.startsWith("video/") ? "VIDEO" : "IMAGE";
        const { key, uploadUrl } = await apiRequest<{ key: string; uploadUrl: string }>(
          `/organizations/${organizationId}/properties/${propertyId}/media/presigned-upload`,
          { method: "POST", body: JSON.stringify({ contentType: file.type, kind }) }
        );

        await putWithProgress(uploadUrl, file, file.type, (pct) =>
          setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress: pct } : u)))
        );

        const media = await apiRequest<PropertyMediaDto>(`/organizations/${organizationId}/properties/${propertyId}/media`, {
          method: "POST",
          body: JSON.stringify({ kind, storageKey: key, mimeType: file.type })
        });

        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "done", progress: 100 } : u)));
        filesRef.current.delete(id);
        onUploaded(media);
      } catch (error) {
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: "error", errorMessage: error instanceof Error ? error.message : "Upload failed" } : u))
        );
      }
    },
    [organizationId, propertyId, onUploaded]
  );

  const upload = useCallback(
    (file: File) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      void runUpload(id, file);
    },
    [runUpload]
  );

  const retry = useCallback(
    (id: string) => {
      const file = filesRef.current.get(id);
      if (file) void runUpload(id, file);
    },
    [runUpload]
  );

  const dismiss = useCallback((id: string) => {
    filesRef.current.delete(id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  return { uploads, upload, retry, dismiss };
}
