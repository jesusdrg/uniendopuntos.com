import type { Investigation } from "@/investigations/domain/entities/investigation";

export interface InvestigationRepository {
  save(investigation: Investigation): Promise<void>;
  findById(id: string): Promise<Investigation | null>;
  list(): Promise<Investigation[]>;
}
