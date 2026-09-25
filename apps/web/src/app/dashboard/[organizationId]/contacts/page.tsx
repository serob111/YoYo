"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import type { CreateContactInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useContactsList, useCreateContact } from "@/lib/contacts-hooks";
import { ContactForm } from "@/components/contact-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function ContactsPage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageCRM");

  const [search, setSearch] = useState("");
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useContactsList(organizationId, search || undefined);
  const contacts = data?.pages.flatMap((page) => page.items) ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const createContact = useCreateContact(organizationId);

  function handleCreate(input: CreateContactInput) {
    createContact.mutate(input, { onSuccess: () => setCreateOpen(false) });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translateText("Contacts")}</h1>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button />}>{translateText("New contact")}</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{translateText("New contact")}</DialogTitle>
              </DialogHeader>
              <ContactForm onSubmit={handleCreate} isPending={createContact.isPending} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative mt-4 w-64">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={translateText("Search contacts...")} className="pl-8" />
      </div>

      <div className="mt-6">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && contacts.length === 0 && search && <p className="text-sm text-muted-foreground">{translateText("No contacts match your search.")}</p>}
        {!isLoading && contacts.length === 0 && !search && (
          <EmptyState icon={UsersThree} title={translateText("No contacts yet")} description={translateText("Contacts are created automatically from conversations, or use the “New contact” button above to add one.")} />
        )}

        {contacts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translateText("Name")}</TableHead>
                <TableHead>{translateText("Phone")}</TableHead>
                <TableHead>{translateText("Email")}</TableHead>
                <TableHead>{translateText("Added")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">{contact.displayName}</TableCell>
                  <TableCell>{contact.phone ?? "—"}</TableCell>
                  <TableCell>{contact.email ?? "—"}</TableCell>
                  <TableCell>{new Date(contact.createdAt).toLocaleDateString(intlLocale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {hasNextPage && (
          <Button variant="ghost" className="mt-2" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? translateText("Loading...") : translateText("Load more")}
          </Button>
        )}
      </div>
    </div>
  );
}
