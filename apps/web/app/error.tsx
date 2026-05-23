"use client";

/**
 * Global error boundary for the App Router.
 *
 * Triggered when an unhandled exception escapes any client component
 * tree below the root layout. Logs to the console (and Vercel surfaces
 * it in the Logs tab) and shows the user a friendly "try again" screen
 * instead of a blank white page.
 *
 * Per Next.js docs, this MUST be a client component.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console — Vercel captures this in the function logs.
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md text-center space-y-5">
        <div className="text-6xl">🙃</div>
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="text-gray-600">
          We hit an unexpected error. It&apos;s been logged — try again, and if
          it keeps happening, head back to the dashboard.
        </p>
        {error.message && (
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-mono break-words">
            {error.message}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl border border-gray-300 px-6 py-2.5 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
