"use client";

import { useEffect, useRef, useState } from "react";

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

function buildCapturedState(setup: Required<SetupState>): NonNullable<TutorSessionState["captured"]> {
  return {
    topic: setup.topic,
    level: setup.level,
    sessionsPerWeek: setup.daysPerWeek,
    preferredSessionLengthMinutes: setup.minutesPerDay,
    hoursPerWeek: (setup.daysPerWeek * setup.minutesPerDay) / 60,
  };
}

function formatMessage(message: string) {
  return message
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
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
          ? "border-white/70 bg-white text-black"
          : "border-white/12 bg-white/6 text-white/78 hover:border-white/24 hover:bg-white/10"
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

  const canStart =
    setup.topic.trim().length >= 3 &&
    Boolean(setup.daysPerWeek) &&
    Boolean(setup.minutesPerDay) &&
    Boolean(setup.level);

  const canSend = input.trim().length > 0 && !isSending;

  async function requestTutor(nextMessages: ChatMessage[], nextState: TutorSessionState) {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        sessionState: nextState,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Tutor is unavailable. Please try again.");
    }

    return (await response.json()) as {
      assistantMessage?: string;
      sessionState?: TutorSessionState;
    };
  }

  const handleStart = async () => {
    if (!canStart || isSending) return;

    const completeSetup = {
      topic: setup.topic.trim(),
      daysPerWeek: setup.daysPerWeek as SetupDays,
      minutesPerDay: setup.minutesPerDay as SetupMinutes,
      level: setup.level as SetupLevel,
    };

    const nextState: TutorSessionState = {
      stage: "confirm",
      captured: buildCapturedState(completeSetup),
    };

    setPhase("chat");
    setMessages([]);
    setSessionState(nextState);
    setError(null);
    setIsSending(true);

    try {
      const data = await requestTutor([], nextState);
      setMessages([
        {
          id: createId(),
          role: "assistant",
          content: formatMessage(
            data.assistantMessage ?? "I couldn't generate your course.",
          ),
        },
      ]);
      if (data.sessionState) {
        setSessionState(data.sessionState);
      }
    } catch (cause) {
      console.error(cause);
      setError("Something went wrong while generating the course. Please try again.");
    } finally {
      setIsSending(false);
    }
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
      const data = await requestTutor(outgoingMessages, sessionState);
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: formatMessage(
            data.assistantMessage ??
              "I didn’t catch that. Could you rephrase your last message?",
          ),
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
    setIsSending(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-white/8 bg-black/10 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/92">
              TeachMe Tutor
            </span>
            <p className="text-sm text-white/52">
              Learn in a paced, text-first flow.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/72 transition hover:border-white/22 hover:bg-white/10"
          >
            New chat
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
        {phase === "setup" ? (
          <section className="rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-6 py-7 shadow-[0_30px_120px_rgba(0,0,0,0.35)] sm:px-8 sm:py-10">
            <div className="max-w-4xl space-y-10">
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/44">
                  Course Setup
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Choose the topic, pace, and level. The tutor will start generating immediately.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-white/58">
                  No confirmation step. Once your setup is complete, the course outline
                  and first lesson will appear directly in the reading view.
                </p>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <label
                    htmlFor="topic"
                    className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42"
                  >
                    Topic
                  </label>
                  <input
                    id="topic"
                    value={setup.topic}
                    onChange={(event) =>
                      setSetup((current) => ({ ...current, topic: event.target.value }))
                    }
                    placeholder="Examples: vibecode, memory systems, sourdough..."
                    className="block w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-lg text-white shadow-sm outline-none transition placeholder:text-white/25 focus:border-white/22 focus:bg-white/[0.06]"
                  />
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">
                    1. How many days you want to commit to
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

                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">
                    2. How many minutes per day
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

                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">
                    3. What level are you
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

              <div className="border-t border-white/8 pt-6">
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={!canStart || isSending}
                  className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/20 disabled:text-white/40"
                >
                  {isSending ? "Generating..." : "Start learning"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-white/8 bg-[linear-gradient(90deg,rgba(255,255,255,0.018)_0%,rgba(255,255,255,0.005)_8%,rgba(255,255,255,0.018)_16%,rgba(255,255,255,0.005)_24%,rgba(255,255,255,0.018)_32%,rgba(255,255,255,0.005)_40%,rgba(255,255,255,0.018)_48%,rgba(255,255,255,0.005)_56%,rgba(255,255,255,0.018)_64%,rgba(255,255,255,0.005)_72%,rgba(255,255,255,0.018)_80%,rgba(255,255,255,0.005)_88%,rgba(255,255,255,0.018)_100%)] px-6 py-7 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:px-8 sm:py-10">
            <div className="mb-8 border-b border-white/8 pb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/44">
                Generated Session
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Your tutor is writing directly into the lesson view.
              </h1>
            </div>

            <div className="space-y-10">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`${
                    message.role === "assistant"
                      ? "border-b border-white/8 pb-10 text-white/82"
                      : "ml-auto max-w-3xl rounded-3xl border border-white/10 bg-white/8 px-5 py-4 text-white"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <div className="max-w-5xl whitespace-pre-wrap text-[1.05rem] leading-10 sm:text-[1.15rem]">
                      {message.content}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-base leading-8">{message.content}</p>
                  )}
                </article>
              ))}

              {isSending ? (
                <div className="border-b border-white/8 pb-10 text-[1.05rem] leading-10 text-white/55 sm:text-[1.15rem]">
                  Writing the next part of your lesson...
                </div>
              ) : null}

              <div ref={endRef} />
            </div>

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-8 border-t border-white/8 pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="chat-input"
                    className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42"
                  >
                    Continue the conversation
                  </label>
                  <textarea
                    id="chat-input"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    rows={3}
                    placeholder="Share your result, ask a question, or say what happened..."
                    className="mt-2 block w-full rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-4 text-base text-white outline-none transition placeholder:text-white/25 focus:border-white/22 focus:bg-white/[0.06]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend}
                  className="inline-flex items-center justify-center rounded-full border border-white/14 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/20 disabled:text-white/40"
                >
                  Send
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
