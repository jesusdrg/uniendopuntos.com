import type { Investigation } from "@/investigations/domain/entities/investigation";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

export class ListInvestigations {
  constructor(private readonly repository: InvestigationRepository) {}

  async execute(): Promise<Investigation[]> {
    const investigations = await this.repository.list();

    return [...investigations].sort((left, right) => {
      const leftTime = Number.isNaN(Date.parse(left.createdAt)) ? 0 : Date.parse(left.createdAt);
      const rightTime = Number.isNaN(Date.parse(right.createdAt)) ? 0 : Date.parse(right.createdAt);

      return rightTime - leftTime;
    });
  }
}
