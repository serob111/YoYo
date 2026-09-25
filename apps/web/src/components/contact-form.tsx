"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { CreateContactInput } from "@yoyo/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

export function ContactForm({ onSubmit, isPending }: { onSubmit: (input: CreateContactInput) => void; isPending: boolean }) {
  const { t: translateText } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!displayName.trim()) return;
    onSubmit({ displayName: displayName.trim(), phone: phone.trim() || null, email: email.trim() || null });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Name")} <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Phone")} <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Email")} <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending || !displayName.trim()}>
           {translateText("Create")} </Button>
      </DialogFooter>
    </form>
  );
}
