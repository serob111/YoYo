"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";

export function TopbarSearch({ organizationId }: { organizationId: string }) {
  const { t: translateText } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState("");

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || value.trim() === "") return;
    router.push(`/dashboard/${organizationId}/leads?search=${encodeURIComponent(value.trim())}`);
  }

  return (
    <label className="ml-auto flex h-11 w-full max-w-sm items-center gap-2.5 rounded-full border border-border bg-muted px-4 text-sm text-muted-foreground">
      <MagnifyingGlass size={18} />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={translateText("Search leads...")}
        className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}
