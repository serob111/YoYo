import type { ListingExtraction } from "./listing-extraction";

// Deterministic candidate grouping - no AI/embedding similarity involved, per
// the product requirement that low-confidence groups are never silently
// merged. Two items are connected (end up in the same candidate) if either:
//   1. Strong: identical normalized externalListingReference (an agent
//      explicitly tagged these posts as the same listing).
//   2. Medium: identical normalized (transactionType, propertyType, country,
//      city, district, bedrooms) + price within PRICE_TOLERANCE of each other.
// Connectivity is transitive via union-find, not just pairwise within one
// signal type - e.g. two posts sharing a reference plus a third post with no
// reference but matching their composite key all end up in one candidate.
// Anything left unconnected becomes its own single-item candidate -
// including genuinely ambiguous items that don't share either signal with
// anything else, which is deliberate: a human reviews those rather than the
// algorithm guessing.

export interface GroupableItem {
  id: string;
  extraction: ListingExtraction;
}

export interface ListingGroup {
  itemIds: string[];
  confidence: number;
  merged: ListingExtraction;
}

const PRICE_TOLERANCE = 0.05; // 5%

function norm(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function referenceKey(item: GroupableItem): string | null {
  const ref = norm(item.extraction.externalListingReference);
  return ref ? `ref:${ref}` : null;
}

function compositeKey(item: GroupableItem): string | null {
  const e = item.extraction;
  const city = norm(e.city);
  // City is the minimum bar for attempting a composite match - without it,
  // price/bedroom coincidences are too weak a signal on their own.
  if (!city || !e.transactionType || !e.propertyType) return null;
  return ["c", e.transactionType, e.propertyType, norm(e.country) ?? "", city, norm(e.district) ?? "", e.bedrooms ?? "?"].join("|");
}

function pricesCompatible(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return true; // missing price on either side doesn't block a composite-key match
  if (a === 0 || b === 0) return a === b;
  return Math.abs(a - b) / Math.max(a, b) <= PRICE_TOLERANCE;
}

function mergeExtractions(items: GroupableItem[]): ListingExtraction {
  // Prefer the most complete/highest-confidence item's scalar fields; union signals.
  const best = [...items].sort((a, b) => b.extraction.confidence - a.extraction.confidence)[0]!.extraction;
  const signals = Array.from(new Set(items.flatMap((i) => i.extraction.signals)));
  return { ...best, signals };
}

function groupConfidence(items: GroupableItem[], groupedByReference: boolean): number {
  const avg = items.reduce((sum, i) => sum + i.extraction.confidence, 0) / items.length;
  let confidence = avg;
  if (groupedByReference) confidence = Math.min(1, confidence + 0.15);
  else if (items.length > 1) confidence = Math.min(1, confidence + 0.05);
  const merged = mergeExtractions(items);
  if (merged.price == null || merged.bedrooms == null) confidence = Math.max(0, confidence - 0.1);
  return Math.round(confidence * 100) / 100;
}

class UnionFind {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

export function groupListings(items: GroupableItem[]): ListingGroup[] {
  const propertyRelated = items.filter((i) => i.extraction.isPropertyRelated);
  const uf = new UnionFind();
  for (const item of propertyRelated) uf.find(item.id); // ensure every item has a component even if isolated

  const byReference = new Map<string, GroupableItem[]>();
  const byComposite = new Map<string, GroupableItem[]>();
  const referencedIds = new Set<string>();
  for (const item of propertyRelated) {
    const ref = referenceKey(item);
    if (ref) {
      referencedIds.add(item.id);
      (byReference.get(ref) ?? byReference.set(ref, []).get(ref)!).push(item);
    }
    const composite = compositeKey(item);
    if (composite) {
      (byComposite.get(composite) ?? byComposite.set(composite, []).get(composite)!).push(item);
    }
  }

  for (const bucket of byReference.values()) {
    for (let i = 1; i < bucket.length; i++) uf.union(bucket[0]!.id, bucket[i]!.id);
  }
  for (const bucket of byComposite.values()) {
    // Price-compatibility sub-grouping within a composite bucket - same
    // city/beds/type but a wildly different price is more likely two
    // different units than one listing, so don't force-union those.
    const priceGroups: GroupableItem[][] = [];
    for (const item of bucket) {
      const target = priceGroups.find((g) => pricesCompatible(g[0]!.extraction.price, item.extraction.price));
      if (target) target.push(item);
      else priceGroups.push([item]);
    }
    for (const group of priceGroups) {
      for (let i = 1; i < group.length; i++) uf.union(group[0]!.id, group[i]!.id);
    }
  }

  const components = new Map<string, GroupableItem[]>();
  for (const item of propertyRelated) {
    const root = uf.find(item.id);
    (components.get(root) ?? components.set(root, []).get(root)!).push(item);
  }

  return Array.from(components.values()).map((group) => ({
    itemIds: group.map((i) => i.id),
    confidence: groupConfidence(group, group.some((i) => referencedIds.has(i.id)) && group.length > 1),
    merged: mergeExtractions(group)
  }));
}
