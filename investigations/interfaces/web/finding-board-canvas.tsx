"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import type {
  FindingBoardCard,
  FindingBoardConnection,
} from "@/investigations/interfaces/web/finding-board";
import {
  createSpikeFindingBoardLayout,
  toFindingBoardPositionFromPointer,
  type FindingBoardPosition,
} from "@/investigations/interfaces/web/finding-board-layout";

type FindingBoardCanvasProps = {
  cards: FindingBoardCard[];
  connections: FindingBoardConnection[];
  selectedCardId?: string | null;
  onCardSelect?: (cardId: string) => void;
};

type AnchorPoint = {
  x: number;
  y: number;
};

type RopeParticle = {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  pinned: boolean;
  segmentLength: number;
};

type RopeState = {
  id: string;
  fromId: string;
  toId: string;
  reason: FindingBoardConnection["reason"];
  particles: RopeParticle[];
};

type DragState = {
  cardId: string;
  pointerId: number;
  dragOffsetX: number;
  dragOffsetY: number;
};

type PointerStartState = {
  cardId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
};

const STAGE_MIN_HEIGHT = 360;
const PHYSICS_SEGMENTS = 26;
const PHYSICS_ITERATIONS = 14;
const PHYSICS_GRAVITY = 900;
const PHYSICS_DAMPING = 0.985;
const PHYSICS_SLACK_FACTOR = 1.14;
const CLICK_DRAG_THRESHOLD_PX = 8;

