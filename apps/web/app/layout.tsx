import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: {
    default: "✈️ Group Holiday — sort your trip together",
    template: "%s | Group Holiday",
  },
  description:
    "Plan group holidays from multiple UK cities — find free windows, compare flights from everyone's nearest airport, vote on destinations, and book at the lowest group cost.",
  openGraph: {
    title: "Group Holiday — sort your trip together",
    description: "Find when everyone is free, pick a destination together, and book the cheapest flights.",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

// Next.js 15 — themeColor belongs in viewport, not metadata
export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className="min-h-screen antialiased bg-gray-50 text-gray-900">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
