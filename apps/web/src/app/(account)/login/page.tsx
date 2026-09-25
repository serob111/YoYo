"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import type { Organization } from "@yoyo/contracts";
import { AccountShell } from "../account-shell";
import styles from "../account.module.css";

export default function LoginPage() {
  const { t: translateText } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      const organizations = await apiRequest<Organization[]>("/organizations");
      if (organizations.length > 0) {
        router.push(`/dashboard/${organizations[0]!.id}`);
      } else {
        router.push("/onboarding/create-organization");
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountShell
      title={translateText("Welcome back")}
      subtitle={translateText("Log in to keep your AI employee working.")}
      footer={
        <>
           {translateText("No account?")}{" "}
          <Link href="/signup">{translateText("Sign up")}</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
           {translateText("Email")} <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={styles.field}>
           {translateText("Password")} <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && (
          <p className={styles.error}>
            <WarningCircle weight="bold" style={{ flexShrink: 0, marginTop: 2 }} />
            {translateText(error)}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? translateText("Logging in…") : translateText("Log in")}
        </button>
      </form>
      <div className={styles.divider}>{translateText("or")}</div>
      <Link href="/magic-link" className={styles.secondaryLink}>
         {translateText("Log in with a magic link")} </Link>
    </AccountShell>
  );
}
