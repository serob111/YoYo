"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Bathtub, Bed, MapPin, Ruler } from "@phosphor-icons/react";
import type { PropertyType, Storefront, StorefrontProperty, TransactionType } from "@yoyo/contracts";
import { formatPrice } from "@/lib/format";
import { PropertyArt } from "./property-art";
import { BookingModal } from "./booking-modal";
import styles from "./storefront.module.css";

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: "Квартиры",
  HOUSE: "Дома",
  COMMERCIAL: "Коммерция",
  LAND: "Участки"
};

export function StorefrontClient({
  orgSlug,
  organization,
  initialProperties
}: {
  orgSlug: string;
  organization: Storefront["organization"];
  initialProperties: StorefrontProperty[];
}) {
  const [transactionFilter, setTransactionFilter] = useState<"ALL" | TransactionType>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | PropertyType>("ALL");
  const [active, setActive] = useState<StorefrontProperty | null>(null);

  const availableTypes = useMemo(
    () => Array.from(new Set(initialProperties.map((p) => p.propertyType))).sort(),
    [initialProperties]
  );
  const saleCount = useMemo(() => initialProperties.filter((p) => p.transactionType === "SALE").length, [initialProperties]);
  const rentCount = initialProperties.length - saleCount;

  const filtered = initialProperties.filter(
    (p) => (transactionFilter === "ALL" || p.transactionType === transactionFilter) && (typeFilter === "ALL" || p.propertyType === typeFilter)
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <span className={styles.agencyName}>{organization.name}</span>
          <span className={styles.agencyBadge}>
            <i />
            Объекты обновляются в реальном времени
          </span>
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.heroArch} aria-hidden />
        <p className={styles.eyebrow}>Публичная витрина объектов</p>
        <h1 className={styles.heroTitle}>{organization.name}</h1>
        {organization.description && <p className={styles.heroDescription}>{organization.description}</p>}
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <strong>{initialProperties.length}</strong>
            <span>Всего объектов</span>
          </div>
          <div className={styles.heroStat}>
            <strong>{saleCount}</strong>
            <span>Продажа</span>
          </div>
          <div className={styles.heroStat}>
            <strong>{rentCount}</strong>
            <span>Аренда</span>
          </div>
        </div>
      </section>

      <div className={styles.filterBar}>
        <div className={styles.filterRow}>
          <div className={styles.segment}>
            <button type="button" data-active={transactionFilter === "ALL"} onClick={() => setTransactionFilter("ALL")}>
              Все
            </button>
            <button type="button" data-active={transactionFilter === "SALE"} onClick={() => setTransactionFilter("SALE")}>
              Продажа
            </button>
            <button type="button" data-active={transactionFilter === "RENT"} onClick={() => setTransactionFilter("RENT")}>
              Аренда
            </button>
          </div>
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={styles.chip}
              data-active={typeFilter === type}
              onClick={() => setTypeFilter((current) => (current === type ? "ALL" : type))}
            >
              {PROPERTY_TYPE_LABELS[type]}
            </button>
          ))}
          <span className={styles.filterSpacer}>
            {filtered.length} из {initialProperties.length}
          </span>
        </div>
      </div>

      <section className={styles.gridSection}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <strong>Ничего не найдено</strong>
            Попробуйте изменить фильтры.
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((property) => (
              <PropertyCard key={property.id} property={property} onOpen={() => setActive(property)} />
            ))}
          </div>
        )}
      </section>

      <footer className={styles.footer}>
        Витрина работает на <a href="/">YoYo</a>
      </footer>

      {active && <BookingModal orgSlug={orgSlug} property={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function PropertyCard({ property, onOpen }: { property: StorefrontProperty; onOpen: () => void }) {
  const location = [property.district, property.city, property.country].filter(Boolean).join(", ");
  return (
    <article className={styles.card}>
      <button type="button" onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "contents" }}>
        <PropertyArt propertyType={property.propertyType}>
          <div className={styles.badgeRow}>
            <span className={styles.badge} data-tone={property.transactionType === "RENT" ? "rent" : "sale"}>
              {property.transactionType === "RENT" ? "Аренда" : "Продажа"}
            </span>
          </div>
        </PropertyArt>
        <div className={styles.cardBody}>
          <div className={styles.cardPrice}>{formatPrice(property.priceCents, property.currency, property.transactionType, property.rentBillingPeriod)}</div>
          <div className={styles.cardTitle}>{property.title}</div>
          <div className={styles.cardMeta}>
            {property.bedrooms != null && (
              <span>
                <Bed weight="bold" /> {property.bedrooms}
              </span>
            )}
            {property.bathrooms != null && (
              <span>
                <Bathtub weight="bold" /> {property.bathrooms}
              </span>
            )}
            {property.areaSqm != null && (
              <span>
                <Ruler weight="bold" /> {property.areaSqm} м²
              </span>
            )}
          </div>
          <div className={styles.cardFooter}>
            <span className={styles.cardLocation}>
              {location ? (
                <>
                  <MapPin weight="bold" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                  {location}
                </>
              ) : (
                " "
              )}
            </span>
            <span className={styles.cardCta}>
              Записаться <ArrowRight weight="bold" />
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}
