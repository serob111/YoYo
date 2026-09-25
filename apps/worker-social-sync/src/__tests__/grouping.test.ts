import { describe, expect, it } from "vitest";
import type { ListingExtraction } from "../listing-extraction";
import { groupListings, type GroupableItem } from "../grouping";

function extraction(overrides: Partial<ListingExtraction>): ListingExtraction {
  return {
    isPropertyRelated: true,
    confidence: 0.8,
    transactionType: "SALE",
    propertyType: "APARTMENT",
    title: "Listing",
    description: null,
    price: null,
    currency: null,
    bedrooms: null,
    bathrooms: null,
    areaSqm: null,
    country: null,
    city: null,
    district: null,
    address: null,
    externalListingReference: null,
    availabilityHint: null,
    signals: [],
    ...overrides
  };
}

// Mirrors the fake Graph stub's seeded dataset (scripts/fake-graph-stub.js):
// Dubai Marina x3 (2 share a reference, 1 relies on the composite signal),
// Palm Jumeirah x2, Marbella x2, Limassol x1, 2 ambiguous sparse posts, plus
// non-property items that must never appear as isPropertyRelated: true.
describe("groupListings", () => {
  it("groups items sharing an externalListingReference into one high-confidence candidate", () => {
    const items: GroupableItem[] = [
      { id: "a1", extraction: extraction({ title: "Dubai Marina Apartment", city: "Dubai", district: "Dubai Marina", bedrooms: 3, price: 1850000, currency: "AED", externalListingReference: "DM-1029", confidence: 0.9 }) },
      { id: "a2", extraction: extraction({ title: "Dubai Marina Apartment", city: "Dubai", district: "Dubai Marina", bedrooms: 3, price: 1850000, currency: "AED", externalListingReference: "DM-1029", confidence: 0.85 }) },
      { id: "a3", extraction: extraction({ title: "Dubai Marina 3BR", city: "Dubai", district: "Dubai Marina", bedrooms: 3, price: 1850000, currency: "AED", confidence: 0.7 }) }
    ];
    const groups = groupListings(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.itemIds.sort()).toEqual(["a1", "a2", "a3"]);
    expect(groups[0]!.confidence).toBeGreaterThan(0.9);
  });

  it("groups same city/type/bedrooms/price-tolerant items via the composite signal even with no reference", () => {
    const items: GroupableItem[] = [
      { id: "b1", extraction: extraction({ title: "Palm Jumeirah Villa", propertyType: "HOUSE", city: "Dubai", district: null, bedrooms: 5, price: 12500000, currency: "AED", confidence: 0.85 }) },
      { id: "b2", extraction: extraction({ title: "Palm Jumeirah Villa", propertyType: "HOUSE", city: "Dubai", district: null, bedrooms: 5, price: 12500000, currency: "AED", confidence: 0.8 }) }
    ];
    const groups = groupListings(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.itemIds.sort()).toEqual(["b1", "b2"]);
  });

  it("does not merge two items with the same city/type but a materially different price", () => {
    const items: GroupableItem[] = [
      { id: "c1", extraction: extraction({ title: "Marbella Villa", propertyType: "HOUSE", city: "Marbella", bedrooms: 4, price: 850000, currency: "EUR", confidence: 0.8 }) },
      { id: "c2", extraction: extraction({ title: "Different Marbella Villa", propertyType: "HOUSE", city: "Marbella", bedrooms: 4, price: 2000000, currency: "EUR", confidence: 0.8 }) }
    ];
    const groups = groupListings(items);
    expect(groups).toHaveLength(2);
  });

  it("gives a single-post listing its own candidate", () => {
    const items: GroupableItem[] = [{ id: "d1", extraction: extraction({ title: "Limassol Apartment", city: "Limassol", bedrooms: 2, price: 470000, currency: "EUR", confidence: 0.75 }) }];
    const groups = groupListings(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.itemIds).toEqual(["d1"]);
  });

  it("never merges two ambiguous, sparse posts - each becomes its own lower-confidence candidate", () => {
    const items: GroupableItem[] = [
      { id: "e1", extraction: extraction({ title: "Apartment available", city: null, district: null, bedrooms: null, price: null, confidence: 0.3 }) },
      { id: "e2", extraction: extraction({ title: "Another apartment", city: null, district: null, bedrooms: null, price: null, confidence: 0.3 }) }
    ];
    const groups = groupListings(items);
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.confidence).toBeLessThan(0.5);
    }
  });

  it("excludes non-property-related items entirely", () => {
    const items: GroupableItem[] = [
      { id: "f1", extraction: extraction({ isPropertyRelated: false, confidence: 0.05, title: null, city: null }) },
      { id: "f2", extraction: extraction({ title: "Real listing", city: "Dubai", bedrooms: 2, price: 1000000, currency: "AED", confidence: 0.8 }) }
    ];
    const groups = groupListings(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.itemIds).toEqual(["f2"]);
  });
});
