"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import type { PropertyDto, UpsertPropertyInput } from "@yoyo/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "COMMERCIAL", "LAND"] as const;
const PROPERTY_STATUSES = ["DRAFT", "ACTIVE", "UNDER_OFFER", "SOLD", "RENTED", "ARCHIVED"] as const;
const PROPERTY_VISIBILITIES = ["PRIVATE", "ORGANIZATION_STOREFRONT", "MARKETPLACE"] as const;
const TRANSACTION_TYPES = ["SALE", "RENT"] as const;
const RENT_BILLING_PERIODS = ["DAY", "WEEK", "MONTH"] as const;

const VISIBILITY_LABELS: Record<(typeof PROPERTY_VISIBILITIES)[number], string> = {
  PRIVATE: "Private",
  ORGANIZATION_STOREFRONT: "Organization storefront",
  MARKETPLACE: "Marketplace (not available)"
};

const TRANSACTION_TYPE_LABELS: Record<(typeof TRANSACTION_TYPES)[number], string> = {
  SALE: "For sale",
  RENT: "For rent"
};

interface PropertyFormValues {
  title: string;
  description: string;
  propertyType: (typeof PROPERTY_TYPES)[number];
  status: (typeof PROPERTY_STATUSES)[number];
  visibility: (typeof PROPERTY_VISIBILITIES)[number];
  transactionType: (typeof TRANSACTION_TYPES)[number];
  price: string;
  currency: string;
  rentBillingPeriod: (typeof RENT_BILLING_PERIODS)[number];
  deposit: string;
  minRentalPeriodDays: string;
  availableFrom: string;
  country: string;
  district: string;
  city: string;
  address: string;
  bedrooms: string;
  bathrooms: string;
  areaSqm: string;
  floor: string;
  totalFloors: string;
  condition: string;
  buildingType: string;
}

function toFormValues(property?: PropertyDto): PropertyFormValues {
  return {
    title: property?.title ?? "",
    description: property?.description ?? "",
    propertyType: property?.propertyType ?? "APARTMENT",
    status: property?.status ?? "DRAFT",
    visibility: property?.visibility ?? "PRIVATE",
    transactionType: property?.transactionType ?? "SALE",
    price: property?.priceCents != null ? String(property.priceCents / 100) : "",
    currency: property?.currency ?? "USD",
    rentBillingPeriod: property?.rentBillingPeriod ?? "MONTH",
    deposit: property?.depositCents != null ? String(property.depositCents / 100) : "",
    minRentalPeriodDays: property?.minRentalPeriodDays != null ? String(property.minRentalPeriodDays) : "",
    availableFrom: property?.availableFrom ? property.availableFrom.slice(0, 10) : "",
    country: property?.country ?? "",
    district: property?.district ?? "",
    city: property?.city ?? "",
    address: property?.address ?? "",
    bedrooms: property?.bedrooms != null ? String(property.bedrooms) : "",
    bathrooms: property?.bathrooms != null ? String(property.bathrooms) : "",
    areaSqm: property?.areaSqm != null ? String(property.areaSqm) : "",
    floor: property?.floor != null ? String(property.floor) : "",
    totalFloors: property?.totalFloors != null ? String(property.totalFloors) : "",
    condition: property?.condition ?? "",
    buildingType: property?.buildingType ?? ""
  };
}

function toUpsertInput(values: PropertyFormValues): UpsertPropertyInput {
  const int = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));
  const float = (s: string) => (s.trim() === "" ? null : parseFloat(s));
  const isRent = values.transactionType === "RENT";
  return {
    title: values.title,
    description: values.description.trim() === "" ? null : values.description,
    propertyType: values.propertyType,
    status: values.status,
    visibility: values.visibility,
    transactionType: values.transactionType,
    priceCents: values.price.trim() === "" ? null : Math.round(parseFloat(values.price) * 100),
    currency: values.currency || "USD",
    rentBillingPeriod: isRent ? values.rentBillingPeriod : null,
    depositCents: isRent && values.deposit.trim() !== "" ? Math.round(parseFloat(values.deposit) * 100) : null,
    minRentalPeriodDays: isRent ? int(values.minRentalPeriodDays) : null,
    availableFrom: isRent && values.availableFrom.trim() !== "" ? new Date(values.availableFrom).toISOString() : null,
    country: values.country.trim() === "" ? null : values.country,
    district: values.district.trim() === "" ? null : values.district,
    city: values.city.trim() === "" ? null : values.city,
    address: values.address.trim() === "" ? null : values.address,
    bedrooms: int(values.bedrooms),
    bathrooms: int(values.bathrooms),
    areaSqm: float(values.areaSqm),
    floor: int(values.floor),
    totalFloors: int(values.totalFloors),
    condition: values.condition.trim() === "" ? null : values.condition,
    buildingType: values.buildingType.trim() === "" ? null : values.buildingType
  };
}

