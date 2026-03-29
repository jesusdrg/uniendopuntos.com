import type { BlockedSource, FindingCard, Investigation } from "@/investigations/domain/entities/investigation";

export type InvestigationEventType =
  | "investigation.created"
  | "investigation.finding_added"
  | "investigation.blocked_source_registered";

export type InvestigationEventPayloadMap = {
  "investigation.created": {
    investigation: Investigation;
  };
  "investigation.finding_added": {
    finding: FindingCard;
    updatedAt: string;
  };
  "investigation.blocked_source_registered": {
    blockedSource: BlockedSource;
    updatedAt: string;
  };
};

export type InvestigationDomainEvent<TType extends InvestigationEventType = InvestigationEventType> = {
  type: TType;
  investigationId: string;
  occurredAt: string;
  persistedAt: string;
  payload: InvestigationEventPayloadMap[TType];
};
