"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { InstagramLogo } from "@phosphor-icons/react";
import type { UpsertPropertyInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useCreateProperty, useProperties } from "@/lib/properties-hooks";
import { formatPrice } from "@/lib/format";
import { PropertyStatusBadge } from "@/components/property-status-badge";
import { PropertyForm } from "@/components/property-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function PropertiesPage() {
  const { t: translateText, locale } = useI18n();
  const params = useParams<{ organizationId: string }>();
  const organizationId = params.organizationId;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageCRM");

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useProperties(organizationId);
  const properties = data?.pages.flatMap((page) => page.items) ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const createProperty = useCreateProperty(organizationId);

  function handleCreate(input: UpsertPropertyInput) {
    createProperty.mutate(input, { onSuccess: () => setCreateOpen(false) });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{translateText("Properties")}</h1>
        <div className="flex items-center gap-2">
          {organization && (
            <Button variant="outline" nativeButton={false} render={<a href={`/storefront/${organization.slug}`} target="_blank" rel="noreferrer" />}>
               {translateText("View public storefront")} </Button>
          )}
          {canManage && (
            <Button variant="secondary" nativeButton={false} render={<Link href={`/dashboard/${organizationId}/properties/import`} />}>
              <InstagramLogo size={16} /> {translateText("Import from Instagram")}
            </Button>
          )}
          {canManage && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger render={<Button />}>{translateText("New property")}</DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{translateText("New property")}</DialogTitle>
                </DialogHeader>
                <PropertyForm onSubmit={handleCreate} submitLabel={translateText("Create")} isPending={createProperty.isPending} />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="mt-6">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {!isLoading && properties.length === 0 && <p className="text-sm text-muted-foreground">{translateText("No properties yet.")}</p>}

        {properties.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{translateText("Title")}</TableHead>
                <TableHead>{translateText("Transaction")}</TableHead>
                <TableHead>{translateText("Type")}</TableHead>
                <TableHead>{translateText("Status")}</TableHead>
                <TableHead>{translateText("Price")}</TableHead>
                <TableHead>{translateText("Bedrooms")}</TableHead>
                <TableHead>{translateText("Area")}</TableHead>
                <TableHead>{translateText("Location")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.map((property) => (
                <TableRow key={property.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/dashboard/${organizationId}/properties/${property.id}`} className="font-medium hover:underline">
                      {property.title}
                    </Link>
                  </TableCell>
                  <TableCell>{property.transactionType === "RENT" ? translateText("Rent") : translateText("Sale")}</TableCell>
                  <TableCell>{property.propertyType}</TableCell>
                  <TableCell>
                    <PropertyStatusBadge status={property.status} />
                  </TableCell>
                  <TableCell>{formatPrice(property.priceCents, property.currency, property.transactionType, property.rentBillingPeriod, locale)}</TableCell>
                  <TableCell>{property.bedrooms ?? "—"}</TableCell>
                  <TableCell>{property.areaSqm != null ? `${property.areaSqm} m²` : "—"}</TableCell>
                  <TableCell>{[property.district, property.city, property.country].filter(Boolean).join(", ") || "—"}</TableCell>
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
