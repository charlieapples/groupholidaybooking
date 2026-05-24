import type { MetadataRoute } from "next";

/**
 * robots.ts — Next.js 15 metadata route.
 * Generated at: GET /robots.txt
 *
 * Allow indexing of public pages (landing, public results).
 * Disallow auth-gated pages (dashboard, room, profile).
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://groupholidaybooking.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/room/*/results"],
        disallow: ["/dashboard", "/profile", "/room/*/join", "/room/*/availability",
                   "/room/*/preferences", "/room/*/destinations", "/room/*/flights",
                   "/room/*/booking"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
