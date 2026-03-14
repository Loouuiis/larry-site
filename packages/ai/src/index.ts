import { z } from "zod";
import type { ExtractedAction, RiskScoreSnapshot } from "@larry/shared";

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
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

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

    const text =
      payload.output_text ??
      payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ??
      "[]";

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

export function createLlmProvider(options: {
  openAiApiKey?: string;
  openAiModel: string;
}): LlmProvider {
  if (options.openAiApiKey) {
    return new OpenAiProvider(options.openAiApiKey, options.openAiModel);
  }
  return new MockLlmProvider();
}

export type PolicyDecision = {
  requiresApproval: boolean;
  reason: string;
};

export function evaluateActionPolicy(action: ExtractedAction): PolicyDecision {
  if (action.impact === "high") {
    return { requiresApproval: true, reason: "High-impact action requires human approval." };
  }

  if (action.confidence < 0.75) {
    return { requiresApproval: true, reason: "Low confidence extraction requires review." };
  }

  if (/deadline|owner|scope|budget|external/i.test(action.reason + " " + action.title)) {
    return {
      requiresApproval: true,
      reason: "Action appears to modify critical accountability or commitment terms.",
    };
  }

  return { requiresApproval: false, reason: "Low-risk, high-confidence operational action." };
}

export interface RiskInputs {
  daysToDeadline: number;
  progressPercent: number;
  inactivityDays: number;
  dependencyBlockedCount: number;
}

export function computeRiskScore(inputs: RiskInputs): RiskScoreSnapshot["riskScore"] {
  const deadlinePressure = Math.max(0, 14 - inputs.daysToDeadline) * 3;
  const lowProgressPenalty = Math.max(0, 70 - inputs.progressPercent) * 0.6;
  const inactivityPenalty = inputs.inactivityDays * 4;
  const dependencyPenalty = inputs.dependencyBlockedCount * 12;

  return Math.min(
    100,
    Number((deadlinePressure + lowProgressPenalty + inactivityPenalty + dependencyPenalty).toFixed(2))
  );
}

export function classifyRiskLevel(score: number): RiskScoreSnapshot["riskLevel"] {
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}
