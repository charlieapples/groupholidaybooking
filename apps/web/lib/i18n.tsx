"use client";

/**
 * Lightweight i18n foundation — a client-side language context + `useT()` hook.
 *
 * This is the START of making the app global: strings are looked up by key from
 * a per-language dictionary, falling back to English then the key itself, so
 * partially-translated pages never show blanks. The chosen language persists in
 * localStorage and is guessed from the browser on first visit.
 *
 * Next phase: extract the rest of the app's strings into these dictionaries and
 * (optionally) move to locale-routed SSR. See roadmap.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "en" | "es" | "fr" | "de" | "hi";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
];

// Dictionary. English is the source of truth; other languages fall back to it.
// Keep keys stable — components reference them via t("key").
const DICT: Record<Lang, Record<string, string>> = {
  en: {
    "hero.title1": "Group holidays,",
    "hero.title2": "sorted.",
    "hero.sub": "Everyone in different cities. Everyone with different budgets. One holiday you all actually want to go on.",
    "hero.feature.free": "Find when everyone is free",
    "hero.feature.flights": "Compare flights from every airport each member can reach",
    "hero.feature.vote": "Vote on destinations together",
    "hero.feature.book": "Book at the lowest total group cost",
    "auth.google": "Continue with Google",
    "auth.microsoft": "Continue with Microsoft",
    "auth.signin": "Sign in",
    "auth.create": "Create account",
    "lang.label": "Language",
  },
  es: {
    "hero.title1": "Vacaciones en grupo,",
    "hero.title2": "resueltas.",
    "hero.sub": "Cada uno en una ciudad. Cada uno con un presupuesto distinto. Un viaje al que todos querréis ir de verdad.",
    "hero.feature.free": "Encuentra cuándo está libre todo el mundo",
    "hero.feature.flights": "Compara vuelos desde cada aeropuerto al alcance de cada miembro",
    "hero.feature.vote": "Votad juntos los destinos",
    "hero.feature.book": "Reserva al menor coste total del grupo",
    "auth.google": "Continuar con Google",
    "auth.microsoft": "Continuar con Microsoft",
    "auth.signin": "Iniciar sesión",
    "auth.create": "Crear cuenta",
    "lang.label": "Idioma",
  },
  fr: {
    "hero.title1": "Vacances de groupe,",
    "hero.title2": "réglées.",
    "hero.sub": "Chacun dans sa ville. Chacun son budget. Un séjour dont tout le monde a vraiment envie.",
    "hero.feature.free": "Trouvez quand tout le monde est disponible",
    "hero.feature.flights": "Comparez les vols depuis chaque aéroport accessible à chaque membre",
    "hero.feature.vote": "Votez ensemble pour les destinations",
    "hero.feature.book": "Réservez au coût total le plus bas pour le groupe",
    "auth.google": "Continuer avec Google",
    "auth.microsoft": "Continuer avec Microsoft",
    "auth.signin": "Se connecter",
    "auth.create": "Créer un compte",
    "lang.label": "Langue",
  },
  de: {
    "hero.title1": "Gruppenurlaub,",
    "hero.title2": "geregelt.",
    "hero.sub": "Alle in verschiedenen Städten. Alle mit unterschiedlichem Budget. Eine Reise, auf die wirklich alle Lust haben.",
    "hero.feature.free": "Finde heraus, wann alle Zeit haben",
    "hero.feature.flights": "Vergleiche Flüge von jedem Flughafen, den jedes Mitglied erreichen kann",
    "hero.feature.vote": "Stimmt gemeinsam über Reiseziele ab",
    "hero.feature.book": "Bucht zum niedrigsten Gesamtpreis der Gruppe",
    "auth.google": "Weiter mit Google",
    "auth.microsoft": "Weiter mit Microsoft",
    "auth.signin": "Anmelden",
    "auth.create": "Konto erstellen",
    "lang.label": "Sprache",
  },
  hi: {
    "hero.title1": "समूह की छुट्टियाँ,",
    "hero.title2": "आसान।",
    "hero.sub": "सब अलग-अलग शहरों में। सबका बजट अलग। एक ऐसी छुट्टी जिस पर सब सच में जाना चाहें।",
    "hero.feature.free": "पता करें कि सब कब खाली हैं",
    "hero.feature.flights": "हर सदस्य के पहुँच वाले हर हवाई अड्डे से उड़ानों की तुलना करें",
    "hero.feature.vote": "मिलकर मंज़िल पर वोट करें",
    "hero.feature.book": "समूह की सबसे कम कुल लागत पर बुक करें",
    "auth.google": "Google से जारी रखें",
    "auth.microsoft": "Microsoft से जारी रखें",
    "auth.signin": "साइन इन",
    "auth.create": "खाता बनाएँ",
    "lang.label": "भाषा",
  },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string };
const LangContext = createContext<Ctx | null>(null);

function detectLang(): Lang {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem("lang") as Lang | null;
  if (saved && DICT[saved]) return saved;
  const nav = (window.navigator.language || "en").slice(0, 2).toLowerCase() as Lang;
  return DICT[nav] ? nav : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  // Resolve the real language on the client (avoids SSR/client mismatch).
  useEffect(() => { setLangState(detectLang()); }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("lang", l);
  }, []);

  const t = useCallback(
    (key: string) => DICT[lang]?.[key] ?? DICT.en[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): Ctx {
  const ctx = useContext(LangContext);
  // Safe fallback if a component renders outside the provider.
  if (!ctx) return { lang: "en", setLang: () => {}, t: (k) => DICT.en[k] ?? k };
  return ctx;
}
