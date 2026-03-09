import { z } from "zod";

export const StylePreferencesSchema = z.object({
  morePractice: z.boolean().optional().default(false),
  moreTheory: z.boolean().optional().default(false),
  preferReading: z.boolean().optional().default(false),
  preferVideos: z.boolean().optional().default(false),
});

export const CourseRequestSchema = z.object({
  topic: z.string().min(5).max(500),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  priorKnowledge: z.string().max(1000).optional(),
  weeks: z.number().int().min(1).max(5).default(5),
  hoursPerWeek: z.number().min(0.5).max(40),
  sessionsPerWeek: z.number().int().min(1).max(7),
  preferredSessionLengthMinutes: z.number().int().min(15).max(240),
  stylePreferences: StylePreferencesSchema,
});

export type CourseRequestInput = z.infer<typeof CourseRequestSchema>;

export const ContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    title: z.string().optional(),
    body: z.string(),
  }),
  z.object({
    type: z.literal("reflection"),
    prompt: z.string(),
    hint: z.string().optional(),
  }),
  z.object({
    type: z.literal("exercise"),
    instructions: z.string(),
    expectedOutcome: z.string().optional(),
  }),
  z.object({
    type: z.literal("resource"),
    label: z.string(),
    url: z.string().url().optional(),
    description: z.string().optional(),
  }),
]);

export const GeneratedSessionSchema = z.object({
  weekIndex: z.number().int().min(1),
  sessionIndex: z.number().int().min(1),
  title: z.string(),
  objective: z.string(),
  estimatedMinutes: z.number().int().min(5),
  activityType: z.enum(["READING", "PRACTICE", "MIXED"]),
  targetMinutes: z.number().int().min(5),
  contentBlocks: z.array(ContentBlockSchema),
});

export const GeneratedWeekSchema = z.object({
  weekIndex: z.number().int().min(1),
  title: z.string(),
  summary: z.string(),
  targetMinutes: z.number().int().min(15),
  sessions: z.array(GeneratedSessionSchema),
});

export const GeneratedCourseSchema = z.object({
  courseTitle: z.string(),
  overview: z.string(),
  weeks: z.array(GeneratedWeekSchema).min(1),
});

export type GeneratedCourse = z.infer<typeof GeneratedCourseSchema>;
