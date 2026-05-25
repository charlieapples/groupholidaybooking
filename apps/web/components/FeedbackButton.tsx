"use client";

/**
 * Floating feedback button — renders in the bottom-right corner of any page.
 * Clicking opens a small modal with a 1-5 star rating and optional comment.
 *
 * Usage:
 *   <FeedbackButton token={token} page="dashboard" />
 *   <FeedbackButton token={token} page="flights" roomSlug={slug} />
 */

import { useState } from "react";
import { submitFeedback } from "@/lib/api";

interface Props {
  token: string | null;
  page?: string;
  roomSlug?: string;
}

export default function FeedbackButton({ token, page, roomSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) return null;

  async function handleSubmit() {
    if (!token || rating === 0) return;
    setSending(true);
    try {
      await submitFeedback(token, {
        rating,
        comment: comment.trim() || undefined,
        page,
        room_slug: roomSlug,
      });
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setRating(0);
        setComment("");
      }, 1800);
    } catch {
      // Silent fail — feedback is non-critical
    } finally {
      setSending(false);
    }
  }

  const displayRating = hovered || rating;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-1.5 rounded-full bg-white border border-gray-200 shadow-md px-3.5 py-2 text-xs font-medium text-gray-600 hover:shadow-lg hover:border-blue-300 hover:text-blue-700 transition-all"
        aria-label="Give feedback"
      >
        <span>⭐</span>
        <span>Feedback</span>
      </button>

      {/* Modal backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-start p-6 sm:items-center sm:justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl border bg-white shadow-xl p-6 space-y-4">
            {done ? (
              <div className="text-center py-4 space-y-2">
                <div className="text-4xl">🙏</div>
                <p className="font-semibold text-gray-900">Thanks for the feedback!</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">How&apos;s it going?</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Star rating */}
                <div className="flex gap-1 justify-center py-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setHovered(star)}
                      onMouseLeave={() => setHovered(0)}
                      onClick={() => setRating(star)}
                      className="text-3xl transition-transform hover:scale-110"
                      aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                    >
                      {star <= displayRating ? "⭐" : "☆"}
                    </button>
                  ))}
                </div>

                {/* Optional comment */}
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Anything you'd like to add? (optional)"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none"
                />

                <button
                  onClick={handleSubmit}
                  disabled={rating === 0 || sending}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {sending ? "Sending…" : "Send feedback"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
