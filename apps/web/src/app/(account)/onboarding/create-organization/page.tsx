"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import type { Organization } from "@yoyo/contracts";
import { AccountShell } from "../../account-shell";
import styles from "../../account.module.css";

export default function CreateOrganizationPage() {
  const { t: translateText } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Every organization created through this onboarding flow is a
      // real-estate agency (YoYo's current product) - the generic "core"
      // vertical still exists for internal/testing org creation elsewhere,
      // it's just never what a real signup lands on.
      const organization = await apiRequest<Organization>("/organizations", {
        method: "POST",
        body: JSON.stringify({ name, vertical: "real_estate" })
      });
      router.push(`/dashboard/${organization.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountShell title={translateText("Create your agency")} subtitle={translateText("This is the real-estate agency your AI assistant will work for.")}>
      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
           {translateText("Agency name")} <input placeholder={translateText("e.g. Global Homes Realty")} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {error && (
          <p className={styles.error}>
            <WarningCircle weight="bold" style={{ flexShrink: 0, marginTop: 2 }} />
            {translateText(error)}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? translateText("Creating…") : translateText("Create organization")}
        </button>
      </form>
    </AccountShell>
  );
}
