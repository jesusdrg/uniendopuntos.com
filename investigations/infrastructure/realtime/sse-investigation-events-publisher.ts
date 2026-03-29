import type { InvestigationDomainEvent } from "@/investigations/domain/events/investigation-domain-event";
import type { InvestigationEventsPublisher } from "@/investigations/domain/ports/investigation-events-publisher";
import { InMemorySseLatencyMetrics } from "@/investigations/infrastructure/realtime/in-memory-sse-latency-metrics";
import type { InvestigationEventsBroker } from "@/investigations/infrastructure/realtime/investigation-events-broker";

export class SseInvestigationEventsPublisher implements InvestigationEventsPublisher {
  constructor(
    private readonly broker: InvestigationEventsBroker,
    private readonly latencyMetrics: InMemorySseLatencyMetrics,
  ) {}

  async publish(event: InvestigationDomainEvent): Promise<void> {
    const publishResult = await this.broker.publish(event);
    this.recordLatency(event.persistedAt, publishResult.emittedAt);

    for (const deliveredAt of publishResult.deliveredAt) {
      this.recordLatency(event.persistedAt, deliveredAt);
    }
  }

  private recordLatency(startedAt: string, endedAt: string): void {
    const startedAtMs = Date.parse(startedAt);
    const endedAtMs = Date.parse(endedAt);

    if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
      return;
    }

    this.latencyMetrics.record(Math.max(0, endedAtMs - startedAtMs));
  }
}
