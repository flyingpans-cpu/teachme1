import OpenAI from "openai";
import type { CourseRequestInput, GeneratedCourse } from "./courseSchema";
import type { AllocatedSession } from "./timeAllocation";

const model = process.env.OPENAI_MODEL ?? "gpt-5.2-mini";

export type TutorIntakeResult = {
  assistantMessage: string;
  captured: Partial<CourseRequestInput>;
  stage: "intake" | "confirm" | "generated";
  readyToGenerate: boolean;
};

export type LessonPhase = "initial" | "afterCheckpoint1" | "afterCheckpoint2";

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function extractJson(raw: string) {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  return jsonStart >= 0 && jsonEnd >= jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : raw;
}

export async function runTutorIntakeWithLLM(options: {
  userMessage: string;
  captured: Partial<CourseRequestInput>;
}): Promise<TutorIntakeResult> {
  const { userMessage, captured } = options;
  const client = getOpenAIClient();

  const systemPrompt = [
    "You are a concise AI tutor intake assistant.",
    "Goal: collect the learner's preferences in this exact order:",
    "1) topic",
    "2) level (BEGINNER | INTERMEDIATE | ADVANCED)",
    "3) priorKnowledge (optional)",
    "4) hoursPerWeek (number)",
    "5) sessionsPerWeek (number)",
    "6) preferredSessionLengthMinutes (number)",
    "7) stylePreferences (morePractice, moreTheory, preferReading, preferVideos)",
    "",
    "Rules:",
    "- Ask only for the next missing item in order.",
    "- If all required items are present, summarize and ask for confirmation.",
    "- If the user confirms, set readyToGenerate=true and stage=\"generated\".",
    "- Keep responses short and friendly.",
    "- Always respond with ONLY minified JSON matching the schema below.",
    "",
    "Output JSON schema:",
    "{",
    '  "assistantMessage": string,',
    '  "captured": {',
    '    "topic"?: string,',
    '    "level"?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED",',
    '    "priorKnowledge"?: string,',
    '    "hoursPerWeek"?: number,',
    '    "sessionsPerWeek"?: number,',
    '    "preferredSessionLengthMinutes"?: number,',
    '    "stylePreferences"?: {',
    '      "morePractice"?: boolean,',
    '      "moreTheory"?: boolean,',
    '      "preferReading"?: boolean,',
    '      "preferVideos"?: boolean',
    "    }",
    "  },",
    '  "stage": "intake" | "confirm" | "generated",',
    '  "readyToGenerate": boolean',
    "}",
  ].join("\n");

  const userPrompt = [
    "Current captured values:",
    JSON.stringify(captured),
    "",
    "Latest user message:",
    userMessage,
  ].join("\n");

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  if (!raw) {
    throw new Error("Empty response from intake LLM");
  }

  return JSON.parse(extractJson(raw)) as TutorIntakeResult;
}

