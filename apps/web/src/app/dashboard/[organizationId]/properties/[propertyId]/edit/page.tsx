"use client";

import { useI18n } from "@/lib/i18n/provider";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { UpsertPropertyInput } from "@yoyo/contracts";
import { useProperty, useUpdateProperty } from "@/lib/properties-hooks";
import { PropertyForm } from "@/components/property-form";
import { PropertyMediaManager } from "@/components/property-media-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function PropertyEditPage() {
  const { t: translateText } = useI18n();
  const params = useParams<{ organizationId: string; propertyId: string }>();
  const router = useRouter();
  const { organizationId, propertyId } = params;

  const { data: property, isLoading } = useProperty(organizationId, propertyId);
  const updateProperty = useUpdateProperty(organizationId, propertyId);

  function handleUpdate(input: UpsertPropertyInput) {
    updateProperty.mutate(input, { onSuccess: () => router.push(`/dashboard/${organizationId}/properties/${propertyId}`) });
  }

  if (isLoading || !property) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/dashboard/${organizationId}/properties/${propertyId}`} className="text-sm text-muted-foreground hover:underline">
         {translateText("← Back to property")} </Link>

      <h1 className="mt-2 text-xl font-semibold">{translateText("Edit property")}</h1>

      <div className="mt-6">
        <PropertyForm property={property} onSubmit={handleUpdate} submitLabel={translateText("Save")} isPending={updateProperty.isPending} />
      </div>

      <Separator className="my-6" />

      <PropertyMediaManager organizationId={organizationId} propertyId={propertyId} />

      <Separator className="my-6" />

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">{translateText("Publishing")}</h3>
        <p className="text-sm text-muted-foreground">
          {translateText("Publishing this property to Instagram or TikTok is coming soon - use the Publish button on the property page.")}
        </p>
      </section>
    </div>
  );
}
