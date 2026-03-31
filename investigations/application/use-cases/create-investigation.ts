import { randomUUID } from "node:crypto";

import type { Investigation } from "@/investigations/domain/entities/investigation";
import {
  createInvestigationDomainEvent,
  type InvestigationEventsPublisher,
} from "@/investigations/domain/ports/investigation-events-publisher";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";
import { ValidationError } from "@/investigations/application/errors/validation-error";

export type CreateInvestigationInput = {
  query?: unknown;
  status?: unknown;
};

export class CreateInvestigation {
  constructor(
    private readonly repository: InvestigationRepository,
    private readonly eventsPublisher: InvestigationEventsPublisher = { publish: async () => {} },
  ) {}

  async execute(input: CreateInvestigationInput): Promise<Investigation> {
    const query = this.parseQuery(input.query);
    const now = new Date().toISOString();

    const investigation: Investigation = {
      id: randomUUID(),
      query,
      status: "active",
      createdAt: now,
      updatedAt: now,
      findings: [],
      findingConnections: [],
      blockedSources: [],
    };

    await this.repository.save(investigation);
    const persistedAt = new Date().toISOString();
    await this.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.created",
        investigationId: investigation.id,
        persistedAt,
        payload: {
          investigation,
        },
      }),
    );

    return investigation;
  }

  private parseQuery(query: unknown): string {
    if (typeof query !== "string") {
      throw new ValidationError("El campo 'query' es obligatorio y debe ser string.");
    }

    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      throw new ValidationError("El campo 'query' no puede estar vacio.");
    }

    if (normalizedQuery.length > 280) {
      throw new ValidationError("El campo 'query' supera el maximo de 280 caracteres.");
    }

    return normalizedQuery;
  }
}
