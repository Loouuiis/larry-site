import { Job } from "bullmq";
import { QueueMessage } from "@larry/shared";
import { runEscalationScan } from "./escalation.js";
import { runCalendarWebhookRenewal } from "./calendar-renewal.js";
import { runLarryScan } from "./larry-scan.js";

export async function processQueueJob(job: Job<QueueMessage>): Promise<void> {
  switch (job.name) {
    case "larry.scan":
      await runLarryScan();
      break;
    case "escalation.scan":
      await runEscalationScan();
      break;
    case "calendar.webhook.renew":
      await runCalendarWebhookRenewal();
      break;
    default:
      break;
  }
}