export async function generateCourseOutlineWithLLM(options: {
  topic: string;
  level?: string;
  priorKnowledge?: string;
  styleSummary: string;
  sessions: AllocatedSession[];
  minutesPerWeek: number;
}): Promise<GeneratedCourse> {
  const { topic, level, priorKnowledge, styleSummary, sessions, minutesPerWeek } =
    options;

  const client = getOpenAIClient();

  const skeletonDescription = sessions
    .map(
      (session) =>
        `Week ${session.weekIndex}, session ${session.sessionIndex}: ${session.targetMinutes} minutes`,
    )
    .join("\n");

  const instructions = [
    "You are an expert instructional designer creating a 5-week course outline.",
    "",
    "You will receive:",
    "- Topic and learner level",
    "- Optional prior knowledge notes",
    "- A fixed schedule skeleton listing each session with exact minutes",
    "- Style preferences summary",
    "",
    "Your task:",
    "- Produce a coherent 5-week outline that strictly respects the schedule.",
    "- Do NOT change the target minutes in the skeleton.",
    "- Provide week titles and summaries and session titles/objectives.",
    "- Do NOT include quizzes or external links.",
    "- Keep contentBlocks empty arrays ([]).",
    "",
    "Output JSON format:",
    "{",
    '  "courseTitle": string,',
    '  "overview": string,',
    '  "weeks": Array<{',
    '    "weekIndex": number,',
    '    "title": string,',
    '    "summary": string,',
    '    "targetMinutes": number,',
    '    "sessions": Array<{',
    '      "weekIndex": number,',
    '      "sessionIndex": number,',
    '      "title": string,',
    '      "objective": string,',
    '      "estimatedMinutes": number,',
    '      "activityType": "READING" | "PRACTICE" | "MIXED",',
    '      "targetMinutes": number,',
    '      "contentBlocks": []',
    "    }>",
    "  }>",
    "}",
    "",
    "Important time rules:",
    "- For each session, set estimatedMinutes equal to targetMinutes in the skeleton.",
    "- For each week, targetMinutes equals sum of its sessions.",
    "- Total minutes must equal 5 * minutesPerWeek.",
    "",
    "Respond with ONLY minified JSON.",
  ].join("\n");

  const userContent = [
    `Topic: ${topic}`,
    level ? `Level: ${level}` : undefined,
    priorKnowledge ? `Prior knowledge: ${priorKnowledge}` : undefined,
    "",
    `Target minutes per week: ${minutesPerWeek}`,
    "",
    "Schedule skeleton:",
    skeletonDescription,
    "",
    `Style preferences: ${styleSummary || "none specified"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: userContent },
    ],
    temperature: 0.6,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  if (!raw) {
    throw new Error("Empty response from outline LLM");
  }

  return JSON.parse(extractJson(raw)) as GeneratedCourse;
}

export async function generateLessonChunkWithLLM(options: {
  topic: string;
  level?: string;
  priorKnowledge?: string;
  dayIndex: number;
  totalDays: number;
  minutesPerDay: number;
  phase: LessonPhase;
  exerciseResponse?: string;
}): Promise<string> {
  const {
    topic,
    level,
    priorKnowledge,
    dayIndex,
    totalDays,
    minutesPerDay,
    phase,
    exerciseResponse,
  } = options;

  const client = getOpenAIClient();

  const systemPrompt = [
    "You are an expert tutor delivering an interactive lesson.",
    "Use a conversational tutor tone.",
    "Do NOT include quizzes.",
    "Do NOT include external links.",
    "",
    "Lesson template sections (must appear in order):",
    "1. Concept Explanation",
    "2. Why This Matters",
    "3. Tradeoffs (short table)",
    "4. Hands-On Implementation",
    "5. INTERACTIVE CHECKPOINT 1 (exercise + explicit pause)",
    "6. RESPONSE ANALYSIS (after learner returns)",
    "7. DEEPER EXPLANATION",
    "8. INTERACTIVE CHECKPOINT 2 (exercise + explicit pause)",
    "9. RESPONSE ANALYSIS (second return)",
    "10. What the Learner Should Observe",
    "11. Failure Modes",
    "12. Reflection Questions",
    "13. Core Insight",
    "14. Day Summary",
    "",
    "Phase rules:",
    "- If phase=initial: include sections 1-5 only, ending with explicit pause.",
    "- If phase=afterCheckpoint1: include sections 6-8 only, ending with explicit pause.",
    "- If phase=afterCheckpoint2: include sections 9-14 only.",
    "",
    "Interactive checkpoint pause line (use verbatim):",
    "\"Complete the exercise and come back with your results. I will analyze them and we will continue the lesson from there.\"",
    "",
    "Output format:",
    "- Use markdown headings.",
    "- Start with: \"### Day X — [Concept Title]\" and \"Estimated Time\" and \"Goal\" lines.",
  ].join("\n");

  const userPrompt = [
    `Topic: ${topic}`,
    level ? `Level: ${level}` : undefined,
    priorKnowledge ? `Prior knowledge: ${priorKnowledge}` : undefined,
    `Day: ${dayIndex} of ${totalDays}`,
    `Time per day: ${minutesPerDay} minutes`,
    `Phase: ${phase}`,
    exerciseResponse ? `Learner response: ${exerciseResponse}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
