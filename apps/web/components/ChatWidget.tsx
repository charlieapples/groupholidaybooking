"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "@/lib/api";

interface Message {
  role: "user" | "model";
  content: string;
}

interface ChatWidgetProps {
  token: string;
  roomSlug?: string;
}

export default function ChatWidget({ token, roomSlug }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Persist chat history per-room in sessionStorage so navigating between
  // pages within the same room doesn't lose the conversation.
  const storageKey = roomSlug ? `chat-${roomSlug}` : "chat-global";

  // Load saved messages on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // Corrupt storage — ignore, start fresh
    }
  }, [storageKey]);

  // Save messages whenever they change
  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // Quota exceeded or storage disabled — silently skip
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { reply } = await sendChatMessage(token, text, roomSlug, history);
      setMessages((prev) => [...prev, { role: "model", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "model", content: "Sorry, I couldn't reach the assistant. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl shadow-lg hover:bg-blue-700 transition-colors"
        aria-label="Open holiday assistant"
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Chat panel — full-width on phones, fixed width on tablet+ */}
      {open && (
        <div className="fixed bottom-24 right-3 left-3 z-50 flex flex-col rounded-2xl border bg-white shadow-2xl sm:left-auto sm:right-6 sm:w-96">
          {/* Header */}
          <div className="flex items-center gap-3 rounded-t-2xl bg-blue-600 px-4 py-3">
            <span className="text-xl">✈️</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">Holiday Assistant</p>
              <p className="text-xs text-blue-200">Powered by Gemini</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  setMessages([]);
                  if (typeof window !== "undefined") sessionStorage.removeItem(storageKey);
                }}
                className="text-xs text-blue-200 hover:text-white whitespace-nowrap"
                title="Clear chat history"
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm">
                  Ask me anything about your group holiday!
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {[
                    "What's everyone's availability look like?",
                    "Which destination is cheapest?",
                    "What should we pack for Ibiza?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-left text-gray-600 hover:bg-gray-50 hover:border-blue-300"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-gray-100 px-3 py-2">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t px-3 py-3 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything…"
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
