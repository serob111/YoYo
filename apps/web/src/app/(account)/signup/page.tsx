"use client";

import { useI18n } from "@/lib/i18n/provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import { AccountShell } from "../account-shell";
import styles from "../account.module.css";

export default function SignupPage() {
  const { t: translateText } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
      router.push("/onboarding/create-organization");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountShell
      title={translateText("Create your account")}
      subtitle={translateText("Set up your AI leasing assistant and import your Instagram listings in minutes.")}
      footer={
        <>
           {translateText("Already have an account?")} <Link href="/login">{translateText("Log in")}</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className={styles.form}>
        <label className={styles.field}>
           {translateText("Name")} <input placeholder={translateText("Your name")} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={styles.field}>
           {translateText("Email")} <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={styles.field}>
           {translateText("Password")} <input
            type="password"
            placeholder={translateText("Min. 10 characters")}
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className={styles.error}>
            <WarningCircle weight="bold" style={{ flexShrink: 0, marginTop: 2 }} />
            {translateText(error)}
          </p>
        )}
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? translateText("Creating account…") : translateText("Create account")}
        </button>
      </form>
    </AccountShell>
  );
}
