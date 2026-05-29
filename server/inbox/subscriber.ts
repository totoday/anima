import { WakeQueueService } from './wake-queue.service.js';
import { ReminderInboxSubscriber } from './reminder-subscriber.js';
import { SlackInboxSubscriber } from './slack-subscriber.js';

export interface InboxSubscriberOptions {
  agentRuntimeKind: string;
  appToken: string;
  botToken: string;
  queue: WakeQueueService;
}

export class InboxSubscriber {
  private readonly reminders: ReminderInboxSubscriber;
  private readonly slack: SlackInboxSubscriber;

  constructor(options: InboxSubscriberOptions) {
    this.reminders = new ReminderInboxSubscriber(options.queue);
    this.slack = new SlackInboxSubscriber(options);
  }

  async start(): Promise<void> {
    this.reminders.start();
    try {
      await this.slack.start();
    } catch (error) {
      await this.reminders.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled([
      this.slack.stop(),
      this.reminders.stop(),
    ]);
  }
}
