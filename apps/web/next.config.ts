import type { NextConfig } from "next";

// Ensure the API URL always has a protocol (guards against env vars set without https://)
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const apiUrl = rawApiUrl.startsWith("http") ? rawApiUrl : `https://${rawApiUrl}`;

const nextConfig: NextConfig = {
  async rewrites() {
    // In development, proxy /api/* to FastAPI running on localhost:8000
    // In production, NEXT_PUBLIC_API_URL points to Railway
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
  async redirects() {
    // Send the auto-assigned Vercel preview domain to the real domain so it
    // isn't a duplicate public site (bad for SEO) and to avoid the www/non-www
    // auth/session mismatches that the canonical domain is configured for.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "groupholidaybooking.vercel.app" }],
        destination: "https://groupholidaybooking.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
