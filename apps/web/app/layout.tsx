import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Group Holiday Booking",
  description:
    "Plan group holidays from multiple UK cities — cheapest flights, agreed dates, destination voting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
