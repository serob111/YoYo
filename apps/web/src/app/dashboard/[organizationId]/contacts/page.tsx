"use client";

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
        <h1 className="text-xl font-semibold">Contacts</h1>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button />}>New contact</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New contact</DialogTitle>
              </DialogHeader>
              <ContactForm onSubmit={handleCreate} isPending={createContact.isPending} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative mt-4 w-64">
        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className="pl-8" />
      </div>

      <div className="mt-6">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && contacts.length === 0 && search && <p className="text-sm text-muted-foreground">No contacts match your search.</p>}
        {!isLoading && contacts.length === 0 && !search && (
          <EmptyState icon={UsersThree} title="No contacts yet" description="Contacts are created automatically from conversations, or use the “New contact” button above to add one." />
        )}

        {contacts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">{contact.displayName}</TableCell>
                  <TableCell>{contact.phone ?? "—"}</TableCell>
                  <TableCell>{contact.email ?? "—"}</TableCell>
                  <TableCell>{new Date(contact.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {hasNextPage && (
          <Button variant="ghost" className="mt-2" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>
    </div>
  );
}
