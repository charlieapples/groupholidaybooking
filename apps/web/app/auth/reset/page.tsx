"use client";

/**
 * Password reset landing page.
 *
 * Supabase emails a recovery link that lands here with a token in the URL.
 * The Supabase client auto-detects it and establishes a short-lived recovery
 * session, after which updateUser({ password }) sets the new password.
 */
import { createClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [ready, setReady] = useState(false);     // recovery session detected
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The client fires PASSWORD_RECOVERY once it parses the token from the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    // Also check if a session already exists (link clicked, token parsed).
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.replace("/dashboard"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Set a new password</h1>

        {done ? (
          <p className="text-sm text-green-700">
            ✅ Password updated — taking you to your dashboard…
          </p>
        ) : !ready ? (
          <p className="text-sm text-gray-500">
            Open this page from the password-reset link in your email. If you got here by
            mistake, <Link href="/" className="text-blue-600 hover:underline">go back to sign in</Link>.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="New password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
