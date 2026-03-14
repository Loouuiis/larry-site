import { Queue } from "bullmq";
import { EVENT_QUEUE_NAME, QueueMessage } from "@larry/shared";

export interface QueuePublisher {
  publish(message: QueueMessage): Promise<void>;
  close(): Promise<void>;
}

class BullMqQueuePublisher implements QueuePublisher {
  private readonly queue: Queue;

  constructor(redisUrl: string) {
    this.queue = new Queue(EVENT_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1_000,
        },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    });
  }

  async publish(message: QueueMessage): Promise<void> {
    await this.queue.add(message.type, message, {
      jobId: message.dedupeKey,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createQueuePublisher(redisUrl: string): QueuePublisher {
  return new BullMqQueuePublisher(redisUrl);
}
