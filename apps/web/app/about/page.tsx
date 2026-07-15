import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Group Holiday Booking",
  description: "What Group Holiday Booking is and how it helps groups plan trips together.",
};

export default function AboutPage() {
  const APP_NAME = "Group Holiday Booking";
  const CONTACT = "hello@groupholidaybooking.com";

  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">✈️ {APP_NAME}</Link>
        </div>
      </nav>

      <article className="mx-auto max-w-2xl px-6 py-12 space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">About {APP_NAME}</h1>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">What we do</h2>
          <p className="text-gray-700 leading-relaxed">
            {APP_NAME} helps groups of friends and family plan a trip together without the
            endless group chat. Everyone lives in different places, has different dates free,
            and a different budget — we bring it all into one place so the group can actually
            agree on a holiday and go.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">How it works</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-700 leading-relaxed">
            <li>
              <strong>Find when everyone&apos;s free</strong> — members mark their availability
              (or sync a calendar) and we find the windows that suit the whole group.
            </li>
            <li>
              <strong>Agree the trip</strong> — set durations and budgets, then vote on
              destinations together or let the AI suggest one based on everyone&apos;s preferences.
            </li>
            <li>
              <strong>Compare the real cost</strong> — we compare flights from every airport
              each member can reach and show the lowest total cost for the group.
            </li>
            <li>
              <strong>Meet-up mode</strong> — the same idea works for a local get-together:
              find a time that suits everyone, down to the minute.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Our story</h2>
          <p className="text-gray-700 leading-relaxed">
            {APP_NAME} was started by a UK university student after his own friends struggled to
            book a group holiday. It&apos;s built to be genuinely useful and to show the honest,
            cheapest way to travel — we don&apos;t add mark-ups to prices.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Get in touch</h2>
          <p className="text-gray-700 leading-relaxed">
            Questions, feedback, or partnership enquiries? See our{" "}
            <Link href="/contact" className="text-blue-600 hover:underline">contact page</Link> or
            email <a href={`mailto:${CONTACT}`} className="text-blue-600 hover:underline">{CONTACT}</a>.
          </p>
        </section>
      </article>

      <footer className="mt-16 border-t py-8 text-center text-sm text-gray-400">
        <Link href="/" className="hover:text-gray-600">← Back to {APP_NAME}</Link>
        {" · "}
        <Link href="/contact" className="hover:text-gray-600">Contact</Link>
        {" · "}
        <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
        {" · "}
        <Link href="/terms" className="hover:text-gray-600">Terms</Link>
      </footer>
    </main>
  );
}
