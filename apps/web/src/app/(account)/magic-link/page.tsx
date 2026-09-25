"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { EnvelopeSimple, WarningCircle } from "@phosphor-icons/react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import { AccountShell } from "../account-shell";
import styles from "../account.module.css";

export default function MagicLinkRequestPage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/auth/magic-link/request", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AccountShell title={translateText("Check your email")} footer={<Link href="/login">{translateText("Back to login")}</Link>}>
        <div style={{ textAlign: "center" }}>
          <div className={styles.iconCircle}>
            <EnvelopeSimple size={22} weight="bold" />
          </div>
          <p className={styles.subtitle} style={{ margin: 0 }}>
             {translateText("If an account exists for")} <strong style={{ color: "var(--ink)" }}>{email}</strong>{translateText(", a login link is on its way.")} </p>
        </div>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      title={translateText("Log in with a magic link")}
      subtitle={translateText("We'll email you a one-time link — no password needed.")}
      footer={<Link href="/login">{translateText("Back to login")}</Link>}
    >
      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
           {translateText("Email")} <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {error && (
          <p className={styles.error}>
            <WarningCircle weight="bold" style={{ flexShrink: 0, marginTop: 2 }} />
            {translateText(error)}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? translateText("Sending…") : translateText("Send login link")}
        </button>
      </form>
    </AccountShell>
  );
}
