import { describe, expect, it } from "bun:test";

import { NotFoundError } from "@/investigations/application/errors/not-found-error";
import { ValidationError } from "@/investigations/application/errors/validation-error";
import { AddFindingToInvestigation } from "@/investigations/application/use-cases/add-finding-to-investigation";
import { CreateInvestigation } from "@/investigations/application/use-cases/create-investigation";
import { GetInvestigationById } from "@/investigations/application/use-cases/get-investigation-by-id";
import { ListInvestigations } from "@/investigations/application/use-cases/list-investigations";
import { RegisterBlockedSource } from "@/investigations/application/use-cases/register-blocked-source";
import type { Investigation } from "@/investigations/domain/entities/investigation";
import type { InvestigationRepository } from "@/investigations/domain/ports/investigation-repository";

class InMemoryInvestigationRepository implements InvestigationRepository {
  private readonly investigations = new Map<string, Investigation>();

  async save(investigation: Investigation): Promise<void> {
    this.investigations.set(investigation.id, investigation);
  }

  async findById(id: string): Promise<Investigation | null> {
    return this.investigations.get(id) ?? null;
  }

  async list(): Promise<Investigation[]> {
    return [...this.investigations.values()];
  }
}

describe("investigation application use-cases", () => {
  it("creates an investigation with normalized query and default state", async () => {
    const repository = new InMemoryInvestigationRepository();
    const useCase = new CreateInvestigation(repository);

    const created = await useCase.execute({ query: "   Corrupcion municipal   " });

    expect(created.id).toBeString();
    expect(created.query).toBe("Corrupcion municipal");
    expect(created.status).toBe("active");
    expect(created.findings).toEqual([]);
    expect(created.blockedSources).toEqual([]);
    expect(await repository.findById(created.id)).toEqual(created);
  });

  it("fails when create input query is invalid", async () => {
    const repository = new InMemoryInvestigationRepository();
    const useCase = new CreateInvestigation(repository);

    await expect(useCase.execute({ query: "   " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails when get id is invalid", async () => {
    const repository = new InMemoryInvestigationRepository();
    const getUseCase = new GetInvestigationById(repository);

    await expect(getUseCase.execute(" ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("gets an existing investigation by id", async () => {
    const repository = new InMemoryInvestigationRepository();
    const createUseCase = new CreateInvestigation(repository);
    const getUseCase = new GetInvestigationById(repository);
    const created = await createUseCase.execute({ query: "Tema de prueba" });

    const found = await getUseCase.execute(created.id);

    expect(found).toEqual(created);
  });

  it("returns not found when id does not exist", async () => {
    const repository = new InMemoryInvestigationRepository();
    const getUseCase = new GetInvestigationById(repository);

    await expect(getUseCase.execute("missing-id")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lists investigations sorted by createdAt descending", async () => {
    const repository = new InMemoryInvestigationRepository();
    const listUseCase = new ListInvestigations(repository);

    await repository.save({
      id: "a",
      query: "Primera",
      status: "active",
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:00.000Z",
      findings: [],
      blockedSources: [],
    });

    await repository.save({
      id: "b",
      query: "Segunda",
      status: "paused",
      createdAt: "2026-01-01T11:00:00.000Z",
      updatedAt: "2026-01-01T11:00:00.000Z",
      findings: [],
      blockedSources: [],
    });

    const investigations = await listUseCase.execute();

    expect(investigations.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("adds a finding card and updates updatedAt", async () => {
    const repository = new InMemoryInvestigationRepository();
    const createUseCase = new CreateInvestigation(repository);
    const addFindingUseCase = new AddFindingToInvestigation(repository);
    const created = await createUseCase.execute({ query: "Tema findings" });

    const updated = await addFindingUseCase.execute(created.id, {
      title: "Documento clave",
      summary: "Resumen del hallazgo",
      sourceUrl: "https://example.com/informe",
    });

    expect(updated.findings).toHaveLength(1);
    expect(updated.findings[0]?.id).toBeString();
    expect(updated.findings[0]?.title).toBe("Documento clave");
    expect(updated.findings[0]?.summary).toBe("Resumen del hallazgo");
    expect(updated.findings[0]?.sourceUrl).toBe("https://example.com/informe");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  });

  it("fails adding a finding when investigation does not exist", async () => {
    const repository = new InMemoryInvestigationRepository();
    const addFindingUseCase = new AddFindingToInvestigation(repository);

    await expect(
      addFindingUseCase.execute("missing-id", {
        title: "x",
        summary: "y",
        sourceUrl: "https://example.com",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails adding a finding with invalid payload", async () => {
    const repository = new InMemoryInvestigationRepository();
    const createUseCase = new CreateInvestigation(repository);
    const addFindingUseCase = new AddFindingToInvestigation(repository);
    const created = await createUseCase.execute({ query: "Tema validations findings" });

    await expect(
      addFindingUseCase.execute(created.id, {
        title: " ",
        summary: "ok",
        sourceUrl: "https://example.com",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("registers a blocked source and updates updatedAt", async () => {
    const repository = new InMemoryInvestigationRepository();
    const createUseCase = new CreateInvestigation(repository);
    const registerBlockedSourceUseCase = new RegisterBlockedSource(repository);
    const created = await createUseCase.execute({ query: "Tema blocked" });

    const updated = await registerBlockedSourceUseCase.execute(created.id, {
      url: "https://example.com/paywall",
      reasonCategory: "paywall",
      note: "Pide suscripcion",
    });

    expect(updated.blockedSources).toHaveLength(1);
    expect(updated.blockedSources[0]?.url).toBe("https://example.com/paywall");
    expect(updated.blockedSources[0]?.reasonCategory).toBe("paywall");
    expect(updated.blockedSources[0]?.note).toBe("Pide suscripcion");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  });

  it("deduplicates blocked source by url and reasonCategory", async () => {
    const repository = new InMemoryInvestigationRepository();
    const createUseCase = new CreateInvestigation(repository);
    const registerBlockedSourceUseCase = new RegisterBlockedSource(repository);
    const created = await createUseCase.execute({ query: "Tema dedupe" });

    const first = await registerBlockedSourceUseCase.execute(created.id, {
      url: "https://example.com/captcha",
      reasonCategory: "captcha",
      note: "Bloquea bot",
    });

    const second = await registerBlockedSourceUseCase.execute(created.id, {
      url: "https://example.com/captcha",
      reasonCategory: "captcha",
      note: "Otro intento",
    });

    expect(first.blockedSources).toHaveLength(1);
    expect(second.blockedSources).toHaveLength(1);
    expect(second.blockedSources[0]?.id).toBe(first.blockedSources[0]?.id);
  });

  it("fails registering blocked source with invalid reason category", async () => {
    const repository = new InMemoryInvestigationRepository();
    const createUseCase = new CreateInvestigation(repository);
    const registerBlockedSourceUseCase = new RegisterBlockedSource(repository);
    const created = await createUseCase.execute({ query: "Tema reason category" });

    await expect(
      registerBlockedSourceUseCase.execute(created.id, {
        url: "https://example.com",
        reasonCategory: "unknown",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
