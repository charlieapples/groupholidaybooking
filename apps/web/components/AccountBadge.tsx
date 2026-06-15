"use client";

/**
 * Small "signed in as …" chip so the user can always see which account they're
 * using. Reads the Supabase session client-side; tapping it opens the profile.
 * Renders nothing until a session is known (and on signed-out pages).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getMyProfile } from "@/lib/api";

export default function AccountBadge({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      const u = session?.user;
      if (!u) return;
      // Prefer the app DISPLAY NAME the user set (profiles table) over the raw
      // Google/Microsoft account name — otherwise a "Everything Appleyard"
      // account whose Google name is "Charles Appleyard" shows the wrong name.
      const fallback = (u.user_metadata?.full_name as string) || u.email || null;
      try {
        const p = await getMyProfile(session.access_token);
        setLabel(p.display_name || fallback);
      } catch {
        setLabel(fallback);
      }
    });
  }, []);

  if (!label) return null;

  return (
    <button
      onClick={() => router.push("/profile")}
      title="Signed in — tap to view your profile"
      className={`flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors ${className}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
        {label.slice(0, 1).toUpperCase()}
      </span>
      <span className="max-w-[140px] truncate">{label}</span>
    </button>
  );
}
