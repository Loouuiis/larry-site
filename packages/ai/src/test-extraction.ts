/**
 * Test harness for LLM extraction prompt.
 * Run: cd packages/ai && npx tsx src/test-extraction.ts
 * Requires OPENAI_API_KEY env var (or set in apps/api/.env which dotenv will pick up).
 */

import { createLlmProvider } from "./index.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const transcripts = [
  {
    name: "1. Standard standup — clear owners and dates",
    projectName: "Q2 Platform Launch",
    text: `
Alice: Okay quick standup. I'll have the authentication middleware PR up by Thursday.
Bob: I'm still working on the database migration script — should be done end of day Wednesday.
Alice: Great. Bob, once your migration is merged I can start the integration tests.
Charlie: I need to schedule a review meeting with the client before we go live. I'll send calendar invites today.
Alice: Also reminder that the staging deployment needs to happen before Friday EOD so QA has the weekend.
    `.trim(),
  },
  {
    name: "2. Client call — implicit deadline and a blocker",
    projectName: "Client Portal Redesign",
    text: `
Sarah: The client wants the new dashboard live before their board meeting on the 15th.
James: That's aggressive. We're blocked on the design sign-off — we sent the mockups two weeks ago and haven't heard back.
Sarah: I'll chase them today. James, assuming we get sign-off tomorrow, can you hit the 15th?
James: Only if we cut the export feature from scope for now.
Sarah: Okay, let's do that. I'll document the scope change and send it to the client for acknowledgement.
    `.trim(),
  },
  {
    name: "3. Handover note — dependency chain",
    projectName: "Infrastructure Migration",
    text: `
Handover notes from DevOps:
- Tom needs to provision the new VPC before the database cluster can be moved. Target: end of next week.
- Once the VPC is up, Maria will handle the RDS migration. She estimates 2 days of work.
- After the RDS migration, the application team (lead: Priya) can update connection strings and run smoke tests.
- Final cutover requires sign-off from Tom, Maria, and Priya before DNS is switched.
    `.trim(),
  },
  {
    name: "4. No real actions — expect empty array",
    projectName: "Quarterly Review",
    text: `
Manager: So overall the quarter went well. Revenue was up 12%, customer satisfaction scores improved.
Team: We talked about expanding into new markets last year but didn't pursue it.
Manager: Yes and the team did a great job adapting. I think we should continue the same approach next quarter.
Team: Agreed. The new processes we implemented in January are working well.
    `.trim(),
  },
  {
    name: "5. Mixed — follow-ups, scope change, and risk escalation",
    projectName: "Mobile App Release",
    text: `
Leo: The push notification service is failing intermittently in staging — we think it's a race condition but haven't confirmed yet. This is a release blocker.
Nina: I'll take that. I need the server logs from last night's run to investigate. Can someone send those?
Leo: I'll send them now. Nina, I need an update by tomorrow 10am — if it's not resolved we need to escalate to the vendor.
Nina: Understood. Also, the analytics SDK we planned to ship in v1.2 — legal flagged it yesterday for data residency reasons. We should cut it from this release.
Leo: Agreed. I'll update the release notes and notify the PM. Nina, once you confirm the push notification fix, we also need regression tests added for that code path before merge.
    `.trim(),
  },
];

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set. Export it or add it to apps/api/.env");
    process.exit(1);
  }

  const provider = createLlmProvider({ openAiApiKey: OPENAI_API_KEY, openAiModel: OPENAI_MODEL });

  let passed = 0;
  let failed = 0;

  for (const t of transcripts) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`TRANSCRIPT: ${t.name}`);
    console.log("=".repeat(70));

    try {
      const actions = await provider.extractActionsFromTranscript({
        transcript: t.text,
        projectName: t.projectName,
      });

      if (t.name.includes("expect empty array")) {
        if (actions.length === 0) {
          console.log("✅ PASS — correctly returned empty array");
          passed++;
        } else {
          console.log(`⚠️  WARNING — expected empty array but got ${actions.length} actions:`);
          actions.forEach((a, i) => console.log(`  [${i + 1}] ${a.title} (confidence: ${a.confidence})`));
          failed++;
        }
      } else {
        console.log(`✅ Extracted ${actions.length} action(s):\n`);
        actions.forEach((a, i) => {
          console.log(`  [${i + 1}] ${a.title}`);
          console.log(`       owner: ${a.owner ?? "—"}  |  due: ${a.dueDate ?? "—"}  |  workstream: ${a.workstream ?? "—"}`);
          console.log(`       type: ${a.actionType ?? "—"}  |  impact: ${a.impact}  |  confidence: ${a.confidence}`);
          console.log(`       blocker: ${a.blockerFlag ?? false}  |  followUp: ${a.followUpRequired ?? false}`);
          if (a.dependsOn?.length) console.log(`       dependsOn: ${a.dependsOn.join("; ")}`);
          console.log(`       reason: ${a.reason}`);
          console.log(`       signals: ${a.signals.slice(0, 2).join(" | ")}`);
          console.log();
        });
        passed++;
      }
    } catch (err) {
      console.error(`❌ FAIL — ${err}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${transcripts.length} transcripts`);
  console.log("=".repeat(70));

  if (failed > 0) process.exit(1);
}

main();
