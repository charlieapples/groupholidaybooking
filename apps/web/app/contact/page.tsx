import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | Group Holiday Booking",
  description: "How to get in touch with Group Holiday Booking.",
};

export default function ContactPage() {
  const APP_NAME = "Group Holiday Booking";
  const GENERAL = "hello@groupholidaybooking.com";
  const PRIVACY = "privacy@groupholidaybooking.com";

  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">✈️ {APP_NAME}</Link>
        </div>
      </nav>

      <article className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">Contact us</h1>
          <p className="text-gray-600">We&apos;d love to hear from you.</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">General &amp; support</h2>
          <p className="text-gray-700 leading-relaxed">
            For questions, feedback, or help using {APP_NAME}, email{" "}
            <a href={`mailto:${GENERAL}`} className="text-blue-600 hover:underline">{GENERAL}</a>.
            You can also use the in-app feedback button on any page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Partnerships</h2>
          <p className="text-gray-700 leading-relaxed">
            For affiliate, travel-provider, or business enquiries, email{" "}
            <a href={`mailto:${GENERAL}`} className="text-blue-600 hover:underline">{GENERAL}</a>.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Privacy &amp; data</h2>
          <p className="text-gray-700 leading-relaxed">
            For privacy requests or data questions, email{" "}
            <a href={`mailto:${PRIVACY}`} className="text-blue-600 hover:underline">{PRIVACY}</a>.
            See our{" "}
            <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>{" "}
            for details.
          </p>
        </section>
      </article>

      <footer className="mt-16 border-t py-8 text-center text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600">← Back to {APP_NAME}</Link>
        {" · "}
        <Link href="/about" className="hover:text-gray-600">About</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-gray-600">Terms</Link>
      </footer>
    </main>
  );
}
