"use client";

import { useState, type FormEvent } from "react";
import { apiRequest, ApiRequestError } from "@/lib/api-client";

export default function MagicLinkRequestPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest("/auth/magic-link/request", { method: "POST", body: JSON.stringify({ email }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : "Something went wrong.");
    }
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <p>If an account exists for {email}, a login link has been sent.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Log in with a magic link</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input className="rounded border border-slate-300 p-2" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="rounded bg-slate-900 p-2 text-white" type="submit">
          Send login link
        </button>
      </form>
    </main>
  );
}
