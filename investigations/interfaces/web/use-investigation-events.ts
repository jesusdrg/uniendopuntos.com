"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  InvestigationRunState,
  InvestigationStreamEvent,
  StreamConnectionStatus,
} from "@/investigations/interfaces/web/contracts";
import { buildRunState } from "@/investigations/interfaces/web/investigation-run-state";
import { parseInvestigationStreamMessage } from "@/investigations/interfaces/web/investigation-stream-parser";

const MAX_EVENTS = 100;

export function useInvestigationEvents(investigationId: string): {
  status: StreamConnectionStatus;
  events: InvestigationStreamEvent[];
  runState: InvestigationRunState;
  errorMessage: string | null;
} {
  const normalizedInvestigationId = investigationId.trim();
  const hasValidInvestigationId = normalizedInvestigationId.length > 0;
  const [status, setStatus] = useState<StreamConnectionStatus>("connecting");
  const [events, setEvents] = useState<InvestigationStreamEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const streamUrl = useMemo(() => {
    const encodedId = encodeURIComponent(normalizedInvestigationId);
    return `/api/investigations/${encodedId}/events?payloadMode=strict-v2`;
  }, [normalizedInvestigationId]);

  useEffect(() => {
    if (!hasValidInvestigationId) {
      return;
    }

    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      setStatus("connected");
      setErrorMessage(null);
      setEvents([]);
    };

    eventSource.addEventListener("investigation.stream_state", (event) => {
      if (!(event instanceof MessageEvent)) {
        return;
      }

      appendEvent(event, "investigation.stream_state", setEvents);
    });

    const domainEvents = [
      "investigation.created",
      "investigation.finding_added",
      "investigation.finding_connections_updated",
      "investigation.blocked_source_registered",
      "investigation.run_started",
      "investigation.run_progress",
      "investigation.worker_reported",
      "investigation.run_summary",
      "investigation.final_report_ready",
      "investigation.run_completed",
      "investigation.run_failed",
      "created",
      "finding_added",
      "finding_connections_updated",
      "blocked_source_registered",
      "run_started",
      "run_progress",
      "worker_reported",
      "run_summary",
      "final_report_ready",
      "run_completed",
      "run_failed",
    ] as const;

    for (const eventType of domainEvents) {
      eventSource.addEventListener(eventType, (event) => {
        if (!(event instanceof MessageEvent)) {
          return;
        }

        appendEvent(event, eventType, setEvents);
      });
    }

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
        setErrorMessage("Stream cerrado por el servidor.");
        return;
      }

      setStatus("error");
      setErrorMessage("Stream desconectado o con error de transporte.");
    };

    return () => {
      eventSource.close();
    };
  }, [hasValidInvestigationId, streamUrl]);

  return {
    status: hasValidInvestigationId ? status : "error",
    events: hasValidInvestigationId ? events : [],
    runState: buildRunState(hasValidInvestigationId ? events : []),
    errorMessage: hasValidInvestigationId ? errorMessage : "Investigation ID invalido para SSE.",
  };
}

function appendEvent(
  event: MessageEvent,
  fallbackType: string,
  setEvents: Dispatch<SetStateAction<InvestigationStreamEvent[]>>,
): void {
  const normalized = parseInvestigationStreamMessage({
    eventType: fallbackType,
    data: String(event.data ?? ""),
  });

  setEvents((previous) => {
    const next = [normalized, ...previous];

    if (next.length <= MAX_EVENTS) {
      return next;
    }

    return next.slice(0, MAX_EVENTS);
  });
}
