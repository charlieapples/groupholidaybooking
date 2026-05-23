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
};

export default nextConfig;
