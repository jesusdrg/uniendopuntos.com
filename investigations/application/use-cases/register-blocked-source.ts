import { randomUUID } from "node:crypto";

import { NotFoundError } from "@/investigations/application/errors/not-found-error";
import { ValidationError } from "@/investigations/application/errors/validation-error";
import {
  BLOCKED_SOURCE_REASON_CATEGORIES,
  type BlockedSourceReasonCategory,
  type Investigation,
} from "@/investigations/domain/entities/investigation";
import {
  createInvestigationDomainEvent,
  type InvestigationEventsPublisher,
} from "@/investigations/domain/ports/investigation-events-publisher";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

export type RegisterBlockedSourceInput = {
  url?: unknown;
  reasonCategory?: unknown;
  note?: unknown;
};

export class RegisterBlockedSource {
  constructor(
    private readonly repository: InvestigationRepository,
    private readonly eventsPublisher: InvestigationEventsPublisher = { publish: async () => {} },
  ) {}

  async execute(id: unknown, input: RegisterBlockedSourceInput): Promise<Investigation> {
    const investigationId = this.parseInvestigationId(id);
    const investigation = await this.repository.findById(investigationId);

    if (!investigation) {
      throw new NotFoundError(`Investigacion '${investigationId}' no encontrada.`);
    }

    const normalizedUrl = this.parseUrl(input.url);
    const reasonCategory = this.parseReasonCategory(input.reasonCategory);
    const normalizedNote = this.parseNote(input.note);

    const alreadyExists = investigation.blockedSources.some(
      (blockedSource) =>
        blockedSource.url === normalizedUrl && blockedSource.reasonCategory === reasonCategory,
    );

    if (alreadyExists) {
      return investigation;
    }

    const blockedSource = {
      id: randomUUID(),
      url: normalizedUrl,
      reasonCategory,
      note: normalizedNote,
      blockedAt: new Date().toISOString(),
    };

    const updatedInvestigation: Investigation = {
      ...investigation,
      updatedAt: new Date().toISOString(),
      blockedSources: [...investigation.blockedSources, blockedSource],
    };

    await this.repository.save(updatedInvestigation);
    const persistedAt = new Date().toISOString();
    await this.eventsPublisher.publish(
      createInvestigationDomainEvent({
        type: "investigation.blocked_source_registered",
        investigationId: updatedInvestigation.id,
        persistedAt,
        payload: {
          blockedSource,
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

  private parseUrl(value: unknown): string {
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'url' es obligatorio y debe ser string.");
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new ValidationError("El campo 'url' no puede estar vacio.");
    }

    try {
      const parsed = new URL(normalized);
      return parsed.toString();
    } catch {
      throw new ValidationError("El campo 'url' debe ser una URL valida.");
    }
  }

  private parseReasonCategory(value: unknown): BlockedSourceReasonCategory {
    if (typeof value !== "string") {
      throw new ValidationError(
        "El campo 'reasonCategory' es obligatorio y debe ser string.",
      );
    }

    const normalized = value.trim();

    if (!BLOCKED_SOURCE_REASON_CATEGORIES.includes(normalized as BlockedSourceReasonCategory)) {
      throw new ValidationError(
        `El campo 'reasonCategory' debe ser uno de: ${BLOCKED_SOURCE_REASON_CATEGORIES.join(", ")}.`,
      );
    }

    return normalized as BlockedSourceReasonCategory;
  }

  private parseNote(value: unknown): string | undefined {
    if (typeof value === "undefined") {
      return undefined;
    }

    if (typeof value !== "string") {
      throw new ValidationError("El campo 'note' debe ser string cuando se envia.");
    }

    const normalized = value.trim();

    return normalized.length > 0 ? normalized : undefined;
  }
}
