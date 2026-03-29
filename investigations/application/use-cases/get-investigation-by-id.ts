import { NotFoundError } from "@/investigations/application/errors/not-found-error";
import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { Investigation } from "@/investigations/domain/entities/investigation";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

export class GetInvestigationById {
  constructor(private readonly repository: InvestigationRepository) {}

  async execute(id: unknown): Promise<Investigation> {
    const investigationId = this.parseId(id);
    const investigation = await this.repository.findById(investigationId);

    if (!investigation) {
      throw new NotFoundError(`Investigacion '${investigationId}' no encontrada.`);
    }

    return investigation;
  }

  private parseId(id: unknown): string {
    if (typeof id !== "string") {
      throw new ValidationError("El parametro 'id' es obligatorio y debe ser string.");
    }

    const normalizedId = id.trim();

    if (normalizedId.length === 0) {
      throw new ValidationError("El parametro 'id' no puede estar vacio.");
    }

    return normalizedId;
  }
}
