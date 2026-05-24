"use client";

import { createClient } from "@/lib/supabase/client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Next.js requires useSearchParams() to be inside a Suspense boundary
// when the page is statically prerendered. Wrap the inner content.
export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingPageContent />
    </Suspense>
  );
}

function LandingPageContent() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("error") === "auth_failed") {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const next = searchParams.get("next") || "/dashboard";
        router.replace(next);
      } else {
        setLoading(false);
      }
    });
  }, [supabase, router, searchParams]);

  async function signInWithGoogle() {
    setSigningIn(true);
    const next = searchParams.get("next") || "/dashboard";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "email profile openid",
        queryParams: {
          // Always show the Google account picker so users can switch accounts
          // without having to sign out first (especially useful for group testing).
          prompt: "select_account",
        },
      },
    });
  }

  if (loading) return null;

  // If we redirected here from a protected page (e.g. an invite link),
  // show a banner so the user understands why they're being asked to sign in.
  const nextPath = searchParams.get("next");
  const isInvite = nextPath?.includes("/join");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {/* Hero */}
      <div className="max-w-2xl space-y-6">
        {isInvite && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            🎉 You&apos;ve been invited to a Holiday! Sign in with Google to join the group.
          </div>
        )}
        {nextPath && !isInvite && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            Sign in with Google to continue.
          </div>
        )}
        <div className="text-6xl">✈️</div>

        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Group holidays,{" "}
          <span className="text-blue-600">sorted.</span>
        </h1>

        <p className="text-lg text-gray-600">
          Everyone in different cities. Everyone with different budgets. One
          holiday you all actually want to go on.
        </p>

        <ul className="mx-auto max-w-md space-y-2 text-left text-gray-600">
          {[
            "Find when everyone is free",
            "Compare flights from every member's nearest airport",
            "Vote on destinations together",
            "Book at the lowest total group cost",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              {item}
            </li>
          ))}
        </ul>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={signingIn}
          className="inline-flex items-center gap-3 rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-60 transition-colors"
        >
          {signingIn ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Signing in…
            </>
          ) : (
            <>
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path
                  fill="white"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="white"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="white"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="white"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <p className="text-sm text-gray-400">
          Free to use. Earn commission from bookings.
        </p>
      </div>

      {/* How it works */}
      <div className="mt-24 max-w-4xl w-full">
        <h2 className="mb-12 text-2xl font-semibold text-gray-900">
          How it works
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: "1", title: "Create a room", desc: "Share the link. Everyone joins." },
            { step: "2", title: "Mark availability", desc: "Pick your free dates. Results hidden until everyone's in." },
            { step: "3", title: "Vote on destinations", desc: "AI suggests places. You vote. The group decides." },
            { step: "4", title: "Book together", desc: "Cheapest flights from every city. Book in one click each." },
          ].map(({ step, title, desc }) => (
            <div key={step} className="rounded-xl border border-gray-200 p-6 text-left">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                {step}
              </div>
              <h3 className="mb-1 font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
