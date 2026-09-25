"use client";

import { useI18n } from "@/lib/i18n/provider";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";
import { AccountShell } from "../../account-shell";
import styles from "../../account.module.css";

function StatusShell({ children }: { children: React.ReactNode }) {
  return <AccountShell centered>{children}</AccountShell>;
}

export default function AcceptInvitePage() {
  const { t: translateText, locale, intlLocale } = useI18n();
  return (
    <Suspense
      fallback={
        <StatusShell>
          <div className={styles.spinner} />
          <p className={styles.statusTitle}>{translateText("Joining organization…")}</p>
        </StatusShell>
      }
    >
      <AcceptInviteInner />
    </Suspense>
  );
}

function AcceptInviteInner() {
  const { t: translateText, locale, intlLocale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("This invite link is missing its token.");
      return;
    }
    apiRequest<{ organizationId: string }>("/members/accept-invite", { method: "POST", body: JSON.stringify({ token }) })
      .then(({ organizationId }) => router.push(`/dashboard/${organizationId}`))
      .catch((err) => setError(err instanceof ApiRequestError ? err.error.message : "This invite is invalid or has expired."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StatusShell>
      {error ? (
        <>
          <div className={styles.statusIconError}>
            <WarningCircle size={22} weight="bold" />
          </div>
          <p className={styles.statusTitle}>{translateText("Couldn't join")}</p>
          <p className={styles.statusText}>{translateText(error)}</p>
        </>
      ) : (
        <>
          <div className={styles.spinner} />
          <p className={styles.statusTitle}>{translateText("Joining organization…")}</p>
        </>
      )}
    </StatusShell>
  );
}
