export type SseStreamControlSnapshot = {
  maxGlobalSubscribers: number;
  activeGlobalSubscribers: number;
  rejectedGlobalSubscribers: number;
  droppedGlobalEvents: number;
  updatedAt: string | null;
};

export class InMemorySseStreamControl {
  private activeGlobalSubscribers = 0;
  private rejectedGlobalSubscribers = 0;
  private droppedGlobalEvents = 0;
  private updatedAt: string | null = null;

  constructor(private readonly maxGlobalSubscribers: number) {}

  tryAcquireGlobalSubscriber(): boolean {
    if (this.activeGlobalSubscribers >= this.maxGlobalSubscribers) {
      this.rejectedGlobalSubscribers += 1;
      this.touch();
      return false;
    }

    this.activeGlobalSubscribers += 1;
    this.touch();
    return true;
  }

  releaseGlobalSubscriber(): void {
    if (this.activeGlobalSubscribers <= 0) {
      return;
    }

    this.activeGlobalSubscribers -= 1;
    this.touch();
  }

  recordGlobalDrop(): void {
    this.droppedGlobalEvents += 1;
    this.touch();
  }

  snapshot(): SseStreamControlSnapshot {
    return {
      maxGlobalSubscribers: this.maxGlobalSubscribers,
      activeGlobalSubscribers: this.activeGlobalSubscribers,
      rejectedGlobalSubscribers: this.rejectedGlobalSubscribers,
      droppedGlobalEvents: this.droppedGlobalEvents,
      updatedAt: this.updatedAt,
    };
  }

  reset(): void {
    this.activeGlobalSubscribers = 0;
    this.rejectedGlobalSubscribers = 0;
    this.droppedGlobalEvents = 0;
    this.updatedAt = null;
  }

  private touch(): void {
    this.updatedAt = new Date().toISOString();
  }
}
