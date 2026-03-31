import { NotFoundError } from "@/investigations/application/errors/not-found-error";
import { ValidationError } from "@/investigations/application/errors/validation-error";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

export class DeleteInvestigation {
  constructor(private readonly repository: InvestigationRepository) {}

  async execute(id: unknown): Promise<void> {
    const investigationId = this.parseId(id);
    const deleted = await this.repository.deleteById(investigationId);

    if (!deleted) {
      throw new NotFoundError(`Investigacion '${investigationId}' no encontrada.`);
    }
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
