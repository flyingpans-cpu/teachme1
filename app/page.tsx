"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type TutorSessionState = {
  stage?: "intake" | "confirm" | "generated";
  captured?: {
    topic?: string;
    level?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    priorKnowledge?: string;
    hoursPerWeek?: number;
    sessionsPerWeek?: number;
    preferredSessionLengthMinutes?: number;
    stylePreferences?: {
      morePractice?: boolean;
      moreTheory?: boolean;
      preferReading?: boolean;
      preferVideos?: boolean;
    };
  };
  lessonState?: {
    dayIndex: number;
    phase: "initial" | "afterCheckpoint1" | "afterCheckpoint2";
    awaitingResponse: boolean;
  };
};

const STORAGE_KEY = "teachme:tutor-state";

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultWelcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi, I’m your AI tutor. Tell me what you want to learn, and I’ll design a 5-week plan that fits your schedule.",
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([defaultWelcome]);
  const [sessionState, setSessionState] = useState<TutorSessionState>({
    stage: "intake",
    captured: {},
  });
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        messages?: ChatMessage[];
        sessionState?: TutorSessionState;
      };
      if (parsed.messages?.length) {
        setMessages(parsed.messages);
      }
      if (parsed.sessionState) {
        setSessionState(parsed.sessionState);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages, sessionState }),
    );
  }, [messages, sessionState]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setError(null);
    setIsSending(true);

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    const outgoingMessages = [...messages, userMessage];
    setMessages(outgoingMessages);
    setInput("");

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: outgoingMessages.map(({ role, content }) => ({ role, content })),
          sessionState,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Tutor is unavailable. Please try again.");
      }

      const data = (await response.json()) as {
        assistantMessage?: string;
        sessionState?: TutorSessionState;
      };

      const assistantContent =
        data.assistantMessage ||
        "I didn’t catch that. Could you rephrase your last message?";

      setMessages((current) => [
        ...current,
        { id: createId(), role: "assistant", content: assistantContent },
      ]);
      if (data.sessionState) {
        setSessionState(data.sessionState);
      }
    } catch (cause) {
      console.error(cause);
      setError(
        "Something went wrong while contacting the tutor. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMessages([defaultWelcome]);
    setSessionState({ stage: "intake", captured: {} });
    setError(null);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-black px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              TeachMe Tutor
            </span>
            <p className="text-sm text-black/60">
              Chat your way to a 5-week learning plan.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/70 transition hover:border-black/30"
          >
            New chat
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <section className="rounded-3xl bg-[var(--surface)] p-5 shadow-[0_20px_60px_var(--shadow)] ring-1 ring-black/5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-black">
                AI Tutor Chat
              </h1>
              <p className="text-sm text-black/60">
                Answer the tutor’s questions. It will build your plan and lessons in chat.
              </p>
            </div>
            <div className="hidden rounded-full bg-[var(--surface-strong)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black/70 sm:inline-flex">
              Time-boxed
            </div>
          </div>

          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-white text-black/80"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isSending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-black/60">
                  Tutor is thinking…
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="chat-input" className="text-xs font-semibold uppercase tracking-wide text-black/60">
                Your message
              </label>
              <textarea
                id="chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={3}
                placeholder="Tell me what you want to learn..."
                className="mt-1 block w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black shadow-sm outline-none transition focus:border-black/30 focus:ring-2 focus:ring-black/10"
              />
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-black/40"
            >
              Send
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
