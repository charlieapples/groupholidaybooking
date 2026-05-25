import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Group Holiday",
  description: "Terms of Service for Group Holiday.",
};

export default function TermsPage() {
  const CONTACT = "legal@groupholiday.app";
  const APP_NAME = "Group Holiday";
  const UPDATED = "25 May 2026";

  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">✈️ {APP_NAME}</Link>
        </div>
      </nav>

      <article className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
          <p className="text-sm text-gray-500">Last updated: {UPDATED}</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">1. Acceptance</h2>
          <p className="text-gray-700 leading-relaxed">
            By creating an account or using {APP_NAME} (&ldquo;the Service&rdquo;), you agree to
            these Terms of Service. If you do not agree, please do not use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">2. The Service</h2>
          <p className="text-gray-700 leading-relaxed">
            {APP_NAME} is a group holiday planning tool. It helps groups coordinate
            availability, compare flights from multiple departure cities, vote on
            destinations, and organise the booking process. The Service is provided
            free of charge for personal, non-commercial use.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Flight prices, accommodation estimates, and cost breakdowns are indicative only.
            Actual prices may differ. We are not a travel agent, booking platform, or
            financial adviser. All bookings must be made directly with airlines or
            accommodation providers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">3. Your account</h2>
          <p className="text-gray-700 leading-relaxed">
            You must sign in with a valid Google account. You are responsible for
            maintaining the security of your account and for all activity that occurs
            under it. You must be at least 16 years old to use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">4. Acceptable use</h2>
          <p className="text-gray-700 leading-relaxed">You agree not to:</p>
          <ul className="list-disc ml-6 space-y-2 text-gray-700">
            <li>Use the Service for any unlawful purpose.</li>
            <li>Attempt to gain unauthorised access to other users&apos; data.</li>
            <li>Abuse the Service in a way that disrupts its availability for others.</li>
            <li>Submit false or misleading information.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">5. Disclaimer of warranties</h2>
          <p className="text-gray-700 leading-relaxed">
            The Service is provided &ldquo;as is&rdquo; without warranty of any kind. We do not
            guarantee that flight price data is accurate, up-to-date, or complete. We are
            not responsible for any financial loss arising from reliance on information
            provided by the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">6. Limitation of liability</h2>
          <p className="text-gray-700 leading-relaxed">
            To the maximum extent permitted by applicable law, we shall not be liable
            for any indirect, incidental, special, or consequential damages arising out
            of or in connection with your use of the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">7. Third-party services</h2>
          <p className="text-gray-700 leading-relaxed">
            The Service uses Google OAuth for authentication. Your use of Google services
            is subject to{" "}
            <a
              href="https://policies.google.com/terms"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google&apos;s Terms of Service
            </a>. Affiliate links to booking sites may earn us a small commission at no
            extra cost to you.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">8. Termination</h2>
          <p className="text-gray-700 leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these
            terms. You may delete your account at any time by contacting us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">9. Governing law</h2>
          <p className="text-gray-700 leading-relaxed">
            These terms are governed by the laws of England and Wales. Any disputes
            shall be subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">10. Changes</h2>
          <p className="text-gray-700 leading-relaxed">
            We may update these terms at any time. Continued use of the Service after
            changes are posted constitutes acceptance of the updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">11. Contact</h2>
          <p className="text-gray-700 leading-relaxed">
            Questions about these terms?{" "}
            <a href={`mailto:${CONTACT}`} className="text-blue-600 hover:underline">{CONTACT}</a>
          </p>
        </section>
      </article>

      <footer className="border-t mt-16 py-8 text-center text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600">← Back to {APP_NAME}</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-gray-600">Privacy Policy</Link>
      </footer>
    </main>
  );
}