export function PropertyForm({
  property,
  onSubmit,
  submitLabel,
  isPending
}: {
  property?: PropertyDto;
  onSubmit: (input: UpsertPropertyInput) => void;
  submitLabel: string;
  isPending: boolean;
}) {
  const { t: translateText } = useI18n();
  const [values, setValues] = useState<PropertyFormValues>(() => toFormValues(property));

  function set<K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(toUpsertInput(values));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">
           {translateText("Title")} <Input required value={values.title} onChange={(e) => set("title", e.target.value)} />
        </label>

        <label className="grid gap-1 text-sm font-medium">
           {translateText("Description")} <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} />
        </label>

        <div className="grid grid-cols-4 gap-3">
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Transaction")} <Select value={values.transactionType} onValueChange={(v) => v && set("transactionType", v as PropertyFormValues["transactionType"])}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {translateText(TRANSACTION_TYPE_LABELS[type])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Type")} <Select value={values.propertyType} onValueChange={(v) => set("propertyType", v as PropertyFormValues["propertyType"])}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {translateText(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Status")} <Select value={values.status} onValueChange={(v) => set("status", v as PropertyFormValues["status"])}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {translateText(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Visibility")} <Select value={values.visibility} onValueChange={(v) => set("visibility", v as PropertyFormValues["visibility"])}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_VISIBILITIES.map((visibility) => (
                  <SelectItem key={visibility} value={visibility}>
                    {translateText(VISIBILITY_LABELS[visibility])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            {values.transactionType === "RENT" ? translateText("Rent") : translateText("Price")}
            <Input type="number" min="0" step="1" placeholder={translateText("e.g. 175000")} value={values.price} onChange={(e) => set("price", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Currency")} <Input maxLength={3} value={values.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </label>
        </div>

        {values.transactionType === "RENT" && (
          <div className="grid grid-cols-4 gap-3">
            <label className="grid gap-1 text-sm font-medium">
               {translateText("Billing period")} <Select
                value={values.rentBillingPeriod}
                onValueChange={(v) => v && set("rentBillingPeriod", v as PropertyFormValues["rentBillingPeriod"])}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RENT_BILLING_PERIODS.map((period) => (
                    <SelectItem key={period} value={period}>
                      {translateText(period)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
               {translateText("Deposit")} <Input type="number" min="0" step="1" value={values.deposit} onChange={(e) => set("deposit", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
               {translateText("Min. rental (days)")} <Input type="number" min="0" value={values.minRentalPeriodDays} onChange={(e) => set("minRentalPeriodDays", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
               {translateText("Available from")} <Input type="date" value={values.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} />
            </label>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Country")} <Input placeholder={translateText("e.g. UAE")} value={values.country} onChange={(e) => set("country", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("City")} <Input value={values.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("District")} <Input value={values.district} onChange={(e) => set("district", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Address")} <Input value={values.address} onChange={(e) => set("address", e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Bedrooms")} <Input type="number" min="0" value={values.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Bathrooms")} <Input type="number" min="0" value={values.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Area (m²)")} <Input type="number" min="0" value={values.areaSqm} onChange={(e) => set("areaSqm", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Floor")} <Input type="number" value={values.floor} onChange={(e) => set("floor", e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Total floors")} <Input type="number" value={values.totalFloors} onChange={(e) => set("totalFloors", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Condition")} <Input placeholder={translateText("e.g. Renovated")} value={values.condition} onChange={(e) => set("condition", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
             {translateText("Building type")} <Input placeholder={translateText("e.g. Brick")} value={values.buildingType} onChange={(e) => set("buildingType", e.target.value)} />
          </label>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
