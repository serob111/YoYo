import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
import type { Storefront } from "@yoyo/contracts";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import { StorefrontClient } from "./storefront-client";

async function loadStorefront(orgSlug: string): Promise<Storefront> {
  try {
    return await apiRequest<Storefront>(`/storefront/${orgSlug}`, { cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: { params: { orgSlug: string } }): Promise<Metadata> {
  const { t } = getI18n();
  try {
    const storefront = await apiRequest<Storefront>(`/storefront/${params.orgSlug}`, { cache: "no-store" });
    return {
      title: `${storefront.organization.name} — ${t("Listings")}`,
      description: storefront.organization.description ?? t("Browse available properties and book a viewing.")
    };
  } catch {
    return { title: t("Listings") };
  }
}

export default async function StorefrontPage({ params }: { params: { orgSlug: string } }) {
  const storefront = await loadStorefront(params.orgSlug);
  return <StorefrontClient orgSlug={params.orgSlug} organization={storefront.organization} initialProperties={storefront.properties} />;
}
