import type { InvestigationDomainEvent } from "@/investigations/domain/events/investigation-domain-event";

export type InvestigationEventListener = (
  event: InvestigationDomainEvent,
) => void | Promise<void>;

export type InvestigationEventPublishResult = {
  emittedAt: string;
  deliveredAt: string[];
};

export interface InvestigationEventsBroker {
  subscribe(investigationId: string, listener: InvestigationEventListener): () => void;
  subscribeAll(listener: InvestigationEventListener): () => void;
  publish(event: InvestigationDomainEvent): Promise<InvestigationEventPublishResult>;
}
