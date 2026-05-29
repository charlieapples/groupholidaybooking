/**
 * Route-level loading UI shown by Next.js while the server component
 * for /room/[slug]/* is streaming. Removes the brief blank screen
 * between clicking a link and the page rendering its own loading state.
 */
import { PageSpinner } from "@/components/Skeleton";

export default function Loading() {
  return <PageSpinner />;
}
