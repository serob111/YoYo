"use client";

import { Buildings, House, Storefront, Tree } from "@phosphor-icons/react";
import type { PropertyType } from "@yoyo/contracts";
import { cn } from "@/lib/utils";

// Properties have no photo upload yet, so every card needs an honest
// placeholder rather than a stock photo standing in for a real listing -
// this generates a deterministic, type-tinted tile instead of pretending to
// be a photograph. Mirrors the storefront's own placeholder-art system,
// reimplemented with Tailwind here since the dashboard doesn't share the
// storefront's CSS module.
const PROPERTY_ART: Record<PropertyType, { gradient: string; icon: typeof House }> = {
  APARTMENT: { gradient: "linear-gradient(135deg, #f4ead2, #e2cf9b)", icon: Buildings },
  HOUSE: { gradient: "linear-gradient(135deg, #eef4e9, #c9dcb8)", icon: House },
  COMMERCIAL: { gradient: "linear-gradient(135deg, #f3e3da, #e0b8a1)", icon: Storefront },
  LAND: { gradient: "linear-gradient(135deg, #eef0df, #c9d3a0)", icon: Tree }
};

export function PropertyArt({ propertyType, className, children }: { propertyType: PropertyType; className?: string; children?: React.ReactNode }) {
  const art = PROPERTY_ART[propertyType];
  const Icon = art.icon;
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden", className)} style={{ background: art.gradient }}>
      <span className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-card/70" />
      <Icon size={44} weight="light" color="#111423" />
      {children}
    </div>
  );
}
