"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bathtub, Bed, CheckCircle, Clock, Ruler, WarningCircle, X } from "@phosphor-icons/react";
import type { BookViewingResult, StorefrontAvailability, StorefrontProperty } from "@yoyo/contracts";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import { formatCents, formatPrice } from "@/lib/format";
import { PropertyArt } from "./property-art";
import styles from "./storefront.module.css";

const VISIBLE_DAYS = 10;

function buildDateOptions(intlLocale: string): { iso: string; weekday: string; dayNum: string }[] {
  const now = new Date();
  return Array.from({ length: VISIBLE_DAYS }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    return {
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      weekday: new Intl.DateTimeFormat(intlLocale, { weekday: "short" }).format(d),
      dayNum: String(d.getDate())
    };
  });
}

export function BookingModal({
  orgSlug,
  property,
  onClose
}: {
  orgSlug: string;
  property: StorefrontProperty;
  onClose: () => void;
}) {
  const { t: translateText, locale, intlLocale } = useI18n();
  const dateOptions = useMemo(() => buildDateOptions(intlLocale), [intlLocale]);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]!.iso);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BookViewingResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    setSlotsError(false);
    setSelectedSlot(null);
    apiRequest<StorefrontAvailability>(`/storefront/${orgSlug}/properties/${property.id}/availability?date=${selectedDate}`)
      .then((res) => {
        if (!cancelled) setSlots(res.slots);
      })
      .catch(() => {
        if (!cancelled) setSlotsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, property.id, selectedDate]);

  function refetchAvailability() {
    apiRequest<StorefrontAvailability>(`/storefront/${orgSlug}/properties/${property.id}/availability?date=${selectedDate}`)
      .then((res) => setSlots(res.slots))
      .catch(() => setSlotsError(true));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiRequest<BookViewingResult>(`/storefront/${orgSlug}/properties/${property.id}/book-viewing`, {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          email: email.trim() === "" ? null : email,
          scheduledFor: selectedSlot,
          notes: notes.trim() === "" ? null : notes
        })
      });
      setResult(res);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSubmitError("Это время только что забронировали. Выберите другой слот.");
        setSelectedSlot(null);
        refetchAvailability();
      } else if (error instanceof ApiRequestError && error.status === 429) {
        setSubmitError("Слишком много попыток. Попробуйте немного позже.");
      } else {
        setSubmitError("Не удалось отправить заявку. Проверьте данные и попробуйте снова.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const location = [property.district, property.city, property.country].filter(Boolean).join(", ");

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <button type="button" className={styles.modalClose} aria-label={translateText("Закрыть")} onClick={onClose}>
          <X />
        </button>

        <div className={styles.modalArt}>
          <PropertyArt propertyType={property.propertyType} className={styles.modalArtTile} />
          <h2 className={styles.modalTitle}>{property.title}</h2>
          <div className={styles.modalPrice}>{formatPrice(property.priceCents, property.currency, property.transactionType, property.rentBillingPeriod, locale)}</div>
          {location && <p className={styles.cardLocation}>{location}</p>}
          {property.description && <p className={styles.modalDescription}>{property.description}</p>}

          <dl className={styles.modalSpecs}>
            {property.bedrooms != null && (
              <div className={styles.modalSpec}>
                <dt>
                  <Bed weight="bold" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                   {translateText("Спальни")} </dt>
                <dd>{property.bedrooms}</dd>
              </div>
            )}
            {property.bathrooms != null && (
              <div className={styles.modalSpec}>
                <dt>
                  <Bathtub weight="bold" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                   {translateText("Санузлы")} </dt>
                <dd>{property.bathrooms}</dd>
              </div>
            )}
            {property.areaSqm != null && (
              <div className={styles.modalSpec}>
                <dt>
                  <Ruler weight="bold" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                   {translateText("Площадь")} </dt>
                <dd>{property.areaSqm}  {translateText("м²")}</dd>
              </div>
            )}
            {property.transactionType === "RENT" && property.depositCents != null && (
              <div className={styles.modalSpec}>
                <dt>{translateText("Депозит")}</dt>
                <dd>{formatCents(property.depositCents, property.currency, locale)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className={styles.modalRight}>
          {result ? (
            <div className={styles.success}>
              <div className={styles.successIcon}>
                <CheckCircle weight="fill" />
              </div>
              <div className={styles.successTitle}>{translateText("Показ забронирован!")}</div>
              <p className={styles.successDetail}>
                {new Date(result.scheduledFor).toLocaleString(intlLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                <br />
                {result.propertyTitle} · {result.organizationName}
                <br />
                 {translateText("Мы свяжемся с вами по указанному телефону для подтверждения.")} </p>
            </div>
          ) : (
            <>
              <div className={styles.stepLabel}>{translateText("Выберите дату")}</div>
              <div className={styles.dateStrip}>
                {dateOptions.map((d) => (
                  <button key={d.iso} type="button" className={styles.dayPill} data-active={d.iso === selectedDate} onClick={() => setSelectedDate(d.iso)}>
                    <span>{d.weekday}</span>
                    <strong>{d.dayNum}</strong>
                  </button>
                ))}
              </div>

              <div className={styles.stepLabel}>{translateText("Свободное время")}</div>
              {slotsError && <p className={styles.slotsEmpty}>{translateText("Не удалось загрузить время. Попробуйте выбрать другую дату.")}</p>}
              {!slotsError && slots === null && <p className={styles.slotsEmpty}>{translateText("Загрузка…")}</p>}
              {!slotsError && slots !== null && slots.length === 0 && <p className={styles.slotsEmpty}>{translateText("На эту дату свободного времени нет.")}</p>}
              {!slotsError && slots !== null && slots.length > 0 && (
                <div className={styles.slotGrid}>
                  {slots.map((slot) => (
                    <button key={slot} type="button" className={styles.slot} data-active={slot === selectedSlot} onClick={() => setSelectedSlot(slot)}>
                      {new Date(slot).toLocaleTimeString(intlLocale, { hour: "2-digit", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              )}

              {selectedSlot && (
                <form className={styles.form} onSubmit={handleSubmit}>
                  <div className={styles.stepLabel}>{translateText("Контактные данные")}</div>
                  <div className={styles.selectedSlot}>
                    <Clock weight="bold" />
                    {new Date(selectedSlot).toLocaleString(intlLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <label className={styles.field}>
                     {translateText("Имя")} <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={translateText("Как к вам обращаться")} />
                  </label>
                  <div className={styles.fieldRow}>
                    <label className={styles.field}>
                       {translateText("Телефон")} <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
                    </label>
                    <label className={styles.field}>
                       {translateText("Email (необязательно)")} <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                    </label>
                  </div>
                  <label className={styles.field}>
                     {translateText("Комментарий (необязательно)")} <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={translateText("Например: удобно после 18:00")} />
                  </label>

                  {submitError && (
                    <p className={styles.errorText}>
                      <WarningCircle weight="bold" style={{ display: "inline", verticalAlign: "-2px", marginRight: 4 }} />
                      {translateText(submitError)}
                    </p>
                  )}

                  <div className={styles.submitRow}>
                    <button type="submit" className={styles.submitButton} disabled={submitting || !name || !phone}>
                      {submitting ? translateText("Отправляем…") : translateText("Забронировать показ")}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
