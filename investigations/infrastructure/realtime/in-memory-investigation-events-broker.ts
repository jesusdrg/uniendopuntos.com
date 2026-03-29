import type { InvestigationDomainEvent } from "@/investigations/domain/events/investigation-domain-event";
import type {
  InvestigationEventListener,
  InvestigationEventPublishResult,
  InvestigationEventsBroker,
} from "@/investigations/infrastructure/realtime/investigation-events-broker";

export class InMemoryInvestigationEventsBroker implements InvestigationEventsBroker {
  private readonly listenersByInvestigationId = new Map<string, Set<InvestigationEventListener>>();
  private readonly globalListeners = new Set<InvestigationEventListener>();

  subscribe(investigationId: string, listener: InvestigationEventListener): () => void {
    const listeners = this.listenersByInvestigationId.get(investigationId) ?? new Set();
    listeners.add(listener);
    this.listenersByInvestigationId.set(investigationId, listeners);

    return () => {
      const currentListeners = this.listenersByInvestigationId.get(investigationId);

      if (!currentListeners) {
        return;
      }

      currentListeners.delete(listener);

      if (currentListeners.size === 0) {
        this.listenersByInvestigationId.delete(investigationId);
      }
    };
  }

  subscribeAll(listener: InvestigationEventListener): () => void {
    this.globalListeners.add(listener);

    return () => {
      this.globalListeners.delete(listener);
    };
  }

  async publish(event: InvestigationDomainEvent): Promise<InvestigationEventPublishResult> {
    const emittedAt = new Date().toISOString();
    const listeners = this.listenersByInvestigationId.get(event.investigationId);
    const allListeners = [...(listeners ?? []), ...this.globalListeners];

    if (allListeners.length === 0) {
      return {
        emittedAt,
        deliveredAt: [],
      };
    }

    const deliveredAt: string[] = [];

    for (const listener of allListeners) {
      try {
        await listener(event);
        deliveredAt.push(new Date().toISOString());
      } catch {
        // No rompemos el flujo por errores de subscribers puntuales.
      }
    }

    return {
      emittedAt,
      deliveredAt,
    };
  }
}
