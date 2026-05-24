"use client";

import { createClient } from "@/lib/supabase/client";
import { getMyProfile, updateMyProfile } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";
import { normalisePostcode } from "@/lib/postcode";

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [postcode, setPostcode] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      setToken(t);
      try {
        const p = await getMyProfile(t);
        setEmail(p.email ?? "");
        setDisplayName(p.display_name ?? "");
        setPostcode(p.default_home_postcode ?? "");
      } catch {
        router.replace("/dashboard");
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [router, supabase]);

  // Update browser tab title
  useEffect(() => {
    document.title = "Your Profile | Group Holiday";
    return () => { document.title = "✈️ Group Holiday — sort your trip together"; };
  }, []);

  async function handleSave() {
    if (!token) return;
    // Validate postcode if provided
    let normPostcode = postcode.trim();
    if (normPostcode) {
      const n = normalisePostcode(normPostcode);
      if (!n) {
        toast.error("That doesn't look like a valid UK postcode (e.g. DL2 3HB)");
        return;
      }
      normPostcode = n;
    }
    setSaving(true);
    try {
      await updateMyProfile(token, {
        display_name: displayName.trim() || undefined,
        default_home_postcode: normPostcode || undefined,
      });
      setSaved(true);
      setPostcode(normPostcode);
      setTimeout(() => setSaved(false), 3000);
      toast.success("Profile saved!");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save profile"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <button onClick={() => router.push("/dashboard")} className="text-sm text-gray-500 hover:text-gray-900">
            ← Dashboard
          </button>
          <span className="font-semibold text-gray-900">Your Profile</span>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-xl px-6 py-10 space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          {/* Email (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
              {email || "—"}
            </p>
            <p className="mt-1 text-xs text-gray-400">Set by your Google account — cannot be changed here.</p>
          </div>

          {/* Display name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="How should we show your name to the group?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Home postcode */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Home postcode
            </label>
            <input
              type="text"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="e.g. DL2 3HB"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used to find your nearest airport and calculate ground travel cost.
              Updating here automatically updates all your Holiday groups too.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save profile"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          Your postcode is only used to calculate travel distances and is never shared publicly.
        </p>
      </div>
    </main>
  );
}
