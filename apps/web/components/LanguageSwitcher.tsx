"use client";

import { LANGUAGES, useT, type Lang } from "@/lib/i18n";

/** Compact language picker. Sits in the landing/nav — persists the choice. */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <label className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <span className="sr-only">{t("lang.label")}</span>
      <span aria-hidden className="text-base">🌐</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t("lang.label")}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
