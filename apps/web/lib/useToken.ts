"use client";

/**
 * useToken — always returns a fresh Supabase access token.
 *
 * Supabase auto-refreshes JWTs in the background (default 1-hour expiry),
 * but only if we re-read the session. Pages that capture `access_token`
 * into useState once and reuse it forever break the moment that JWT
 * expires — every API call then 401s with "token is expired".
 *
 * This hook:
 *  1. Reads the initial session on mount and stores the access token.
 *  2. Subscribes to onAuthStateChange so when Supabase silently refreshes,
 *     the token state updates immediately.
 *
 * The returned object also exposes `userId` and a `getFreshToken()` helper
 * for cases where you need to make an API call from a long-idle page and
 * want to guarantee a fresh token (it forces a getSession() call which
 * triggers a refresh if needed).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface TokenState {
  token: string | null;
  userId: string | null;
  ready: boolean;
  /** Force-fetch the current session and return its (possibly refreshed) access token. */
  getFreshToken: () => Promise<string | null>;
}

export function useToken(): TokenState {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user.id ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Fires on SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, etc.
      // Crucially this fires when Supabase silently refreshes the JWT in the
      // background, so our stored token stays valid for the page's lifetime.
      setToken(session?.access_token ?? null);
      setUserId(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function getFreshToken(): Promise<string | null> {
    const { data } = await supabaseRef.current.auth.getSession();
    return data.session?.access_token ?? null;
  }

  return { token, userId, ready, getFreshToken };
}
