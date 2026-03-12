import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { getEnv } from "../config/env.js";

export interface QueueMessage {
  type: string;
  tenantId: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}

export interface QueuePublisher {
  publish(message: QueueMessage): Promise<void>;
}

class InMemoryQueuePublisher implements QueuePublisher {
  async publish(message: QueueMessage): Promise<void> {
    // Deliberately minimal for local/dev without AWS.
    console.log("[queue:memory]", JSON.stringify(message));
  }
}

class SqsQueuePublisher implements QueuePublisher {
  private readonly client: SQSClient;

  constructor(private readonly queueUrl: string, region: string) {
    this.client = new SQSClient({ region });
  }

  async publish(message: QueueMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageDeduplicationId: message.dedupeKey,
        MessageGroupId: message.type,
      })
    );
  }
}

export function createQueuePublisher(): QueuePublisher {
  const env = getEnv();
  if (env.SQS_EVENTS_QUEUE_URL) {
    return new SqsQueuePublisher(env.SQS_EVENTS_QUEUE_URL, env.AWS_REGION);
  }
  return new InMemoryQueuePublisher();
}
