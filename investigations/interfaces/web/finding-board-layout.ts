import type { FindingBoardCard } from "@/investigations/interfaces/web/finding-board";

export type FindingBoardNodeLayout = {
  id: string;
  xPct: number;
  yPct: number;
};

export type FindingBoardPosition = {
  xPct: number;
  yPct: number;
};

export const FINDING_BOARD_BOUNDS = {
  xMin: 0.1,
  xMax: 0.9,
  yMin: 0.12,
  yMax: 0.9,
} as const;

const SPIKE_SLOTS: ReadonlyArray<Readonly<{ xPct: number; yPct: number }>> = [
  { xPct: 0.5, yPct: 0.46 },
  { xPct: 0.28, yPct: 0.24 },
  { xPct: 0.72, yPct: 0.24 },
  { xPct: 0.28, yPct: 0.72 },
  { xPct: 0.72, yPct: 0.72 },
];

export function createSpikeFindingBoardLayout(cards: FindingBoardCard[]): Map<string, FindingBoardNodeLayout> {
  const byId = new Map<string, FindingBoardNodeLayout>();
  if (cards.length === 0) {
    return byId;
  }

  const primaryCount = Math.min(cards.length, SPIKE_SLOTS.length);
  for (let index = 0; index < primaryCount; index += 1) {
    const card = cards[index];
    const slot = SPIKE_SLOTS[index];
    if (!card || !slot) {
      continue;
    }

    byId.set(card.id, {
      id: card.id,
      xPct: slot.xPct,
      yPct: slot.yPct,
    });
  }

  if (cards.length <= SPIKE_SLOTS.length) {
    return byId;
  }

  const centerX = 0.5;
  const centerY = 0.5;
  const radiusX = 0.34;
  const radiusY = 0.28;
  const overflow = cards.length - SPIKE_SLOTS.length;

  for (let offset = 0; offset < overflow; offset += 1) {
    const card = cards[SPIKE_SLOTS.length + offset];
    if (!card) {
      continue;
    }

    const angle = -Math.PI / 2 + (offset * Math.PI * 2) / overflow;
    byId.set(card.id, {
      id: card.id,
      xPct: clamp(centerX + Math.cos(angle) * radiusX, FINDING_BOARD_BOUNDS.xMin, FINDING_BOARD_BOUNDS.xMax),
      yPct: clamp(centerY + Math.sin(angle) * radiusY, FINDING_BOARD_BOUNDS.yMin, FINDING_BOARD_BOUNDS.yMax),
    });
  }

  return byId;
}

export function stabilizeFindingBoardLayout(
  cards: FindingBoardCard[],
  previousLayoutById: Map<string, FindingBoardNodeLayout>,
): Map<string, FindingBoardNodeLayout> {
  if (cards.length === 0) {
    return new Map();
  }

  const fallbackLayoutById = createSpikeFindingBoardLayout(cards);
  const nextLayoutById = new Map<string, FindingBoardNodeLayout>();

  for (const card of cards) {
    const previous = previousLayoutById.get(card.id);
    if (previous) {
      nextLayoutById.set(card.id, {
        id: card.id,
        xPct: previous.xPct,
        yPct: previous.yPct,
      });
      continue;
    }

    const fallback = fallbackLayoutById.get(card.id);
    if (!fallback) {
      continue;
    }

    nextLayoutById.set(card.id, fallback);
  }

  return nextLayoutById;
}

export function clampFindingBoardPosition(position: FindingBoardPosition): FindingBoardPosition {
  return {
    xPct: clamp(position.xPct, FINDING_BOARD_BOUNDS.xMin, FINDING_BOARD_BOUNDS.xMax),
    yPct: clamp(position.yPct, FINDING_BOARD_BOUNDS.yMin, FINDING_BOARD_BOUNDS.yMax),
  };
}

export function toFindingBoardPositionFromPointer(input: {
  pointerX: number;
  pointerY: number;
  stageWidth: number;
  stageHeight: number;
  dragOffsetX: number;
  dragOffsetY: number;
}): FindingBoardPosition {
  const safeWidth = Math.max(input.stageWidth, 1);
  const safeHeight = Math.max(input.stageHeight, 1);

  return clampFindingBoardPosition({
    xPct: (input.pointerX + input.dragOffsetX) / safeWidth,
    yPct: (input.pointerY + input.dragOffsetY) / safeHeight,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
