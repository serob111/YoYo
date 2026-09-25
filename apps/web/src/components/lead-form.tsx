"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { LeadIntent, UpsertLeadInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useContacts, useCreateContact } from "@/lib/contacts-hooks";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

const LEAD_INTENTS: LeadIntent[] = ["BUYER", "RENTER", "SELLER", "LANDLORD"];
const LEAD_INTENT_LABELS: Record<LeadIntent, string> = {
  BUYER: "Buyer",
  RENTER: "Renter",
  SELLER: "Seller",
  LANDLORD: "Landlord"
};

export function LeadForm({
  organizationId,
  onSubmit,
  submitLabel,
  isPending
}: {
  organizationId: string;
  onSubmit: (input: UpsertLeadInput) => void;
  submitLabel: string;
  isPending: boolean;
}) {
  const { t: translateText } = useI18n();
  const { data: organization } = useOrganization(organizationId);
  const isRealEstate = organization?.vertical === "real_estate";

  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState<LeadIntent | "">("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");

  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const createContact = useCreateContact(organizationId);

  const { data } = useContacts(organizationId, search);
  const contacts = data?.items ?? [];

  function handleCreateContact(event: FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    createContact.mutate(
      { displayName: search.trim(), phone: newContactPhone.trim() || null, email: newContactEmail.trim() || null },
      {
        onSuccess: (contact) => {
          setContactId(contact.id);
          setContactName(contact.displayName);
          setSearch("");
          setCreatingContact(false);
          setNewContactPhone("");
          setNewContactEmail("");
        }
      }
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!contactId) return;
    onSubmit({
      contactId,
      title,
      intent: intent || null,
      valueCents: value.trim() === "" ? null : Math.round(parseFloat(value) * 100),
      currency: currency || "USD"
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <div className="grid gap-1 text-sm font-medium">
           {translateText("Contact")} {contactId ? (
            <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
              <span>{contactName}</span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => {
                  setContactId(null);
                  setContactName(null);
                }}
              >
                 {translateText("Change")} </button>
            </div>
          ) : (
            <>
              <Input
                placeholder={translateText("Search contacts by name…")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCreatingContact(false);
                }}
              />
              {search && !creatingContact && (
                <div className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-1">
                  {contacts.length === 0 && (
                    <div className="px-2 py-1.5">
                      <p className="text-xs text-muted-foreground">{translateText("No contacts found.")}</p>
                      <button type="button" className="mt-1 text-xs font-medium text-primary underline" onClick={() => setCreatingContact(true)}>
                         {translateText("+ Create new contact “")}{search.trim()}”
                      </button>
                    </div>
                  )}
                  {contacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      className="rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setContactId(contact.id);
                        setContactName(contact.displayName);
                        setSearch("");
                      }}
                    >
                      {contact.displayName}
                      {contact.phone && <span className="ml-1.5 text-xs text-muted-foreground">{contact.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {creatingContact && (
                <div className="mt-1 flex flex-col gap-2 rounded-lg border border-input p-2.5">
                  <p className="text-xs font-medium">
                     {translateText("New contact:")} <span className="font-normal text-muted-foreground">{search.trim()}</span>
                  </p>
                  <Input placeholder={translateText("Phone (optional)")} value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} />
                  <Input placeholder={translateText("Email (optional)")} type="email" value={newContactEmail} onChange={(e) => setNewContactEmail(e.target.value)} />
                  {createContact.isError && <p className="text-xs text-destructive">{translateText("Could not create contact. Try again.")}</p>}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={createContact.isPending} onClick={handleCreateContact}>
                      {createContact.isPending ? translateText("Creating…") : translateText("Create contact")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setCreatingContact(false)}>
                       {translateText("Cancel")} </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {isRealEstate && (
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Intent")} <Select
              items={{ none: "Not set", ...Object.fromEntries(LEAD_INTENTS.map((i) => [i, LEAD_INTENT_LABELS[i]])) }}
              value={intent || "none"}
              onValueChange={(v) => setIntent(!v || v === "none" ? "" : (v as LeadIntent))}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{translateText("Not set")}</SelectItem>
                {LEAD_INTENTS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {translateText(LEAD_INTENT_LABELS[i])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}

        <label className="grid gap-1 text-sm font-medium">
           {translateText("Title")} <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Value")} <Input type="number" min="0" placeholder={translateText("e.g. 5000")} value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Currency")} <Input maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
          </label>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending || !contactId}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
