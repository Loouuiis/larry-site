// Larry "Modify Action" chat flow.
// Spec: docs/superpowers/specs/2026-04-15-modify-action-design.md
//
// Differs from the main streamLarryChat in two ways:
//   1. Only one tool: apply_modification. The LLM cannot call task mutation
//      tools because there is no task yet — the suggestion is still pending.
//   2. System prompt is focused on the single pending suggestion, its current
//      payload, its editable fields, and the project's team list.

import { streamText, tool, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { z } from "zod";
import type { IntelligenceConfig } from "@larry/shared";
import { createModel } from "./provider.js";
import { computeDateContext } from "./chat.js";

export interface ModifyChatContext {
  actionType: string;
  displayText: string;
  reasoning: string;
  currentPayload: Record<string, unknown>;
  editableFields: string[];
  teamMembers: { displayName: string }[];
}

export type ModifyChatStreamEvent =
  | { type: "token"; delta: string }
  | {
      type: "tool_done";
      name: "apply_modification";
      success: boolean;
      payloadPatch: Record<string, unknown>;
      summary: string;
    }
  | { type: "error"; message: string };

export function buildModifySystemPrompt(ctx: ModifyChatContext): string {
  const d = computeDateContext();
  const team =
    ctx.teamMembers.length > 0
      ? ctx.teamMembers.map((m) => m.displayName).join(", ")
      : "(no team members on this project)";

  return `You are Larry. The user has opened the Modify panel on a pending suggestion and wants to change something before accepting it. Your job is to translate what they say into a precise payload patch via the apply_modification tool.

## TODAY

Today is ${d.dayOfWeek}, ${d.today}.
- tomorrow = ${(() => { const t = new Date(d.today + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); })()}
- next Monday = ${d.nextMonday}
- next Tuesday = ${d.nextTuesday}
- next Wednesday = ${d.nextWednesday}
- next Thursday = ${d.nextThursday}
- next Friday = ${d.nextFriday}

Anchor all relative dates to today, not your training data.

## THE SUGGESTION BEING MODIFIED

- Action type: ${ctx.actionType}
- Display text: ${ctx.displayText}
- Original reasoning: ${ctx.reasoning}
- Current payload:
${JSON.stringify(ctx.currentPayload, null, 2)}

## EDITABLE FIELDS

You can change ONLY these fields on the payload:

${ctx.editableFields.join(", ")}

If the user asks to change a field that is NOT in that list, explain in prose what you can and can't modify. Do not call apply_modification with an unsupported key.

## TEAM MEMBERS ON THIS PROJECT

${team}

When the user asks to reassign or set an assignee, the new value MUST match a name from this list. If they say a name that isn't on the project, do not silently drop it. Say "I don't see <name> on this project — do you mean <closest match>?" and wait for confirmation.

## YOUR ONE TOOL

Call \`apply_modification\` exactly once per user turn when the user has asked for a concrete change. Include ONLY the fields that change. Write a short past-tense summary describing the diff ("Pushed the deadline to 30 Apr and reassigned to Anna.").

Do not call apply_modification when:
- The user is asking a clarifying question ("why was this suggested?", "what was the original date?").
- The user's message is ambiguous and needs confirmation before a change lands.
- The change cannot be expressed in the editable fields.

In those cases, answer in prose.

## STYLE

Direct, short, conversational. Don't restate the whole payload. Don't announce tool calls — call the tool and continue the sentence. Never call any tool other than apply_modification — other tools do not exist in this conversation.`;
}

export async function* streamModifyChat(input: {
  config: IntelligenceConfig;
  messages: ModelMessage[];
  context: ModifyChatContext;
}): AsyncGenerator<ModifyChatStreamEvent> {
  const { config, messages, context } = input;

  if (config.provider === "mock" || !config.apiKey) {
    const mock = "(mock modify mode — no API key configured).";
    for (const char of mock) {
      yield { type: "token", delta: char };
    }
    return;
  }

  const model = createModel(config);

  const tools = {
    apply_modification: tool({
      description:
        "Apply the user-described change(s) to the pending suggestion's payload. Call exactly once per turn when the user asks for a concrete change, or zero times for a clarifying question.",
      inputSchema: z.object({
        payloadPatch: z
          .record(z.string(), z.unknown())
          .describe(
            "Only the fields that change. Keys must be in the editable fields list from the system prompt."
          ),
        summary: z
          .string()
          .describe("One short past-tense sentence summarising the change."),
      }),
      execute: async (params) => ({
        ok: true,
        payloadPatch: params.payloadPatch,
        summary: params.summary,
      }),
    }),
  };

  const result = streamText({
    model,
    system: buildModifySystemPrompt(context),
    messages,
    tools,
    stopWhen: stepCountIs(2),
    maxRetries: 1,
  });

  for await (const chunk of result.fullStream) {
    const c = chunk as { type?: string } & Record<string, unknown>;
    switch (c.type) {
      case "text-delta": {
        const text = (c as { text?: string }).text;
        if (typeof text === "string" && text.length > 0) {
          yield { type: "token", delta: text };
        }
        break;
      }
      case "tool-result": {
        const t = c as {
          toolName: string;
          output?: { payloadPatch?: Record<string, unknown>; summary?: string };
        };
        if (t.toolName === "apply_modification" && t.output?.payloadPatch) {
          yield {
            type: "tool_done",
            name: "apply_modification",
            success: true,
            payloadPatch: t.output.payloadPatch,
            summary: t.output.summary ?? "",
          };
        }
        break;
      }
      case "error": {
        const e = c as { error: unknown };
        yield {
          type: "error",
          message:
            e.error instanceof Error ? e.error.message : String(e.error ?? "Unknown streaming error"),
        };
        break;
      }
      default:
        break;
    }
  }
}
