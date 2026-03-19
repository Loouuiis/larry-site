import { z } from "zod";
import type {
  ActionReasoning,
  ExtractedAction,
  InterventionDecision,
  RiskScoreSnapshot,
} from "@larry/shared";

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
  actionType: z
    .enum([
      "status_update",
      "task_create",
      "deadline_change",
      "owner_change",
      "scope_change",
      "risk_escalation",
      "email_draft",
      "meeting_invite",
      "follow_up",
      "other",
    ])
    .optional(),
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
  threshold: string;
  decision: "auto_execute" | "approval_required";
};

export interface PolicyThresholds {
  lowImpactMinConfidence: number;
  mediumImpactMinConfidence: number;
}

const DEFAULT_POLICY_THRESHOLDS: PolicyThresholds = {
  lowImpactMinConfidence: 0.75,
  mediumImpactMinConfidence: 0.9,
};

function clampThreshold(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0.5) return 0.5;
  if (value > 0.99) return 0.99;
  return Number(value.toFixed(3));
}

export function resolvePolicyThresholds(input?: Partial<PolicyThresholds>): PolicyThresholds {
  return {
    lowImpactMinConfidence: clampThreshold(
      input?.lowImpactMinConfidence ?? DEFAULT_POLICY_THRESHOLDS.lowImpactMinConfidence,
      DEFAULT_POLICY_THRESHOLDS.lowImpactMinConfidence
    ),
    mediumImpactMinConfidence: clampThreshold(
      input?.mediumImpactMinConfidence ?? DEFAULT_POLICY_THRESHOLDS.mediumImpactMinConfidence,
      DEFAULT_POLICY_THRESHOLDS.mediumImpactMinConfidence
    ),
  };
}

export function inferActionType(action: ExtractedAction): NonNullable<ExtractedAction["actionType"]> {
  if (action.actionType) return action.actionType;

  const text = `${action.title} ${action.reason}`.toLowerCase();
  if (/(deadline|due date|reschedul)/.test(text)) return "deadline_change";
  if (/(owner|assignee|accountab)/.test(text)) return "owner_change";
  if (/(scope|add work|remove work|change request)/.test(text)) return "scope_change";
  if (/(risk|escalat|blocked|critical)/.test(text)) return "risk_escalation";
  if (/(email|follow-up draft|draft)/.test(text)) return "email_draft";
  if (/(meeting|invite|calendar)/.test(text)) return "meeting_invite";
  if (/(status|progress|update)/.test(text)) return "status_update";
  if (/(create task|new task|action:)/.test(text)) return "task_create";
  if (/(follow up|nudge|remind)/.test(text)) return "follow_up";
  return "other";
}

function isStrategicActionType(actionType: NonNullable<ExtractedAction["actionType"]>): boolean {
  return (
    actionType === "deadline_change" ||
    actionType === "owner_change" ||
    actionType === "scope_change" ||
    actionType === "risk_escalation"
  );
}

export function evaluateActionPolicy(
  action: ExtractedAction,
  thresholdsInput?: Partial<PolicyThresholds>
): PolicyDecision {
  const thresholds = resolvePolicyThresholds(thresholdsInput);
  const actionType = inferActionType(action);

  if (isStrategicActionType(actionType)) {
    return {
      requiresApproval: true,
      reason: "Strategic-impact action requires human approval.",
      threshold: `strategic_action_type=${actionType}`,
      decision: "approval_required",
    };
  }

  if (action.impact === "high") {
    return {
      requiresApproval: true,
      reason: "High-impact action requires human approval.",
      threshold: "impact=high",
      decision: "approval_required",
    };
  }

  if (action.impact === "medium" && action.confidence < thresholds.mediumImpactMinConfidence) {
    return {
      requiresApproval: true,
      reason: "Medium-impact action below confidence threshold requires review.",
      threshold: `impact=medium;confidence<${thresholds.mediumImpactMinConfidence}`,
      decision: "approval_required",
    };
  }

  if (action.confidence < thresholds.lowImpactMinConfidence) {
    return {
      requiresApproval: true,
      reason: "Low confidence extraction requires review.",
      threshold: `confidence<${thresholds.lowImpactMinConfidence}`,
      decision: "approval_required",
    };
  }

  if (/deadline|owner|scope|budget|external/i.test(action.reason + " " + action.title)) {
    return {
      requiresApproval: true,
      reason: "Action appears to modify critical accountability or commitment terms.",
      threshold: "critical_keyword_match=true",
      decision: "approval_required",
    };
  }

  return {
    requiresApproval: false,
    reason: "Low-risk, high-confidence operational action.",
    threshold: `confidence>=${thresholds.lowImpactMinConfidence}`,
    decision: "auto_execute",
  };
}

export function buildInterventionDecision(
  action: ExtractedAction,
  thresholdsInput?: Partial<PolicyThresholds>
): InterventionDecision {
  const policy = evaluateActionPolicy(action, thresholdsInput);
  return {
    actionType: inferActionType(action),
    impact: action.impact,
    confidence: action.confidence,
    requiresApproval: policy.requiresApproval,
    threshold: policy.threshold,
    decision: policy.decision,
    reason: policy.reason,
    signals: action.signals,
  };
}

export function buildActionReasoning(
  action: ExtractedAction,
  thresholdsInput?: Partial<PolicyThresholds>
): ActionReasoning {
  const intervention = buildInterventionDecision(action, thresholdsInput);
  return {
    what: action.title,
    why: intervention.reason,
    signals: intervention.signals,
    threshold: intervention.threshold,
    decision: intervention.decision,
    override:
      "Use Action Center to approve, reject, or correct. Corrections are captured for future threshold tuning.",
  };
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
