// Small brand icons for calendar providers (Google / Microsoft / Apple).
export default function ProviderIcon({ provider, className = "h-3.5 w-3.5" }: { provider: string; className?: string }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-label="Google" role="img">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3 0-5.6-2-6.5-4.8h-4v3.1C3.5 21.3 7.4 24 12 24z" />
        <path fill="#FBBC05" d="M5.5 14.5c-.2-.7-.4-1.4-.4-2.5s.1-1.8.4-2.5v-3.1h-4C.7 8 0 9.9 0 12s.7 4 1.5 5.6l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.9 1.2 15.2 0 12 0 7.4 0 3.5 2.7 1.5 6.4l4 3.1C6.4 6.8 9 4.8 12 4.8z" />
      </svg>
    );
  }
  if (provider === "microsoft") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-label="Microsoft" role="img">
        <path fill="#F25022" d="M1 1h10v10H1z" />
        <path fill="#7FBA00" d="M13 1h10v10H13z" />
        <path fill="#00A4EF" d="M1 13h10v10H1z" />
        <path fill="#FFB900" d="M13 13h10v10H13z" />
      </svg>
    );
  }
  if (provider === "apple") {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-label="Apple" role="img" fill="currentColor">
        <path d="M16.4 12.8c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.2 2.6 2.1 1-.04 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.6 1.1-.02 1.8-1 2.5-2 .8-1.2 1.1-2.3 1.1-2.4 0-.02-2.1-.8-2.1-3.2zM14.3 5.6c.6-.7 1-1.7.9-2.6-.9.03-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.5 1 .07 1.9-.5 2.5-1.2z" />
      </svg>
    );
  }
  return <span className={className}>🗓</span>;
}
