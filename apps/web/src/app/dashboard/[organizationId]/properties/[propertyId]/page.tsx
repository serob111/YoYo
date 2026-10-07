"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { CreateViewingInput } from "@yoyo/contracts";
import { useOrganization } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { useDeleteProperty, useLinkLeadToProperty, useProperty, usePropertyMedia, useUnlinkLeadFromProperty } from "@/lib/properties-hooks";
import { useCreateViewing, useUpdateViewingStatus, useViewings } from "@/lib/viewings-hooks";
import { useContentItems } from "@/lib/content-hooks";
import { formatCents, formatPrice, formatPropertyLocation } from "@/lib/format";
import { PROPERTY_TYPE_LABELS, PROPERTY_VISIBILITY_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/property-labels";
import { PropertyStatusBadge } from "@/components/property-status-badge";
import { PropertyMediaManager, PropertyMediaThumbnail } from "@/components/property-media-manager";
import { PropertySocialTab } from "@/components/property-social-tab";
import { PropertyActivityTab } from "@/components/property-activity-tab";
import { PropertyPublishDialog } from "@/components/property-publish-dialog";
import { LeadPicker, type PickedLead } from "@/components/lead-picker";
import { ViewingForm } from "@/components/viewing-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MoreHorizontalIcon } from "lucide-react";

const VIEWING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;

function Field({ label, value }: { label: string; value: string }) {
  const { t: translateText } = useI18n();
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{translateText(label)}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default function PropertyDetailPage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const params = useParams<{ organizationId: string; propertyId: string }>();
  const router = useRouter();
  const { organizationId, propertyId } = params;
  const { data: organization } = useOrganization(organizationId);
  const canManage = useCan(organization?.myRole, "manageCRM");

  const [deleting, setDeleting] = useState(false);
  const { data: property, isLoading } = useProperty(organizationId, propertyId, !deleting);
  const deleteProperty = useDeleteProperty(organizationId);
  const linkLead = useLinkLeadToProperty(organizationId, propertyId);
  const unlinkLead = useUnlinkLeadFromProperty(organizationId, propertyId);
  const { data: viewings } = useViewings(organizationId, { propertyId });
  const { data: media } = usePropertyMedia(organizationId, propertyId);
  const { data: contentItems } = useContentItems(organizationId, { propertyId });
  const createViewing = useCreateViewing(organizationId);
  const updateViewingStatus = useUpdateViewingStatus(organizationId);

  const [activeTab, setActiveTab] = useState("overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [linkPick, setLinkPick] = useState<PickedLead | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  function handleDelete() {
    // Disable useProperty before the mutation resolves - the list invalidation
    // it triggers on success prefix-matches this row's own detail query, which
    // would otherwise refetch (and 404) a resource that's mid-deletion/gone.
    setDeleting(true);
    deleteProperty.mutate(propertyId, {
      onSuccess: () => router.push(`/dashboard/${organizationId}/properties`),
      onError: () => setDeleting(false)
    });
  }

  function handleLinkLead() {
    if (!linkPick) return;
    linkLead.mutate(linkPick.id, { onSuccess: () => setLinkPick(null) });
  }

  function handleScheduleViewing(input: CreateViewingInput) {
    createViewing.mutate(input, { onSuccess: () => setScheduleOpen(false) });
  }

  if (isLoading || !property) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const cover = media?.find((item) => item.isCover) ?? media?.[0];
  const summaryParts = [
    property.areaSqm != null ? `${property.areaSqm} m²` : null,
    property.bedrooms != null ? `${property.bedrooms} ${translateText("bed")}` : null,
    property.bathrooms != null ? `${property.bathrooms} ${translateText("bath")}` : null
  ].filter((part): part is string => part != null);

  return (
    <div className="max-w-4xl">
      <Link href={`/dashboard/${organizationId}/properties`} className="text-sm text-muted-foreground hover:underline">
         {translateText("← Properties")} </Link>

      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted sm:h-28 sm:w-28">
            {cover ? <PropertyMediaThumbnail organizationId={organizationId} media={cover} /> : null}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{property.title}</h1>
              <PropertyStatusBadge status={property.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{formatPropertyLocation(property)}</p>
            <p className="mt-1 text-lg font-semibold">{formatPrice(property.priceCents, property.currency, property.transactionType, property.rentBillingPeriod, locale)}</p>
            {summaryParts.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{summaryParts.join(" · ")}</p>}
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/${organizationId}/properties/${propertyId}/edit`} />}>
              {translateText("Edit")}
            </Button>
            <Button variant="outline" onClick={() => setActiveTab("media")}>
              {translateText("Add media")}
            </Button>
            <Button variant="outline" onClick={() => setPublishOpen(true)}>
              {translateText("Publish")}
            </Button>
            <PropertyPublishDialog open={publishOpen} onOpenChange={setPublishOpen} organizationId={organizationId} property={property} />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
                <MoreHorizontalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  {translateText("Delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{translateText("Delete")} {property.title}?</DialogTitle>
                  <DialogDescription>{translateText("This can't be undone.")}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                     {translateText("Cancel")} </Button>
                  <Button variant="destructive" disabled={deleteProperty.isPending} onClick={handleDelete}>
                     {translateText("Delete")} </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => v && setActiveTab(v)} className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">{translateText("Overview")}</TabsTrigger>
          <TabsTrigger value="media">{translateText("Media")}</TabsTrigger>
          <TabsTrigger value="leads">{translateText("Leads")}</TabsTrigger>
          <TabsTrigger value="viewings">{translateText("Viewings")}</TabsTrigger>
          <TabsTrigger value="social">{translateText("Social")}</TabsTrigger>
          <TabsTrigger value="activity">{translateText("Activity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {property.description && <p className="mb-4 text-sm text-muted-foreground">{property.description}</p>}
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label={translateText("Transaction")} value={translateText(TRANSACTION_TYPE_LABELS[property.transactionType])} />
            <Field label={translateText("Price")} value={formatPrice(property.priceCents, property.currency, property.transactionType, property.rentBillingPeriod, locale)} />
            <Field label={translateText("Visibility")} value={translateText(PROPERTY_VISIBILITY_LABELS[property.visibility])} />
            <Field label={translateText("Type")} value={translateText(PROPERTY_TYPE_LABELS[property.propertyType])} />
            <Field label={translateText("Country")} value={property.country ?? "—"} />
            <Field label={translateText("City")} value={property.city ?? "—"} />
            <Field label={translateText("District")} value={property.district ?? "—"} />
            <Field label={translateText("Address")} value={property.address ?? "—"} />
            <Field label={translateText("Bedrooms")} value={property.bedrooms != null ? String(property.bedrooms) : "—"} />
            <Field label={translateText("Bathrooms")} value={property.bathrooms != null ? String(property.bathrooms) : "—"} />
            <Field label={translateText("Area")} value={property.areaSqm != null ? `${property.areaSqm} m²` : "—"} />
            <Field label={translateText("Floor")} value={property.floor != null ? String(property.floor) : "—"} />
            <Field label={translateText("Total floors")} value={property.totalFloors != null ? String(property.totalFloors) : "—"} />
            <Field label={translateText("Condition")} value={property.condition ?? "—"} />
            <Field label={translateText("Building type")} value={property.buildingType ?? "—"} />
            {property.transactionType === "RENT" && (
              <>
                <Field label={translateText("Deposit")} value={formatCents(property.depositCents, property.currency, locale)} />
                <Field label={translateText("Min. rental period")} value={property.minRentalPeriodDays != null ? `${property.minRentalPeriodDays} days` : "—"} />
                <Field label={translateText("Available from")} value={property.availableFrom ? new Date(property.availableFrom).toLocaleDateString(intlLocale) : "—"} />
              </>
            )}
          </dl>
        </TabsContent>

        <TabsContent value="media">
          <PropertyMediaManager organizationId={organizationId} propertyId={propertyId} />
        </TabsContent>

        <TabsContent value="leads">
          <div className="flex flex-col gap-2">
            {property.leads.length === 0 && <p className="text-sm text-muted-foreground">{translateText("No leads linked yet.")}</p>}
            {property.leads.map(({ lead }) => (
              <div key={lead.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <Link href={`/dashboard/${organizationId}/leads/${lead.id}`} className="hover:underline">
                  {lead.title}
                </Link>
                {canManage && (
                  <Button variant="ghost" size="sm" disabled={unlinkLead.isPending} onClick={() => unlinkLead.mutate(lead.id)}>
                     {translateText("Unlink")} </Button>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-64">
                <LeadPicker organizationId={organizationId} selected={linkPick} onSelect={setLinkPick} />
              </div>
              <Button size="sm" variant="outline" disabled={!linkPick || linkLead.isPending} onClick={handleLinkLead}>
                 {translateText("Link")} </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="viewings">
          <div className="flex items-center justify-end">
            {canManage && (
              <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                <DialogTrigger render={<Button size="sm" variant="outline" />}>{translateText("Schedule viewing")}</DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{translateText("Schedule a viewing")}</DialogTitle>
                  </DialogHeader>
                  <ViewingForm
                    organizationId={organizationId}
                    fixedProperty={{ id: property.id, title: property.title }}
                    onSubmit={handleScheduleViewing}
                    isPending={createViewing.isPending}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {(!viewings || viewings.length === 0) && <p className="text-sm text-muted-foreground">{translateText("No viewings scheduled.")}</p>}
            {viewings?.map((viewing) => (
              <div key={viewing.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <div>{viewing.leadTitle}</div>
                  <div className="text-xs text-muted-foreground">{new Date(viewing.scheduledFor).toLocaleString(intlLocale)}</div>
                </div>
                {canManage ? (
                  <Select value={viewing.status} onValueChange={(v) => v && updateViewingStatus.mutate({ viewingId: viewing.id, status: v as (typeof VIEWING_STATUSES)[number] })}>
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIEWING_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {translateText(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge>{translateText(viewing.status)}</Badge>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="social">
          <PropertySocialTab organizationId={organizationId} propertyId={propertyId} />
        </TabsContent>

        <TabsContent value="activity">
          <PropertyActivityTab property={property} viewings={viewings ?? []} contentItems={contentItems ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
