import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-semibold">Yoyo</h1>
      <p className="text-slate-600">Your AI employee creates content, answers customers, and turns conversations into sales.</p>
      <div className="flex gap-3">
        <Link href="/signup" className="rounded bg-slate-900 px-4 py-2 text-white">
          Sign up
        </Link>
        <Link href="/login" className="rounded border border-slate-300 px-4 py-2">
          Log in
        </Link>
      </div>
    </main>
  );
}
