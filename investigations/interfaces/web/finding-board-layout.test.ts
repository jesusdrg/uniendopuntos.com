import { describe, expect, it } from "bun:test";

import type { FindingBoardCard } from "@/investigations/interfaces/web/finding-board";
import {
  clampFindingBoardPosition,
  createSpikeFindingBoardLayout,
  stabilizeFindingBoardLayout,
  toFindingBoardPositionFromPointer,
} from "@/investigations/interfaces/web/finding-board-layout";

describe("createSpikeFindingBoardLayout", () => {
  it("uses spike slots for first five cards", () => {
    const cards = [
      card("f-1"),
      card("f-2"),
      card("f-3"),
      card("f-4"),
      card("f-5"),
    ];

    const layout = createSpikeFindingBoardLayout(cards);

    expect(layout.get("f-1")).toEqual({ id: "f-1", xPct: 0.5, yPct: 0.46 });
    expect(layout.get("f-2")).toEqual({ id: "f-2", xPct: 0.28, yPct: 0.24 });
    expect(layout.get("f-3")).toEqual({ id: "f-3", xPct: 0.72, yPct: 0.24 });
    expect(layout.get("f-4")).toEqual({ id: "f-4", xPct: 0.28, yPct: 0.72 });
    expect(layout.get("f-5")).toEqual({ id: "f-5", xPct: 0.72, yPct: 0.72 });
  });

  it("places overflow cards on bounded ellipse", () => {
    const cards = [
      card("f-1"),
      card("f-2"),
      card("f-3"),
      card("f-4"),
      card("f-5"),
      card("f-6"),
      card("f-7"),
    ];

    const layout = createSpikeFindingBoardLayout(cards);
    const sixth = layout.get("f-6");
    const seventh = layout.get("f-7");

    expect(sixth).toBeDefined();
    expect(seventh).toBeDefined();
    expect((sixth?.xPct ?? 0) >= 0.1 && (sixth?.xPct ?? 0) <= 0.9).toBeTrue();
    expect((sixth?.yPct ?? 0) >= 0.12 && (sixth?.yPct ?? 0) <= 0.9).toBeTrue();
    expect((seventh?.xPct ?? 0) >= 0.1 && (seventh?.xPct ?? 0) <= 0.9).toBeTrue();
    expect((seventh?.yPct ?? 0) >= 0.12 && (seventh?.yPct ?? 0) <= 0.9).toBeTrue();
  });
});

describe("finding board drag helpers", () => {
  it("clamps positions to board bounds", () => {
    const clamped = clampFindingBoardPosition({ xPct: -0.2, yPct: 2 });

    expect(clamped).toEqual({ xPct: 0.1, yPct: 0.9 });
  });

  it("converts pointer coordinates into bounded percent position", () => {
    const position = toFindingBoardPositionFromPointer({
      pointerX: 320,
      pointerY: 150,
      stageWidth: 800,
      stageHeight: 600,
      dragOffsetX: 80,
      dragOffsetY: -40,
    });

    expect(position).toEqual({ xPct: 0.5, yPct: 0.18333333333333332 });
  });
});

describe("stabilizeFindingBoardLayout", () => {
  it("keeps previous positions for existing card ids", () => {
    const previous = new Map([
      ["f-1", { id: "f-1", xPct: 0.17, yPct: 0.25 }],
      ["f-2", { id: "f-2", xPct: 0.63, yPct: 0.41 }],
    ]);

    const stable = stabilizeFindingBoardLayout([card("f-2"), card("f-1")], previous);

    expect(stable.get("f-1")).toEqual({ id: "f-1", xPct: 0.17, yPct: 0.25 });
    expect(stable.get("f-2")).toEqual({ id: "f-2", xPct: 0.63, yPct: 0.41 });
  });

  it("drops removed ids and assigns fallback to new ids", () => {
    const previous = new Map([["f-1", { id: "f-1", xPct: 0.21, yPct: 0.34 }]]);

    const stable = stabilizeFindingBoardLayout([card("f-1"), card("f-3")], previous);

    expect(stable.has("missing")).toBeFalse();
    expect(stable.get("f-1")).toEqual({ id: "f-1", xPct: 0.21, yPct: 0.34 });
    expect(stable.get("f-3")).toEqual({ id: "f-3", xPct: 0.28, yPct: 0.24 });
  });
});

function card(id: string): FindingBoardCard {
  return {
    id,
    title: `title-${id}`,
    summary: `summary-${id}`,
    evidence: [],
    gaps: [],
    sourceDomain: "example.com",
    sourceType: "fuente",
    sourceUrl: `https://example.com/${id}`,
    timestamp: "2026-03-30T12:00:00.000Z",
  };
}
