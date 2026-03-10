"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  courseId?: string;
  captured?: {
    topic?: string;
    level?: SetupLevel;
    hoursPerWeek?: number;
    sessionsPerWeek?: number;
    preferredSessionLengthMinutes?: number;
  };
  progress?: {
    courseId?: string;
    currentDayIndex: number;
    currentPhase: "initial" | "afterCheckpoint1" | "afterCheckpoint2";
    completedDayIndices: number[];
    totalDays: number;
    lastViewedAt: string;
  };
  lessonState?: {
    dayIndex: number;
    phase: "initial" | "afterCheckpoint1" | "afterCheckpoint2";
    awaitingResponse: boolean;
  };
};

type AppPhase = "setup" | "chat";
type TutorAction = "mark_complete";

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

function formatLevel(level?: SetupLevel) {
  if (level === "BEGINNER") return "Beginner";
  if (level === "INTERMEDIATE") return "Medium";
  if (level === "ADVANCED") return "Advanced";
  return "";
}

function MarkdownLesson(props: { content: string }) {
  const { content } = props;

  return (
    <div className="markdown-lesson">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-12 text-4xl font-semibold tracking-[-0.04em] text-white first:mt-0 sm:text-5xl lg:text-6xl">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-14 border-t border-white/10 pt-10 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-10 text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-8 text-xl font-semibold tracking-[-0.02em] text-white/94">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="mt-5 text-lg leading-9 text-white/78 first:mt-0 sm:text-[1.22rem] sm:leading-10">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="mt-5 space-y-3 pl-6 text-[1.04rem] leading-9 text-white/76 marker:text-cyan-200/80 sm:text-lg">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-5 space-y-3 pl-6 text-[1.04rem] leading-9 text-white/76 marker:text-cyan-200/80 sm:text-lg">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-2">{children}</li>,
          hr: () => <hr className="my-12 border-white/10" />,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          em: ({ children }) => <em className="italic text-white/88">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-3xl border border-white/10 bg-black/40 px-5 py-4 font-mono text-sm text-cyan-100">
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded-lg border border-white/8 bg-white/7 px-1.5 py-0.5 font-mono text-[0.92em] text-cyan-100">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mt-6 overflow-x-auto rounded-3xl border border-white/10 bg-black/40 p-5">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mt-8 rounded-r-3xl border-l-2 border-cyan-200/70 bg-white/[0.03] py-2 pl-5 text-white/68">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mt-8 overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
              <table className="min-w-full border-collapse text-left text-sm text-white/78">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-white/50">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="border-b border-white/8 px-4 py-3 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-t border-white/8 px-4 py-3 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function SegmentButton<T extends string | number>(props: {
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
      className={`group rounded-[1.35rem] border px-4 py-4 text-left transition sm:px-5 ${
        selected
          ? "border-cyan-200/60 bg-white text-slate-950 shadow-[0_20px_50px_rgba(190,242,255,0.2)]"
          : "border-white/10 bg-white/[0.03] text-white/82 hover:border-white/22 hover:bg-white/[0.05]"
      }`}
    >
      <div className="text-sm font-semibold uppercase tracking-[0.18em]">{label}</div>
    </button>
  );
}

function CourseLoader() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(176,230,255,0.09),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-6 py-10 shadow-[0_35px_120px_rgba(0,0,0,0.4)] sm:px-8 sm:py-14">
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/40 to-transparent" />
      <div className="mx-auto max-w-4xl space-y-10">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/55">
            Generating Course
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
            Building Day 1 and shaping the rest of the curriculum in parallel.
          </h1>
          <p className="max-w-2xl text-base leading-8 text-white/58">
            The tutor is drafting the opening lesson first so the app can move faster while the rest of the structure is planned.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
            <div className="h-3 w-32 animate-pulse rounded-full bg-white/12" />
            <div className="h-10 w-full animate-pulse rounded-full bg-white/8" />
            <div className="h-10 w-[82%] animate-pulse rounded-full bg-white/6" />
            <div className="h-px w-full bg-white/8" />
            <div className="h-14 w-[68%] animate-pulse rounded-3xl bg-white/8" />
            <div className="h-14 w-[92%] animate-pulse rounded-3xl bg-white/6" />
            <div className="h-14 w-[76%] animate-pulse rounded-3xl bg-white/8" />
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5">
            <div className="h-4 w-24 animate-pulse rounded-full bg-white/12" />
            <div className="mt-5 h-24 animate-pulse rounded-[1.5rem] bg-white/7" />
            <div className="mt-4 h-24 animate-pulse rounded-[1.5rem] bg-white/5" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProgressHeader(props: {
  progress: NonNullable<TutorSessionState["progress"]>;
  setup: SetupState;
  canMarkComplete: boolean;
  isSending: boolean;
  onMarkComplete: () => void;
}) {
  const { progress, setup, canMarkComplete, isSending, onMarkComplete } = props;
  const completedCount = progress.completedDayIndices.length;
  const progressPercent = Math.max(
    (completedCount / progress.totalDays) * 100,
    (1 / progress.totalDays) * 100,
  );

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:p-6">
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-cyan-200/8 to-transparent" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/38">Current Progress</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
            Day {progress.currentDayIndex} of {progress.totalDays}
          </h2>
          <p className="mt-2 text-sm text-white/52">
            {completedCount} completed{completedCount === 1 ? " day" : " days"} so far · {setup.minutesPerDay ?? 0} min per lesson
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
          <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-white/38">Level</p>
            <p className="mt-2 text-lg font-semibold text-white">{formatLevel(setup.level)}</p>
          </div>
          <button
            type="button"
            onClick={onMarkComplete}
            disabled={!canMarkComplete || isSending}
            className="rounded-2xl border border-cyan-100/20 bg-white px-4 py-3 text-left text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/20 disabled:text-white/40"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-600 disabled:text-white/30">
              Progress
            </p>
            <p className="mt-2 text-lg font-semibold">
              {isSending ? "Updating..." : "Mark lesson completed"}
            </p>
          </button>
        </div>
      </div>
      <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-100 to-sky-300 transition-[width] duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </section>
  );
}

function RevealStep(props: {
  visible: boolean;
  children: ReactNode;
}) {
  const { visible, children } = props;

  if (!visible) return null;

  return <div className="space-y-4">{children}</div>;
}

function SetupScreen(props: {
  setup: SetupState;
  canStart: boolean;
  isSending: boolean;
  onTopicChange: (value: string) => void;
  onDaysChange: (value: SetupDays) => void;
  onMinutesChange: (value: SetupMinutes) => void;
  onLevelChange: (value: SetupLevel) => void;
  onStart: () => void;
}) {
  const {
    setup,
    canStart,
    isSending,
    onTopicChange,
    onDaysChange,
    onMinutesChange,
    onLevelChange,
    onStart,
  } = props;
  const topicReady = setup.topic.trim().length >= 3;
  const daysReady = Boolean(setup.daysPerWeek);
  const minutesReady = Boolean(setup.minutesPerDay);
  const levelReady = Boolean(setup.level);

  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-6 shadow-[0_35px_120px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/38">Start Here</p>
            <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
              Choose the topic and the pacing.
            </h2>
          </div>

          <div className="space-y-3">
            <label htmlFor="topic" className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">
              Topic
            </label>
            <input
              id="topic"
              value={setup.topic}
              onChange={(event) => onTopicChange(event.target.value)}
              placeholder="Examples: vibecode, memory systems, sourdough..."
              className="block w-full rounded-[1.5rem] border border-white/10 bg-black/20 px-5 py-4 text-lg text-white shadow-sm outline-none transition placeholder:text-white/25 focus:border-cyan-100/40 focus:bg-black/30"
            />
          </div>

          <RevealStep visible={topicReady}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">
              1. How many days you want to commit to
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {dayOptions.map((days) => (
                <SegmentButton
                  key={days}
                  label={`${days} days`}
                  value={days}
                  selected={setup.daysPerWeek === days}
                  onSelect={onDaysChange}
                />
              ))}
            </div>
          </RevealStep>

          <RevealStep visible={topicReady && daysReady}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">
              2. How many minutes per day
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {minuteOptions.map((minutes) => (
                <SegmentButton
                  key={minutes}
                  label={`${minutes} min`}
                  value={minutes}
                  selected={setup.minutesPerDay === minutes}
                  onSelect={onMinutesChange}
                />
              ))}
            </div>
          </RevealStep>

          <RevealStep visible={topicReady && daysReady && minutesReady}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/42">3. What level are you</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {levelOptions.map((level) => (
                <SegmentButton
                  key={level.value}
                  label={level.label}
                  value={level.value}
                  selected={setup.level === level.value}
                  onSelect={onLevelChange}
                />
              ))}
            </div>
          </RevealStep>

          <RevealStep visible={topicReady && daysReady && minutesReady && levelReady}>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/38">
                Ready To Generate
              </p>
              <div className="mt-4 grid gap-3 text-sm text-white/58 sm:grid-cols-3">
                <div>
                  <p className="text-white/35">Days</p>
                  <p className="mt-1 text-base font-semibold text-white">{setup.daysPerWeek} per week</p>
                </div>
                <div>
                  <p className="text-white/35">Minutes</p>
                  <p className="mt-1 text-base font-semibold text-white">{setup.minutesPerDay} per day</p>
                </div>
                <div>
                  <p className="text-white/35">Level</p>
                  <p className="mt-1 text-base font-semibold text-white">{formatLevel(setup.level)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-7 text-white/45">
                Generation begins as soon as your setup is complete.
              </p>
              <button
                type="button"
                onClick={onStart}
                disabled={!canStart || isSending}
                className="inline-flex items-center justify-center rounded-full border border-cyan-100/25 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/20 disabled:text-white/40"
              >
                {isSending ? "Generating..." : "Start learning"}
              </button>
            </div>
          </RevealStep>
        </div>
      </div>
    </section>
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
  const canMarkComplete =
    phase === "chat" &&
    Boolean(sessionState.lessonState) &&
    !isSending &&
    !sessionState.progress?.completedDayIndices.includes(
      sessionState.lessonState?.dayIndex ?? -1,
    );

  async function requestTutor(
    nextMessages: ChatMessage[],
    nextState: TutorSessionState,
    action?: TutorAction,
  ) {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        sessionState: nextState,
        action,
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
          content: formatMessage(data.assistantMessage ?? "I couldn't generate your course."),
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
            data.assistantMessage ?? "I didn’t catch that. Could you rephrase your last message?",
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

  const handleMarkComplete = async () => {
    if (!canMarkComplete) return;
    setError(null);
    setIsSending(true);

    try {
      const data = await requestTutor(messages, sessionState, "mark_complete");
      if (data.assistantMessage) {
        const assistantMessage = data.assistantMessage;
        setMessages((current) => [
          ...current,
          {
            id: createId(),
            role: "assistant",
            content: formatMessage(assistantMessage),
          },
        ]);
      }
      if (data.sessionState) {
        setSessionState(data.sessionState);
      }
    } catch (cause) {
      console.error(cause);
      setError("Something went wrong while updating progress. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(140,190,255,0.09),transparent_24%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_22%),linear-gradient(180deg,transparent,rgba(255,255,255,0.02))]" />

      <header className="sticky top-0 z-20 border-b border-white/8 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <span className="rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/92">
              TeachMe
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/72 transition hover:border-white/24 hover:bg-white/[0.08]"
          >
            Reset
          </button>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10 lg:py-12">
        {phase === "setup" ? (
          <SetupScreen
            setup={setup}
            canStart={canStart}
            isSending={isSending}
            onTopicChange={(value) => setSetup((current) => ({ ...current, topic: value }))}
            onDaysChange={(value) => setSetup((current) => ({ ...current, daysPerWeek: value }))}
            onMinutesChange={(value) => setSetup((current) => ({ ...current, minutesPerDay: value }))}
            onLevelChange={(value) => setSetup((current) => ({ ...current, level: value }))}
            onStart={handleStart}
          />
        ) : isSending && messages.length === 0 ? (
          <CourseLoader />
        ) : (
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
            <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] shadow-[0_35px_120px_rgba(0,0,0,0.45)]">
              <div className="border-b border-white/8 px-6 py-5 sm:px-8">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/38">Current Lesson</p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                  {setup.topic.trim() || "Your course"}
                </h1>
              </div>

              <div className="px-6 py-7 sm:px-8 sm:py-8">
                {sessionState.progress ? (
                  <ProgressHeader
                    progress={sessionState.progress}
                    setup={setup}
                    canMarkComplete={canMarkComplete}
                    isSending={isSending}
                    onMarkComplete={handleMarkComplete}
                  />
                ) : null}

                <div className="mt-8 space-y-12">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={message.role === "assistant" ? "border-b border-white/8 pb-12" : "ml-auto max-w-3xl"}
                    >
                      {message.role === "assistant" ? (
                        <div className="max-w-5xl">
                          <MarkdownLesson content={message.content} />
                        </div>
                      ) : (
                        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] px-5 py-4 shadow-[0_20px_50px_rgba(0,0,0,0.2)]">
                          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/38">You</p>
                          <p className="mt-3 whitespace-pre-wrap text-base leading-8 text-white/88">{message.content}</p>
                        </div>
                      )}
                    </article>
                  ))}

                  {isSending ? (
                    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-lg leading-9 text-white/55">
                      Writing the next part of your lesson...
                    </div>
                  ) : null}

                  <div ref={endRef} />
                </div>

                {error ? (
                  <div className="mt-8 rounded-[1.5rem] border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}

                <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-black/15 p-4 sm:p-5">
                  <label htmlFor="chat-input" className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/38">
                    Continue the conversation
                  </label>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <textarea
                      id="chat-input"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      rows={3}
                      placeholder="Share your result, ask a question, or describe what happened..."
                      className="min-h-[132px] flex-1 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-5 py-4 text-base text-white outline-none transition placeholder:text-white/24 focus:border-cyan-100/40 focus:bg-white/[0.05]"
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!canSend}
                      className="inline-flex h-14 items-center justify-center rounded-full border border-cyan-100/20 bg-white px-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-cyan-50 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/20 disabled:text-white/40"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-6 xl:sticky xl:top-24">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_25px_80px_rgba(0,0,0,0.25)]">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-white/38">Study Setup</p>
                <div className="mt-5 grid gap-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white/36">Topic</p>
                    <p className="mt-2 text-lg font-semibold text-white">{setup.topic.trim()}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-white/36">Days</p>
                      <p className="mt-2 text-xl font-semibold text-white">{setup.daysPerWeek}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
                      <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-white/36">Minutes</p>
                      <p className="mt-2 text-xl font-semibold text-white">{setup.minutesPerDay}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/15 px-4 py-3">
                    <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-white/36">Level</p>
                    <p className="mt-2 text-xl font-semibold text-white">{formatLevel(setup.level)}</p>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}
