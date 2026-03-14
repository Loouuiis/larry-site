import { z } from "zod";
import { getEnv } from "../config/env.js";
import { ExtractedAction } from "../types/domain.js";

export interface ExtractFromTranscriptInput {
  transcript: string;
  projectName?: string;
}

export interface LlmProvider {
  extractActionsFromTranscript(input: ExtractFromTranscriptInput): Promise<ExtractedAction[]>;
}

const ExtractedActionSchema = z.object({
  title: z.string().min(1),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1),
  impact: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
  signals: z.array(z.string()).default([]),
});

const ExtractedActionsSchema = z.array(ExtractedActionSchema);

class MockLlmProvider implements LlmProvider {
  async extractActionsFromTranscript(input: ExtractFromTranscriptInput): Promise<ExtractedAction[]> {
    const lines = input.transcript
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const actions: ExtractedAction[] = lines
      .filter((line) => /will|action|todo|follow\s*up|deadline/i.test(line))
      .slice(0, 8)
      .map((line) => ({
        title: line.slice(0, 140),
        confidence: 0.6,
        impact: "medium",
        reason: "Matched action-oriented phrase in transcript",
        signals: ["text_pattern_match"],
      }));

    return actions;
  }
}

class OpenAiProvider implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async extractActionsFromTranscript(input: ExtractFromTranscriptInput): Promise<ExtractedAction[]> {
    const instruction = [
      "You are an extraction engine for project execution tasks.",
      "Extract actionable tasks from transcript text.",
      "Output strict JSON array only.",
      "Each item fields: title, owner(optional), dueDate(optional ISO date), description(optional), confidence(0-1), impact(low|medium|high), reason, signals(string[]).",
      "Only include clear actions, deadlines, blockers, or follow-up commitments.",
    ].join(" ");

    const prompt = `${instruction}\n\nProject: ${input.projectName ?? "Unknown"}\nTranscript:\n${input.transcript}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };

    const text = payload.output_text
      ?? payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n")
      ?? "[]";

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const extracted = text.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
      parsed = JSON.parse(extracted);
    }

    return ExtractedActionsSchema.parse(parsed);
  }
}

export function createLlmProvider(): LlmProvider {
  const env = getEnv();
  if (env.OPENAI_API_KEY) {
    return new OpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  }
  return new MockLlmProvider();
}
