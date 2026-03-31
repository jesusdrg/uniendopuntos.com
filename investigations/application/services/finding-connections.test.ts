import { describe, expect, it } from "bun:test";

import { deriveInvestigationFindingConnections } from "@/investigations/application/services/finding-connections";
import type { FindingCard } from "@/investigations/domain/entities/investigation";

describe("deriveInvestigationFindingConnections", () => {
  it("generates semantic connections using shared entities and claims", () => {
    const findings: FindingCard[] = [
      baseFinding("f-1", {
        summary: "El contrato de acme sa subio 40 por ciento en 2025.",
        sharedEntityKeys: ["acme sa", "contrato 2025"],
        claimHashes: ["abc123"],
      }),
      baseFinding("f-2", {
        summary: "Auditoria confirma el mismo contrato 2025 de acme sa.",
        sharedEntityKeys: ["acme sa", "contrato 2025"],
        claimHashes: ["abc123"],
      }),
      baseFinding("f-3", {
        summary: "Tema totalmente distinto.",
      }),
    ];

    const result = deriveInvestigationFindingConnections(findings);

    expect(result.connections.some((connection) => connection.fromId === "f-1" && connection.toId === "f-2")).toBeTrue();
    expect(result.connections.some((connection) => connection.fromId === "f-1" && connection.toId === "f-3")).toBeFalse();
    expect(result.findings.find((finding) => finding.id === "f-1")?.relatedFindingIds?.includes("f-2")).toBeTrue();
  });

  it("keeps legacy findings compatible by deriving hints automatically", () => {
    const findings: FindingCard[] = [
      baseFinding("legacy-1", {
        summary: "La empresa municipal acme sa adjudico obra en enero.",
      }),
      baseFinding("legacy-2", {
        summary: "Otra nota menciona acme sa y la misma adjudicacion de obra.",
      }),
    ];

    const result = deriveInvestigationFindingConnections(findings);

    expect(result.findings[0]?.sharedEntityKeys && result.findings[0].sharedEntityKeys.length > 0).toBeTrue();
    expect(result.connections.length > 0).toBeTrue();
  });
});

function baseFinding(id: string, partial?: Partial<FindingCard>): FindingCard {
  return {
    id,
    title: partial?.title ?? `Finding ${id}`,
    sourceUrl: partial?.sourceUrl ?? `https://example.com/${id}`,
    summary: partial?.summary ?? "Resumen por defecto",
    createdAt: partial?.createdAt ?? "2026-03-30T10:00:00.000Z",
    evidence: partial?.evidence,
    gaps: partial?.gaps,
    confidence: partial?.confidence,
    relatedFindingIds: partial?.relatedFindingIds,
    sharedEntityKeys: partial?.sharedEntityKeys,
    claimHashes: partial?.claimHashes,
  };
}
