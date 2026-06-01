"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageSpinner } from "@/components/Skeleton";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Next.js requires useSearchParams() to be inside a Suspense boundary
// when the page is statically prerendered. Wrap the inner content.
export default function LandingPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
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

  // Email/password auth
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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

  function nextPathParam() {
    return searchParams.get("next") || "/dashboard";
  }

  async function signInWithGoogle() {
    setSigningIn(true);
    const next = nextPathParam();
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

  async function signInWithMicrosoft() {
    setSigningIn(true);
    const next = nextPathParam();
    // offline_access → refresh token; Calendars.Read → Outlook calendar import
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "email openid profile offline_access Calendars.Read",
      },
    });
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setEmailBusy(true);
    const next = nextPathParam();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);          // email confirmation disabled → straight in
        } else {
          setInfo("Almost there! Check your email for a confirmation link, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError("Enter your email above first, then tap “Forgot password”.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    if (error) setError(error.message);
    else setInfo("If that email has an account, a password-reset link is on its way.");
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

        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Group Holiday Booking
        </p>

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
            "Compare flights from every airport each member can reach",
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
        {info && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {info}
          </div>
        )}

        {/* Auth panel */}
        <div className="mx-auto w-full max-w-sm space-y-3 text-left">
          {/* Social sign-in */}
          <button
            onClick={signInWithGoogle}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <button
            onClick={signInWithMicrosoft}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 23 23">
              <path fill="#F25022" d="M1 1h10v10H1z" />
              <path fill="#7FBA00" d="M12 1h10v10H12z" />
              <path fill="#00A4EF" d="M1 12h10v10H1z" />
              <path fill="#FFB900" d="M12 12h10v10H12z" />
            </svg>
            Continue with Microsoft
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Email + password */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "Create a password (min 6 chars)" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={emailBusy}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
            >
              {emailBusy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null); setInfo(null); }}
              className="text-blue-600 hover:underline"
            >
              {mode === "signup" ? "Have an account? Sign in" : "New here? Create an account"}
            </button>
            {mode === "signin" && (
              <button type="button" onClick={handleForgotPassword} className="text-gray-500 hover:underline">
                Forgot password?
              </button>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-400">
          Free · No booking fees · Works with Ryanair, easyJet, BA &amp; more
        </p>
      </div>

      {/* How it works */}
      <div className="mt-24 max-w-4xl w-full">
        <h2 className="mb-12 text-2xl font-semibold text-gray-900 text-center">
          How it works
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { step: "1", emoji: "📅", title: "Find free dates", desc: "Everyone marks their availability. Results stay hidden until the whole group is in." },
            { step: "2", emoji: "✈️", title: "Compare flights", desc: "We price every UK airport each member can reach — not just the closest — and find the cheapest overall combination." },
            { step: "3", emoji: "🗳️", title: "Vote on where to go", desc: "Add destination ideas, vote together, or let the AI pick based on your group's preferences." },
            { step: "4", emoji: "🎫", title: "Book in one tap", desc: "Everyone gets their own booking link. One click, cheapest price, done." },
          ].map(({ step, emoji, title, desc }) => (
            <div key={step} className="rounded-xl border border-gray-200 bg-white p-6 text-left hover:border-blue-300 transition-colors">
              <div className="mb-3 text-2xl">{emoji}</div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-500">Step {step}</div>
              <h3 className="mb-1 font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Why it beats WhatsApp polls */}
      <div className="mt-20 max-w-3xl w-full">
        <h2 className="mb-8 text-2xl font-semibold text-gray-900 text-center">
          Why not just use WhatsApp?
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: "🙈", title: "Blind availability", desc: "No one knows who's free until everyone has submitted — no anchoring or social pressure." },
            { icon: "🛫", title: "Multi-airport search", desc: "We price up every UK airport each person can reach — not just the closest — and find the combination that's cheapest for the whole group." },
            { icon: "🤖", title: "AI destination ideas", desc: "Gemini suggests destinations based on your group's climate, budget, and duration preferences." },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="rounded-xl bg-indigo-50 border border-indigo-100 p-5 text-left">
              <div className="text-2xl mb-2">{icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* JSON-LD structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": "Group Holiday Booking",
            "url": "https://groupholidaybooking.com",
            "description": "Plan group holidays from multiple UK cities — find free windows, compare flights from every airport each member can reach, vote on destinations, and book at the lowest group cost.",
            "applicationCategory": "TravelApplication",
            "operatingSystem": "Web",
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "GBP" },
          }),
        }}
      />

      {/* Footer */}
      <footer className="mt-24 border-t py-8 text-center text-sm text-gray-400 w-full">
        <Link href="/privacy" className="hover:text-gray-600">Privacy Policy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link>
      </footer>
    </main>
  );
}
