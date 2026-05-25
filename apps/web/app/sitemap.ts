import type { MetadataRoute } from "next";

/**
 * sitemap.ts — Next.js 15 metadata route.
 * Generated at: GET /sitemap.xml
 *
 * Only includes the public landing page.  Individual trip results pages are
 * public but not enumerated here (they'd be discovered via social sharing).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://groupholidaybooking.com";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
