"use client";

import { useI18n } from "@/lib/i18n/provider";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import { AccountShell } from "../../account-shell";
import styles from "../../account.module.css";

export default function ResetPasswordPage() {
  const { t: translateText } = useI18n();
  return (
    <Suspense
      fallback={
        <AccountShell centered>
          <div className={styles.spinner} />
          <p className={styles.statusTitle}>{translateText("Loading…")}</p>
        </AccountShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const { t: translateText } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("This link is missing its token.");
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, newPassword }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "This link is invalid or has expired.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AccountShell centered>
        <div className={styles.iconCircle}>
          <CheckCircle size={22} weight="bold" />
        </div>
        <p className={styles.statusTitle}>{translateText("Password updated")}</p>
        <p className={styles.statusText}>{translateText("You can now log in with your new password.")}</p>
        <button className={styles.submit} style={{ marginTop: 18, width: "100%" }} onClick={() => router.push("/login")}>
          {translateText("Back to login")}
        </button>
      </AccountShell>
    );
  }

  return (
    <AccountShell
      title={translateText("Set a new password")}
      subtitle={translateText("Choose a new password for your account.")}
      footer={<Link href="/login">{translateText("Back to login")}</Link>}
    >
      {!token ? (
        <p className={styles.error}>
          <WarningCircle weight="bold" style={{ flexShrink: 0, marginTop: 2 }} />
          {translateText("This link is missing its token.")}
        </p>
      ) : (
        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.field}>
             {translateText("New password")}{" "}
            <input
              type="password"
              placeholder="••••••••••"
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
             {translateText("Confirm password")}{" "}
            <input
              type="password"
              placeholder="••••••••••"
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? translateText("Updating…") : translateText("Update password")}
          </button>
        </form>
      )}
    </AccountShell>
  );
}
