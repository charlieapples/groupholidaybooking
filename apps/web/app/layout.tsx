import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://groupholidaybooking.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Group Holiday Booking — plan your trip together",
    template: "%s | Group Holiday Booking",
  },
  description:
    "Plan group holidays from multiple UK cities — find free windows, compare flights from everyone's nearest airport, vote on destinations, and book at the lowest group cost.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Group Holiday Booking — plan your trip together",
    description: "Find when everyone is free, pick a destination together, and book the cheapest flights.",
    type: "website",
    url: APP_URL,
    siteName: "Group Holiday Booking",
    images: [{ url: "/logo.jpg", width: 120, height: 120 }],
  },
  twitter: {
    card: "summary",
    title: "Group Holiday Booking — plan your trip together",
    description: "Find when everyone is free, pick a destination together, and book the cheapest flights.",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.svg",
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
