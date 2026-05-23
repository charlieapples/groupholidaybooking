"use client";

/**
 * Lightweight toast notification system.
 *
 * Usage:
 *   import { useToast } from "@/components/Toast";
 *   const { toast } = useToast();
 *   toast.success("Invite link copied!");
 *   toast.error("Something went wrong");
 *   toast.info("Saved");
 *
 * Wrap your app (or page) in <ToastProvider> once. Toasts auto-dismiss after 4s.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<{ toast: ToastApi } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    // Auto-dismiss after 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const toast: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) =>
        setToasts((prev) => prev.filter((t) => t.id !== id))
      } />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in on next frame
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const styles = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-gray-900 text-white",
  }[item.kind];

  const icon = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  }[item.kind];

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg transition-all duration-200 ${styles} ${
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <p className="flex-1 text-sm font-medium">{item.message}</p>
      <button
        onClick={onDismiss}
        className="text-white/70 hover:text-white text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Helper to get a user-friendly error message from an unknown thrown value.
 * Use in catch blocks: `toast.error(errorMessage(e))`
 */
export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}
