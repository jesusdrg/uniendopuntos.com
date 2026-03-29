import type {
  InvestigationDomainEvent,
  InvestigationEventPayloadMap,
  InvestigationEventType,
} from "@/investigations/domain/events/investigation-domain-event";

export interface InvestigationEventsPublisher {
  publish<TType extends InvestigationEventType>(event: InvestigationDomainEvent<TType>): Promise<void>;
}

export function createInvestigationDomainEvent<TType extends InvestigationEventType>(
  event: Omit<InvestigationDomainEvent<TType>, "occurredAt">,
): InvestigationDomainEvent<TType> {
  return {
    ...event,
    occurredAt: new Date().toISOString(),
  };
}

export type InvestigationDomainEventPayload<TType extends InvestigationEventType> =
  InvestigationEventPayloadMap[TType];
