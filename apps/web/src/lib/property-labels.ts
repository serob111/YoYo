import type { PropertyStatus, PropertyType, PropertyVisibility, TransactionType } from "@yoyo/contracts";

// Friendly, user-facing labels for every Property-related enum. Call sites
// pass the result through translateText(...) same as any other string -
// these are English source strings, not pre-translated text.
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: "Apartment",
  HOUSE: "House",
  COMMERCIAL: "Commercial",
  LAND: "Land"
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  UNDER_OFFER: "Under offer",
  SOLD: "Sold",
  RENTED: "Rented",
  ARCHIVED: "Archived"
};

export const PROPERTY_VISIBILITY_LABELS: Record<PropertyVisibility, string> = {
  PRIVATE: "Private",
  ORGANIZATION_STOREFRONT: "Agency website",
  MARKETPLACE: "Marketplace (not available)"
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  SALE: "For sale",
  RENT: "For rent"
};

export const PROPERTY_MEDIA_KIND_LABELS = {
  IMAGE: "Photo",
  VIDEO: "Video",
  FLOORPLAN: "Floor plan",
  OTHER: "Other"
} as const;

export const PROPERTY_MEDIA_SOURCE_LABELS = {
  MANUAL: "Uploaded",
  INSTAGRAM: "From Instagram",
  TIKTOK: "From TikTok"
} as const;
