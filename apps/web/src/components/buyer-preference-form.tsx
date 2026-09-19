"use client";

import { useState, type FormEvent } from "react";
import type { BuyerPreferenceDto, TransactionType, UpsertBuyerPreferenceInput } from "@yoyo/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

const PROPERTY_TYPES = ["ANY", "APARTMENT", "HOUSE", "COMMERCIAL", "LAND"] as const;
const FINANCING_TYPES = ["ANY", "CASH", "MORTGAGE"] as const;
const PURCHASE_TIMEFRAMES = ["ANY", "IMMEDIATE", "WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "FLEXIBLE"] as const;

interface BuyerPreferenceFormValues {
  minPrice: string;
  maxPrice: string;
  currency: string;
  minAreaSqm: string;
  bedrooms: string;
  country: string;
  city: string;
  districts: string;
  propertyType: (typeof PROPERTY_TYPES)[number];
  furnished: boolean | null;
  moveInDate: string;
  leaseDurationMonths: string;
  hasPets: boolean | null;
  occupantCount: string;
  financingType: (typeof FINANCING_TYPES)[number];
  purchaseTimeframe: (typeof PURCHASE_TIMEFRAMES)[number];
  notes: string;
}

function toFormValues(preference?: BuyerPreferenceDto | null): BuyerPreferenceFormValues {
  return {
    minPrice: preference?.minPriceCents != null ? String(preference.minPriceCents / 100) : "",
    maxPrice: preference?.maxPriceCents != null ? String(preference.maxPriceCents / 100) : "",
    currency: preference?.currency ?? "USD",
    minAreaSqm: preference?.minAreaSqm != null ? String(preference.minAreaSqm) : "",
    bedrooms: preference?.bedrooms != null ? String(preference.bedrooms) : "",
    country: preference?.country ?? "",
    city: preference?.city ?? "",
    districts: preference?.districts.join(", ") ?? "",
    propertyType: preference?.propertyType ?? "ANY",
    furnished: preference?.furnished ?? null,
    moveInDate: preference?.moveInDate ? preference.moveInDate.slice(0, 10) : "",
    leaseDurationMonths: preference?.leaseDurationMonths != null ? String(preference.leaseDurationMonths) : "",
    hasPets: preference?.hasPets ?? null,
    occupantCount: preference?.occupantCount != null ? String(preference.occupantCount) : "",
    financingType: preference?.financingType ?? "ANY",
    purchaseTimeframe: preference?.purchaseTimeframe ?? "ANY",
    notes: preference?.notes ?? ""
  };
}

function toUpsertInput(values: BuyerPreferenceFormValues, transactionType: TransactionType): UpsertBuyerPreferenceInput {
  const int = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));
  const float = (s: string) => (s.trim() === "" ? null : parseFloat(s));
  const isRent = transactionType === "RENT";
  return {
    transactionType,
    minPriceCents: values.minPrice.trim() === "" ? null : Math.round(parseFloat(values.minPrice) * 100),
    maxPriceCents: values.maxPrice.trim() === "" ? null : Math.round(parseFloat(values.maxPrice) * 100),
    currency: values.currency || "USD",
    minAreaSqm: float(values.minAreaSqm),
    bedrooms: int(values.bedrooms),
    country: values.country.trim() === "" ? null : values.country,
    city: values.city.trim() === "" ? null : values.city,
    districts: values.districts
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
    propertyType: values.propertyType === "ANY" ? null : values.propertyType,
    furnished: isRent ? values.furnished : null,
    moveInDate: isRent && values.moveInDate.trim() !== "" ? new Date(values.moveInDate).toISOString() : null,
    leaseDurationMonths: isRent ? int(values.leaseDurationMonths) : null,
    hasPets: isRent ? values.hasPets : null,
    occupantCount: isRent ? int(values.occupantCount) : null,
    financingType: !isRent && values.financingType !== "ANY" ? values.financingType : null,
    purchaseTimeframe: !isRent && values.purchaseTimeframe !== "ANY" ? values.purchaseTimeframe : null,
    notes: values.notes.trim() === "" ? null : values.notes
  };
}

export function BuyerPreferenceForm({
  transactionType,
  preference,
  onSubmit,
  isPending
}: {
  transactionType: TransactionType;
  preference?: BuyerPreferenceDto | null;
  onSubmit: (input: UpsertBuyerPreferenceInput) => void;
  isPending: boolean;
}) {
  const [values, setValues] = useState<BuyerPreferenceFormValues>(() => toFormValues(preference));
  const isRent = transactionType === "RENT";

  function set<K extends keyof BuyerPreferenceFormValues>(key: K, value: BuyerPreferenceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit(toUpsertInput(values, transactionType));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Min {isRent ? "rent" : "price"}
            <Input type="number" min="0" value={values.minPrice} onChange={(e) => set("minPrice", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Max {isRent ? "rent" : "price"}
            <Input type="number" min="0" value={values.maxPrice} onChange={(e) => set("maxPrice", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Currency
            <Input maxLength={3} value={values.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Property type
            <Select value={values.propertyType} onValueChange={(v) => v && set("propertyType", v as BuyerPreferenceFormValues["propertyType"])}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "ANY" ? "Any" : type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Min. area (m&sup2;)
            <Input type="number" min="0" value={values.minAreaSqm} onChange={(e) => set("minAreaSqm", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Bedrooms
            <Input type="number" min="0" value={values.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Country
            <Input placeholder="e.g. UAE" value={values.country} onChange={(e) => set("country", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            City
            <Input value={values.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Districts
            <Input placeholder="Comma-separated" value={values.districts} onChange={(e) => set("districts", e.target.value)} />
          </label>
        </div>

        {isRent ? (
          <div className="grid grid-cols-4 gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Furnished
              <Select
                value={values.furnished == null ? "ANY" : values.furnished ? "YES" : "NO"}
                onValueChange={(v) => set("furnished", v === "ANY" ? null : v === "YES")}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Move-in date
              <Input type="date" value={values.moveInDate} onChange={(e) => set("moveInDate", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Lease (months)
              <Input type="number" min="0" value={values.leaseDurationMonths} onChange={(e) => set("leaseDurationMonths", e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Has pets
              <Select
                value={values.hasPets == null ? "ANY" : values.hasPets ? "YES" : "NO"}
                onValueChange={(v) => set("hasPets", v === "ANY" ? null : v === "YES")}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Financing
              <Select value={values.financingType} onValueChange={(v) => v && set("financingType", v as BuyerPreferenceFormValues["financingType"])}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINANCING_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "ANY" ? "Any" : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Purchase timeframe
              <Select
                value={values.purchaseTimeframe}
                onValueChange={(v) => v && set("purchaseTimeframe", v as BuyerPreferenceFormValues["purchaseTimeframe"])}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURCHASE_TIMEFRAMES.map((timeframe) => (
                    <SelectItem key={timeframe} value={timeframe}>
                      {timeframe === "ANY" ? "Any" : timeframe.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        )}

        <label className="grid gap-1 text-sm font-medium">
          Notes
          <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
