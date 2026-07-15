import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Group Holiday Booking",
  description: "How Group Holiday Booking collects and uses your data.",
};

export default function PrivacyPage() {
  const CONTACT = "privacy@groupholidaybooking.com";
  const APP_NAME = "Group Holiday Booking";
  const UPDATED = "25 May 2026";

  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">✈️ {APP_NAME}</Link>
        </div>
      </nav>

      <article className="mx-auto max-w-2xl px-6 py-12 space-y-8 prose prose-gray">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500">Last updated: {UPDATED}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">1. Who we are</h2>
          <p className="text-gray-700 leading-relaxed">
            {APP_NAME} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a group holiday
            planning service. We help groups of friends and family coordinate travel dates,
            compare flights, and vote on destinations. Our registered contact address is{" "}
            <a href={`mailto:${CONTACT}`} className="text-blue-600 hover:underline">{CONTACT}</a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">2. What data we collect</h2>
          <p className="text-gray-700 leading-relaxed">We collect the minimum data needed to run the service:</p>
          <ul className="list-disc ml-6 space-y-2 text-gray-700">
            <li>
              <strong>Account information</strong> — your name and email address, provided by
              Google when you sign in with Google OAuth.
            </li>
            <li>
              <strong>Home postcode</strong> — optionally provided by you, used only to
              find your nearest airport and estimate ground travel costs. Never shared publicly.
            </li>
            <li>
              <strong>Availability dates</strong> — the busy/free dates you submit for a
              holiday group. These are visible to other members of the same group after
              the blind-reveal (once everyone has submitted).
            </li>
            <li>
              <strong>Preferences &amp; votes</strong> — your destination preferences,
              trip-length preferences, and votes on destination candidates within a group.
            </li>
            <li>
              <strong>Usage data</strong> — standard server logs (IP address, browser
              type, pages visited) retained for up to 90 days for security and debugging.
            </li>
            <li>
              <strong>Feedback</strong> — star ratings and optional comments you submit
              through the in-app feedback button.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">3. Calendar access (Google &amp; Microsoft)</h2>
          <p className="text-gray-700 leading-relaxed">
            If you choose to sync your calendar, we request <strong>read-only</strong> access to your
            calendar (Google Calendar or Microsoft Outlook) for the sole purpose of identifying your
            busy dates within the holiday window. We only ever read free/busy times — we never read
            the details of, modify, create, delete, or share your calendar events, and we never store
            event content on our servers.
          </p>
          <p className="text-gray-700 leading-relaxed">
            For a <strong>one-off import</strong>, your calendar is read in your browser in real time
            and discarded when the page is closed. If you choose to <strong>permanently link</strong> an
            account (so you don&apos;t have to grant access each trip), we store only an
            <strong> encrypted access token</strong> — not your events — which lets us look up your
            free/busy dates again on future trips. You can unlink at any time from your profile, which
            deletes that token. We only retain the busy <em>dates</em> you submit for a given trip.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Our use of Google Calendar data complies with the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">4. How we use your data</h2>
          <ul className="list-disc ml-6 space-y-2 text-gray-700">
            <li>To provide the group holiday planning service.</li>
            <li>To send transactional emails (e.g. &ldquo;everyone has submitted their availability&rdquo;).</li>
            <li>To identify your nearest airport and estimate travel costs.</li>
            <li>To improve the service based on aggregated, anonymised feedback.</li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            We do <strong>not</strong> sell your data, share it with third parties for
            marketing purposes, or use it for advertising.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">5. Data sharing</h2>
          <p className="text-gray-700 leading-relaxed">We share your data only with:</p>
          <ul className="list-disc ml-6 space-y-2 text-gray-700">
            <li>
              <strong>Other members of your holiday group</strong> — your display name,
              home postcode (truncated to district), and availability dates are visible
              to members of groups you join.
            </li>
            <li>
              <strong>Infrastructure providers</strong> — Supabase (database and auth),
              Railway (API hosting), Vercel (web hosting), and Resend (email delivery).
              Each processes data only as instructed by us.
            </li>
            <li>
              <strong>Google</strong> — when you use &ldquo;Sign in with Google&rdquo; or sync
              your calendar, subject to{" "}
              <a href="https://policies.google.com/privacy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                Google&apos;s Privacy Policy
              </a>.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">6. Data retention</h2>
          <p className="text-gray-700 leading-relaxed">
            Your account data is retained until you request deletion. Holiday rooms and
            their associated data are retained while the room exists. You or the admin
            can delete a room at any time, which permanently removes all its data.
            Server logs are retained for 90 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">7. Data protection &amp; security</h2>
          <p className="text-gray-700 leading-relaxed">
            We protect your personal data — including sensitive data such as calendar
            access — with the following measures:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-gray-700 leading-relaxed">
            <li>
              <strong>Encryption in transit:</strong> all traffic between your browser, our
              app and our providers is served over HTTPS/TLS.
            </li>
            <li>
              <strong>Encryption at rest:</strong> data is stored on encrypted infrastructure,
              and calendar OAuth tokens are additionally encrypted by us before storage.
            </li>
            <li>
              <strong>Data minimisation:</strong> for calendars we read only free/busy
              information and store only the busy <em>dates</em> you submit for a trip — never
              the titles, attendees, locations or contents of your events.
            </li>
            <li>
              <strong>Access controls:</strong> database row-level security restricts each
              room&apos;s data to its own members, and administrative access is limited to
              authorised operators.
            </li>
            <li>
              <strong>Trusted processors:</strong> we rely on reputable providers (Supabase,
              Google, Microsoft, Vercel) that maintain their own security and compliance
              programmes.
            </li>
            <li>
              <strong>Deletion:</strong> unlinking a calendar deletes its stored token, and
              deleting a room permanently removes its data.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">8. Your rights</h2>
          <p className="text-gray-700 leading-relaxed">
            Under UK GDPR you have the right to access, correct, port, or erase your
            personal data. To exercise these rights, email{" "}
            <a href={`mailto:${CONTACT}`} className="text-blue-600 hover:underline">{CONTACT}</a>.
            We will respond within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">9. Cookies</h2>
          <p className="text-gray-700 leading-relaxed">
            We use strictly necessary cookies for authentication (Supabase session tokens).
            We do not use advertising or tracking cookies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">10. Changes</h2>
          <p className="text-gray-700 leading-relaxed">
            We may update this policy. Significant changes will be communicated via email
            to registered users. Continued use of the service after changes constitutes
            acceptance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">11. Contact</h2>
          <p className="text-gray-700 leading-relaxed">
            Questions about this policy?{" "}
            <a href={`mailto:${CONTACT}`} className="text-blue-600 hover:underline">{CONTACT}</a>
          </p>
        </section>
      </article>

      <footer className="border-t mt-16 py-8 text-center text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600">← Back to {APP_NAME}</Link>
        {" · "}
        <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link>
      </footer>
    </main>
  );
}
