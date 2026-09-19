"use client";

import { Buildings, House, Storefront, Tree } from "@phosphor-icons/react";
import type { PropertyType } from "@yoyo/contracts";
import styles from "./storefront.module.css";

// Properties have no photo upload yet, so every card needs an honest
// placeholder rather than a stock photo standing in for a real listing -
// this generates a deterministic, type-tinted tile instead of pretending to
// be a photograph. See docs/architecture note in properties.service.ts.
const PROPERTY_ART: Record<PropertyType, { gradient: string; icon: typeof House }> = {
  APARTMENT: { gradient: "linear-gradient(135deg, #f4ead2, #e2cf9b)", icon: Buildings },
  HOUSE: { gradient: "linear-gradient(135deg, #eef4e9, #c9dcb8)", icon: House },
  COMMERCIAL: { gradient: "linear-gradient(135deg, #f3e3da, #e0b8a1)", icon: Storefront },
  LAND: { gradient: "linear-gradient(135deg, #eef0df, #c9d3a0)", icon: Tree }
};

export function PropertyArt({
  propertyType,
  className,
  height,
  children
}: {
  propertyType: PropertyType;
  className?: string;
  height?: number;
  children?: React.ReactNode;
}) {
  const art = PROPERTY_ART[propertyType];
  const Icon = art.icon;
  return (
    <div className={`${styles.art} ${className ?? ""}`} style={{ background: art.gradient, height }}>
      <span className={styles.artArch} style={{ width: 90, height: 90, right: -24, bottom: -24, background: "#fffdf7" }} />
      <Icon weight="light" color="#10151e" />
      {children}
    </div>
  );
}
