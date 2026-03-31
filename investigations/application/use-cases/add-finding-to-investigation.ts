import { randomUUID } from "node:crypto";

import { NotFoundError } from "@/investigations/application/errors/not-found-error";
import { deriveInvestigationFindingConnections } from "@/investigations/application/services/finding-connections";
import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { Investigation } from "@/investigations/domain/entities/investigation";
import {
  createInvestigationDomainEvent,
  type InvestigationEventsPublisher,
} from "@/investigations/domain/ports/investigation-events-publisher";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

export type AddFindingToInvestigationInput = {
  title?: unknown;
  summary?: unknown;
  sourceUrl?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  gaps?: unknown;
  relatedFindingIds?: unknown;
  sharedEntityKeys?: unknown;
  claimHashes?: unknown;
};

export class AddFindingToInvestigation {
  constructor(
    private readonly repository: InvestigationRepository,
    private readonly eventsPublisher: InvestigationEventsPublisher = { publish: async () => {} },
  ) {}

  async execute(id: unknown, input: AddFindingToInvestigationInput): Promise<Investigation> {
    const investigationId = this.parseInvestigationId(id);
    const investigation = await this.repository.findById(investigationId);

    if (!investigation) {
      throw new NotFoundError(`Investigacion '${investigationId}' no encontrada.`);
    }

    const finding = {
      id: randomUUID(),
      title: this.parseTitle(input.title),
      summary: this.parseSummary(input.summary),
      sourceUrl: this.parseSourceUrl(input.sourceUrl),
      confidence: this.parseConfidence(input.confidence),
      evidence: this.parseStringArray(input.evidence),
      gaps: this.parseStringArray(input.gaps),
      relatedFindingIds: this.parseStringArray(input.relatedFindingIds),
      sharedEntityKeys: this.parseStringArray(input.sharedEntityKeys),
      claimHashes: this.parseStringArray(input.claimHashes),
      createdAt: new Date().toISOString(),
    };

    const connectionResult = deriveInvestigationFindingConnections([...investigation.findings, finding]);

    const updatedInvestigation: Investigation = {
      ...investigation,
      updatedAt: new Date().toISOString(),
      findings: connectionResult.findings,
      findingConnections: connectionResult.connections,
    };

    await this.repository.save(updatedInvestigation);
    const persistedAt = new Date().toISOString();
    await this.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.finding_added",
        investigationId: updatedInvestigation.id,
        persistedAt,
        payload: {
          finding,
          updatedAt: updatedInvestigation.updatedAt,
        },
      }),
    );
    await this.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.finding_connections_updated",
        investigationId: updatedInvestigation.id,
        persistedAt,
        payload: {
          connections: updatedInvestigation.findingConnections ?? [],
          updatedAt: updatedInvestigation.updatedAt,
        },
      }),
    );

    return updatedInvestigation;
  }

  private parseInvestigationId(id: unknown): string {
    if (typeof id !== "string") {
      throw new ValidationError("El parametro 'id' es obligatorio y debe ser string.");
    }

    const normalizedId = id.trim();

    if (normalizedId.length === 0) {
      throw new ValidationError("El parametro 'id' no puede estar vacio.");
    }

    return normalizedId;
  }

  private parseTitle(value: unknown): string {
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'title' es obligatorio y debe ser string.");
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new ValidationError("El campo 'title' no puede estar vacio.");
    }

    return normalized;
  }

  private parseSummary(value: unknown): string {
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'summary' es obligatorio y debe ser string.");
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new ValidationError("El campo 'summary' no puede estar vacio.");
    }

    return normalized;
  }

  private parseSourceUrl(value: unknown): string {
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'sourceUrl' es obligatorio y debe ser string.");
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new ValidationError("El campo 'sourceUrl' no puede estar vacio.");
    }

    try {
      const parsed = new URL(normalized);
      return parsed.toString();
    } catch {
      throw new ValidationError("El campo 'sourceUrl' debe ser una URL valida.");
    }
  }

  private parseConfidence(value: unknown): "low" | "medium" | "high" | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (value !== "low" && value !== "medium" && value !== "high") {
      throw new ValidationError("El campo 'confidence' debe ser low, medium o high.");
    }

    return value;
  }

  private parseStringArray(value: unknown): string[] | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      throw new ValidationError("Los campos 'evidence' y 'gaps' deben ser arrays de strings.");
    }

    const output: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") {
        throw new ValidationError("Los campos 'evidence' y 'gaps' deben contener solo strings.");
      }

      const normalized = item.trim();
      if (normalized.length === 0) {
        continue;
      }

      output.push(normalized);
    }

    return output;
  }
}
