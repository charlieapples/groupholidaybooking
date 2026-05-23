/**
 * Loading skeletons — visual placeholders that mirror the shape of the
 * content they're replacing. Less jarring than a centred spinner.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 ${className}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton mimicking a card with a title and a couple of detail lines. */
export function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

/** Skeleton mimicking the dashboard room grid (2 columns of cards). */
export function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-xl font-bold text-blue-600">✈️ Group Holiday</span>
          <Skeleton className="h-5 w-24" />
        </div>
      </nav>
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </main>
  );
}

/** Full-page centered spinner — for non-list pages where a skeleton doesn't make sense. */
export function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}
