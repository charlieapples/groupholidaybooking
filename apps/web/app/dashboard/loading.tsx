/**
 * Route-level loading UI for /dashboard — uses the same skeleton
 * the page itself shows, so the transition from click to render
 * is seamless.
 */
import { DashboardSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <DashboardSkeleton />;
}
