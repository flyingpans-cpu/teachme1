import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestTopicOptionsWithLLM } from "@/app/lib/llmPrompt";

const TopicSuggestRequestSchema = z.object({
  topicInput: z.string().min(3),
});

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = TopicSuggestRequestSchema.parse(raw);
    const result = await suggestTopicOptionsWithLLM({
      topicInput: parsed.topicInput,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error suggesting topics", error);
    return NextResponse.json(
      { error: "Unable to suggest topic options right now." },
      { status: 500 },
    );
  }
}