export function FindingBoardCanvas({
  cards,
  connections,
  selectedCardId = null,
  onCardSelect,
}: FindingBoardCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardElementsRef = useRef(new Map<string, HTMLElement>());
  const ropesRef = useRef(new Map<string, RopeState>());
  const animationRef = useRef<number | null>(null);
  const previousFrameMsRef = useRef<number | null>(null);
  const connectionsRef = useRef(connections);
  const effectiveLayoutRef = useRef(new Map<string, { xPct: number; yPct: number }>());
  const [manualPositionsById, setManualPositionsById] = useState<Map<string, FindingBoardPosition>>(new Map());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const pointerStartRef = useRef<PointerStartState | null>(null);
  const draggedPointerRef = useRef(false);

  const layoutById = useMemo(() => createSpikeFindingBoardLayout(cards), [cards]);

  const effectiveLayoutById = useMemo(() => {
    const merged = new Map(layoutById);
    for (const [cardId, position] of manualPositionsById) {
      if (!layoutById.has(cardId)) {
        continue;
      }
      merged.set(cardId, { id: cardId, ...position });
    }
    return merged;
  }, [layoutById, manualPositionsById]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    effectiveLayoutRef.current = effectiveLayoutById;
  }, [effectiveLayoutById]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const resizeCanvas = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width <= 0 || height <= 0) {
        return;
      }

      const devicePixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const frame = (nowMs: number) => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (width > 0 && height > 0) {
        const prev = previousFrameMsRef.current ?? nowMs;
        const deltaSeconds = Math.min((nowMs - prev) / 1000, 0.033);
        previousFrameMsRef.current = nowMs;

        syncRopesWithConnections(
          ropesRef.current,
          connectionsRef.current,
          cardElementsRef.current,
          stage,
          effectiveLayoutRef.current,
        );
        stepAndDrawRopes(context, ropesRef.current, cardElementsRef.current, stage, deltaSeconds, width, height);
      }

      animationRef.current = window.requestAnimationFrame(frame);
    };

    resizeCanvas();
    animationRef.current = window.requestAnimationFrame(frame);

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });

    resizeObserver.observe(stage);

    return () => {
      resizeObserver.disconnect();
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      previousFrameMsRef.current = null;
    };
  }, []);

  const updateDraggedCardPosition = (
    cardId: string,
    pointerX: number,
    pointerY: number,
    dragOffsetX: number,
    dragOffsetY: number,
  ) => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const position = toFindingBoardPositionFromPointer({
      pointerX: pointerX - stageRect.left,
      pointerY: pointerY - stageRect.top,
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      dragOffsetX,
      dragOffsetY,
    });

    setManualPositionsById((current) => {
      const previous = current.get(cardId);
      if (previous && previous.xPct === position.xPct && previous.yPct === position.yPct) {
        return current;
      }

      const next = new Map(current);
      next.set(cardId, position);
      return next;
    });
  };

  const onCardPointerDown = (event: ReactPointerEvent<HTMLElement>, cardId: string) => {
    if (event.button !== 0) {
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const currentPosition = effectiveLayoutById.get(cardId);
    if (!currentPosition) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const pointerX = event.clientX - stageRect.left;
    const pointerY = event.clientY - stageRect.top;

    const dragOffsetX = stage.clientWidth * currentPosition.xPct - pointerX;
    const dragOffsetY = stage.clientHeight * currentPosition.yPct - pointerY;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartRef.current = {
      cardId,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    draggedPointerRef.current = false;
    setDragState({
      cardId,
      pointerId: event.pointerId,
      dragOffsetX,
      dragOffsetY,
    });

    updateDraggedCardPosition(cardId, event.clientX, event.clientY, dragOffsetX, dragOffsetY);
  };

  const onCardPointerMove = (event: ReactPointerEvent<HTMLElement>, cardId: string) => {
    if (!dragState || dragState.cardId !== cardId || dragState.pointerId !== event.pointerId) {
      return;
    }

    const pointerStart = pointerStartRef.current;
    if (pointerStart && pointerStart.cardId === cardId && pointerStart.pointerId === event.pointerId) {
      const moveDistance = Math.hypot(event.clientX - pointerStart.clientX, event.clientY - pointerStart.clientY);
      if (moveDistance > CLICK_DRAG_THRESHOLD_PX) {
        draggedPointerRef.current = true;
      }
    }

    event.preventDefault();
    updateDraggedCardPosition(
      cardId,
      event.clientX,
      event.clientY,
      dragState.dragOffsetX,
      dragState.dragOffsetY,
    );
  };

  const onCardPointerEnd = (event: ReactPointerEvent<HTMLElement>, cardId: string) => {
    if (!dragState || dragState.cardId !== cardId || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const pointerStart = pointerStartRef.current;
    if (
      !draggedPointerRef.current &&
      pointerStart &&
      pointerStart.cardId === cardId &&
      pointerStart.pointerId === event.pointerId
    ) {
      onCardSelect?.(cardId);
    }

    pointerStartRef.current = null;
    draggedPointerRef.current = false;
    setDragState(null);
  };

  return (
    <div className="mt-4 flex justify-center">
      <div
        className="relative w-full overflow-hidden rounded-[6px] border border-[#880d1e]/70 bg-black"
        style={{
          width: "min(80dvw, 100%)",
          height: "min(80dvh, 56rem)",
          minHeight: STAGE_MIN_HEIGHT,
        }}
        ref={stageRef}
      >
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />

        {cards.length === 0 ? (
          <div className="relative z-30 flex h-full items-center justify-center px-6 text-center text-sm text-[#c39aa1]">
            Esperando findings del stream para poblar el board...
          </div>
        ) : null}

        {cards.map((card, index) => {
          const position = effectiveLayoutById.get(card.id);
          if (!position) {
            return null;
          }

          const isHubCard = index === 0;
          const isDragging = dragState?.cardId === card.id;
          const isSelected = selectedCardId === card.id;

          return (
            <article
              key={card.id}
              ref={(element) => {
                if (element) {
                  cardElementsRef.current.set(card.id, element);
                } else {
                  cardElementsRef.current.delete(card.id);
                }
              }}
              onPointerDown={(event) => onCardPointerDown(event, card.id)}
              onPointerMove={(event) => onCardPointerMove(event, card.id)}
              onPointerUp={(event) => onCardPointerEnd(event, card.id)}
              onPointerCancel={(event) => onCardPointerEnd(event, card.id)}
              className={`absolute z-10 -translate-x-1/2 rounded-[10px] border bg-[#120308]/95 p-3 text-sm shadow-[0_0_0_1px_rgba(136,13,30,0.35)] ${
                isHubCard ? "w-[168px]" : "w-[150px]"
              }`}
              style={{
                left: `${position.xPct * 100}%`,
                top: `${position.yPct * 100}%`,
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none",
                userSelect: "none",
                zIndex: isDragging ? 30 : 10,
                borderColor: isSelected
                  ? "rgba(240,189,199,0.95)"
                  : isHubCard
                    ? "rgba(221,45,74,0.75)"
                    : "rgba(136,13,30,0.75)",
              }}
            >
              <div className="finding-card-dot absolute -top-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 rounded-full border-2 border-[#120308] bg-[#dd2d4a]" />
              <p className="text-[10px] uppercase tracking-[0.07em] text-[#8c6b71]">{card.sourceType}</p>
              <h3 className="mt-1 text-xs font-semibold leading-tight text-white">{card.title}</h3>
              <p className="mt-2 text-[11px] leading-snug text-[#c39aa1]">{truncate(card.summary, 130)}</p>
              <div className="mt-2 text-[10px] leading-snug text-[#8c6b71]">
                <p>{card.sourceDomain}</p>
                <p>{new Date(card.timestamp).toLocaleTimeString()}</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function syncRopesWithConnections(
  ropeMap: Map<string, RopeState>,
  connections: FindingBoardConnection[],
  cardElements: Map<string, HTMLElement>,
  stage: HTMLElement,
  fallbackLayout: Map<string, { xPct: number; yPct: number }>,
): void {
  const seen = new Set<string>();

  for (const connection of connections) {
    seen.add(connection.id);
    const existing = ropeMap.get(connection.id);
    if (existing) {
      existing.fromId = connection.fromId;
      existing.toId = connection.toId;
      existing.reason = connection.reason;
      continue;
    }

    const fromAnchor = getCardAnchor(cardElements.get(connection.fromId), stage, fallbackLayout.get(connection.fromId));
    const toAnchor = getCardAnchor(cardElements.get(connection.toId), stage, fallbackLayout.get(connection.toId));
    if (!fromAnchor || !toAnchor) {
      continue;
    }

    ropeMap.set(connection.id, {
      id: connection.id,
      fromId: connection.fromId,
      toId: connection.toId,
      reason: connection.reason,
      particles: buildParticles(fromAnchor, toAnchor, PHYSICS_SEGMENTS, PHYSICS_SLACK_FACTOR),
    });
  }

  for (const ropeId of [...ropeMap.keys()]) {
    if (!seen.has(ropeId)) {
      ropeMap.delete(ropeId);
    }
  }
}

function stepAndDrawRopes(
  context: CanvasRenderingContext2D,
  ropeMap: Map<string, RopeState>,
  cardElements: Map<string, HTMLElement>,
  stage: HTMLElement,
  deltaSeconds: number,
  width: number,
  height: number,
): void {
  const devicePixelRatio = window.devicePixelRatio || 1;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width * devicePixelRatio, height * devicePixelRatio);
  context.restore();

  for (const rope of ropeMap.values()) {
    const fromAnchor = getCardAnchor(cardElements.get(rope.fromId), stage);
    const toAnchor = getCardAnchor(cardElements.get(rope.toId), stage);
    if (!fromAnchor || !toAnchor) {
      continue;
    }

    stepRope(rope, fromAnchor, toAnchor, deltaSeconds);
    drawRope(context, rope);
  }
}

function stepRope(rope: RopeState, from: AnchorPoint, to: AnchorPoint, deltaSeconds: number): void {
  const particles = rope.particles;
  if (particles.length < 2) {
    return;
  }

  const first = particles[0];
  const last = particles[particles.length - 1];
  if (!first || !last) {
    return;
  }

  first.x = first.prevX = from.x;
  first.y = first.prevY = from.y;
  last.x = last.prevX = to.x;
  last.y = last.prevY = to.y;

  const gravityDelta = PHYSICS_GRAVITY * deltaSeconds * deltaSeconds;
  for (const particle of particles) {
    if (particle.pinned) {
      continue;
    }

    const vx = (particle.x - particle.prevX) * PHYSICS_DAMPING;
    const vy = (particle.y - particle.prevY) * PHYSICS_DAMPING;
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    particle.x += vx;
    particle.y += vy + gravityDelta;
  }

  for (let iteration = 0; iteration < PHYSICS_ITERATIONS; iteration += 1) {
    for (let index = 0; index < particles.length - 1; index += 1) {
      const current = particles[index];
      const next = particles[index + 1];
      if (!current || !next) {
        continue;
      }

      const deltaX = next.x - current.x;
      const deltaY = next.y - current.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 0.0001;
      const correction = ((distance - current.segmentLength) / distance) * 0.5;
      const correctionX = deltaX * correction;
      const correctionY = deltaY * correction;

      if (!current.pinned) {
        current.x += correctionX;
        current.y += correctionY;
      }

      if (!next.pinned) {
        next.x -= correctionX;
        next.y -= correctionY;
      }
    }
  }
}

function drawRope(context: CanvasRenderingContext2D, rope: RopeState): void {
  const particles = rope.particles;
  if (particles.length < 2) {
    return;
  }

  context.beginPath();
  context.moveTo(particles[0]?.x ?? 0, particles[0]?.y ?? 0);
  for (let index = 1; index < particles.length; index += 1) {
    const particle = particles[index];
    if (!particle) {
      continue;
    }

    context.lineTo(particle.x, particle.y);
  }

  context.lineWidth = 1.6;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle =
    rope.reason === "semantic" ? "rgba(221,45,74,0.95)" : "rgba(136,13,30,0.82)";
  context.stroke();

  for (const index of [0, particles.length - 1]) {
    const anchor = particles[index];
    if (!anchor) {
      continue;
    }

    context.beginPath();
    context.arc(anchor.x, anchor.y, 5.5, 0, Math.PI * 2);
    context.fillStyle = "#880d1e";
    context.fill();

    context.beginPath();
    context.arc(anchor.x, anchor.y, 3.5, 0, Math.PI * 2);
    context.fillStyle = "#dd2d4a";
    context.fill();
  }
}

function buildParticles(from: AnchorPoint, to: AnchorPoint, segments: number, slackFactor: number): RopeParticle[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const totalLength = Math.max(distance * slackFactor, 1);
  const segmentLength = totalLength / segments;
  const particles: RopeParticle[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    particles.push({
      x,
      y,
      prevX: x,
      prevY: y,
      pinned: index === 0 || index === segments,
      segmentLength,
    });
  }

  return particles;
}

function getCardAnchor(
  cardElement: HTMLElement | undefined,
  stage: HTMLElement,
  fallbackPosition?: { xPct: number; yPct: number },
): AnchorPoint | null {
  if (cardElement) {
    const dot = cardElement.querySelector<HTMLElement>(".finding-card-dot");
    if (dot) {
      const stageRect = stage.getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      return {
        x: dotRect.left - stageRect.left + dotRect.width / 2,
        y: dotRect.top - stageRect.top + dotRect.height / 2,
      };
    }
  }

  if (fallbackPosition) {
    return {
      x: stage.clientWidth * fallbackPosition.xPct,
      y: stage.clientHeight * fallbackPosition.yPct,
    };
  }

  return null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}
