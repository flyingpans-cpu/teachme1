"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type SetupLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
type SetupDays = 3 | 5 | 7;
type SetupMinutes = 15 | 30 | 45 | 60;

type SetupState = {
  topic: string;
  daysPerWeek?: SetupDays;
  minutesPerDay?: SetupMinutes;
  level?: SetupLevel;
};

type TutorSessionState = {
  stage?: "confirm" | "generated";
  captured?: {
    topic?: string;
    level?: SetupLevel;
    hoursPerWeek?: number;
    sessionsPerWeek?: number;
    preferredSessionLengthMinutes?: number;
  };
  lessonState?: {
    dayIndex: number;
    phase: "initial" | "afterCheckpoint1" | "afterCheckpoint2";
    awaitingResponse: boolean;
  };
};

type AppPhase = "setup" | "chat";

const STORAGE_KEY = "teachme:tutor-state";
const dayOptions: SetupDays[] = [3, 5, 7];
const minuteOptions: SetupMinutes[] = [15, 30, 45, 60];
const levelOptions: Array<{ label: string; value: SetupLevel }> = [
  { label: "Beginner", value: "BEGINNER" },
  { label: "Medium", value: "INTERMEDIATE" },
  { label: "Advanced", value: "ADVANCED" },
];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildConfirmationMessage(setup: Required<SetupState>) {
  const levelLabel =
    setup.level === "INTERMEDIATE"
      ? "Medium"
      : setup.level === "BEGINNER"
        ? "Beginner"
        : "Advanced";

  return [
    `I’m ready to build your plan for ${setup.topic}.`,
    `Commitment: ${setup.daysPerWeek} days each week`,
    `Session length: ${setup.minutesPerDay} minutes per day`,
    `Level: ${levelLabel}`,
    "",
    "Reply `yes` to generate your 5-week course, or press `New chat` to change your setup.",
  ].join("\n");
}

function buildCapturedState(setup: Required<SetupState>): NonNullable<TutorSessionState["captured"]> {
  return {
    topic: setup.topic,
    level: setup.level,
    sessionsPerWeek: setup.daysPerWeek,
    preferredSessionLengthMinutes: setup.minutesPerDay,
    hoursPerWeek: (setup.daysPerWeek * setup.minutesPerDay) / 60,
  };
}

function ChipButton<T extends string | number>(props: {
  label: string;
  value: T;
  selected?: boolean;
  onSelect: (value: T) => void;
}) {
  const { label, value, selected, onSelect } = props;

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
        selected
          ? "border-black bg-black text-white"
          : "border-black/10 bg-white text-black/75 hover:border-black/30"
      }`}
    >
      {label}
    </button>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("setup");
  const [setup, setSetup] = useState<SetupState>({ topic: "" });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionState, setSessionState] = useState<TutorSessionState>({});
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        phase?: AppPhase;
        setup?: SetupState;
        messages?: ChatMessage[];
        sessionState?: TutorSessionState;
      };
      if (parsed.phase) setPhase(parsed.phase);
      if (parsed.setup) setSetup(parsed.setup);
      if (parsed.messages) setMessages(parsed.messages);
      if (parsed.sessionState) setSessionState(parsed.sessionState);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ phase, setup, messages, sessionState }),
    );
  }, [phase, setup, messages, sessionState]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const canStart = useMemo(() => {
    return (
      setup.topic.trim().length >= 3 &&
      Boolean(setup.daysPerWeek) &&
      Boolean(setup.minutesPerDay) &&
      Boolean(setup.level)
    );
  }, [setup]);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const handleStart = () => {
    if (!canStart) return;

    const completeSetup = {
      topic: setup.topic.trim(),
      daysPerWeek: setup.daysPerWeek as SetupDays,
      minutesPerDay: setup.minutesPerDay as SetupMinutes,
      level: setup.level as SetupLevel,
    };

    setPhase("chat");
    setError(null);
    setSessionState({
      stage: "confirm",
      captured: buildCapturedState(completeSetup),
    });
    setMessages([
      {
        id: createId(),
        role: "assistant",
        content: buildConfirmationMessage(completeSetup),
      },
    ]);
  };

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

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content:
            data.assistantMessage ??
            "I didn’t catch that. Could you rephrase your last message?",
        },
      ]);

      if (data.sessionState) {
        setSessionState(data.sessionState);
      }
    } catch (cause) {
      console.error(cause);
      setError("Something went wrong while contacting the tutor. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPhase("setup");
    setSetup({ topic: "" });
    setMessages([]);
    setSessionState({});
    setInput("");
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
              Build a 5-week study plan before you enter the tutor chat.
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
        {phase === "setup" ? (
          <section className="rounded-3xl bg-[var(--surface)] p-6 shadow-[0_20px_60px_var(--shadow)] ring-1 ring-black/5 sm:p-8">
            <div className="max-w-3xl space-y-8">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-dark)]">
                  Setup
                </p>
                <h1 className="text-3xl font-semibold tracking-tight text-black sm:text-4xl">
                  Set your study rhythm before the tutor starts.
                </h1>
                <p className="max-w-2xl text-sm text-black/60 sm:text-base">
                  Pick a commitment that fits your week. The tutor will use it to
                  generate a 5-week course that matches your actual schedule.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="topic"
                    className="text-xs font-semibold uppercase tracking-wide text-black/60"
                  >
                    What do you want to learn?
                  </label>
                  <input
                    id="topic"
                    value={setup.topic}
                    onChange={(event) =>
                      setSetup((current) => ({ ...current, topic: event.target.value }))
                    }
                    placeholder="Examples: Vibecode, calculus, sourdough, planets..."
                    className="block w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black shadow-sm outline-none transition focus:border-black/30 focus:ring-2 focus:ring-black/10"
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-black/60">
                    1. How many days do you want to commit to?
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {dayOptions.map((days) => (
                      <ChipButton
                        key={days}
                        label={`${days} days`}
                        value={days}
                        selected={setup.daysPerWeek === days}
                        onSelect={(value) =>
                          setSetup((current) => ({ ...current, daysPerWeek: value }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-black/60">
                    2. How many minutes per day?
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {minuteOptions.map((minutes) => (
                      <ChipButton
                        key={minutes}
                        label={`${minutes} min`}
                        value={minutes}
                        selected={setup.minutesPerDay === minutes}
                        onSelect={(value) =>
                          setSetup((current) => ({ ...current, minutesPerDay: value }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-black/60">
                    3. What level are you?
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {levelOptions.map((level) => (
                      <ChipButton
                        key={level.value}
                        label={level.label}
                        value={level.value}
                        selected={setup.level === level.value}
                        onSelect={(value) =>
                          setSetup((current) => ({ ...current, level: value }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-black/55">
                  Your tutor will confirm these choices in chat before generating the
                  course.
                </p>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart}
                  className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-black/90 disabled:cursor-not-allowed disabled:bg-black/40"
                >
                  Start learning
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl bg-[var(--surface)] p-5 shadow-[0_20px_60px_var(--shadow)] ring-1 ring-black/5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-black">
                  AI Tutor Chat
                </h1>
                <p className="text-sm text-black/60">
                  Confirm your setup, then the tutor will generate the full plan and
                  begin the first lesson.
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
                    Tutor is thinking...
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
                <label
                  htmlFor="chat-input"
                  className="text-xs font-semibold uppercase tracking-wide text-black/60"
                >
                  Your message
                </label>
                <textarea
                  id="chat-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={3}
                  placeholder="Reply yes to generate, or continue the lesson..."
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
        )}
      </main>
    </div>
  );
}
