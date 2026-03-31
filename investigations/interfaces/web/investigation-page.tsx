"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";

import type { InvestigationResponse } from "@/investigations/interfaces/web/contracts";
import type { InvestigationRunDiagnosticsResponse } from "@/investigations/interfaces/web/contracts";
import { FindingBoardCanvas } from "@/investigations/interfaces/web/finding-board-canvas";
import {
  buildFindingBoardCards,
  buildFindingBoardConnections,
} from "@/investigations/interfaces/web/finding-board";
import {
  buildInvestigationNarrative,
  resolveSelectedFindingCard,
} from "@/investigations/interfaces/web/investigation-narrative";
import {
  getRunDiagnostics,
  getInvestigationById,
  startInvestigation,
} from "@/investigations/interfaces/web/investigations-api";
import { shouldShowFinalReport } from "@/investigations/interfaces/web/investigation-run-state";
import { useInvestigationEvents } from "@/investigations/interfaces/web/use-investigation-events";

type InvestigationPageProps = {
  investigationId: string;
};

type LoadState = "loading" | "ready" | "error";

export function InvestigationPage({ investigationId }: InvestigationPageProps): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [investigation, setInvestigation] = useState<InvestigationResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startState, setStartState] = useState<"idle" | "starting" | "started" | "error">("idle");
  const [startMessage, setStartMessage] = useState<string | null>(null);
  const [runDiagnostics, setRunDiagnostics] = useState<InvestigationRunDiagnosticsResponse | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const { status, events, runState, errorMessage } = useInvestigationEvents(investigationId);
  const activeRunDiagnostics =
    runDiagnostics && runState.runId && runDiagnostics.runId === runState.runId ? runDiagnostics : null;
  const findingCards = useMemo(
    () => buildFindingBoardCards(investigation?.findings ?? [], events),
    [investigation?.findings, events],
  );
  const findingConnections = useMemo(
    () =>
      buildFindingBoardConnections(
        investigation?.findings ?? [],
        events,
        investigation?.findingConnections ?? [],
      ),
    [investigation?.findings, investigation?.findingConnections, events],
  );
  const showFinalReport = shouldShowFinalReport(runState);
  const structuredReport = runState.finalReport;
  const topFailureReasons = structuredReport?.topFailureReasons ?? runState.runSummary?.topFailureReasons ?? [];
  const hasZeroFindings = runState.runSummary ? runState.runSummary.findingsCount === 0 : findingCards.length === 0;
  const narrative = useMemo(
    () =>
      buildInvestigationNarrative({
        runState,
        structuredReport,
        findingCards,
        findingConnections,
      }),
    [findingCards, findingConnections, runState, structuredReport],
  );
  const selectedCard = useMemo(
    () =>
      selectedCardId && findingCards.some((card) => card.id === selectedCardId)
        ? resolveSelectedFindingCard(findingCards, selectedCardId)
        : null,
    [findingCards, selectedCardId],
  );

  useEffect(() => {
    const activeRunId = runState.runId;
    if (!activeRunId) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const diagnostics = await getRunDiagnostics(investigationId, activeRunId);
        if (!cancelled) {
          setRunDiagnostics(diagnostics);
          setDiagnosticsError(null);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setRunDiagnostics(null);
          setDiagnosticsError(
            error instanceof Error ? error.message : "No se pudo cargar el diagnostico de corrida.",
          );
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [investigationId, runState.runId, runState.status]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadState("loading");
      setLoadError(null);

      try {
        const response = await getInvestigationById(investigationId);

        if (!cancelled) {
          setInvestigation(response);
          setLoadState("ready");
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setLoadState("error");
          setLoadError(error instanceof Error ? error.message : "No se pudo cargar la investigacion.");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [investigationId]);

  const onStart = async () => {
    setStartState("starting");
    setStartMessage(null);

    try {
      const result = await startInvestigation(investigationId);
      setStartState("started");
      setStartMessage(
        result.status === "already_running"
          ? `La corrida ya estaba en curso (${result.mode}).`
          : `Corrida iniciada en modo ${result.mode}.`,
      );
      const response = await getInvestigationById(investigationId);
      setInvestigation(response);
    } catch (error: unknown) {
      setStartState("error");
      setStartMessage(
        error instanceof Error ? error.message : "No se pudo iniciar la corrida de investigacion.",
      );
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="rounded-2xl border border-[#dd2d4a]/35 bg-gradient-to-br from-[#1a0509] via-[#120307] to-black p-5">
        <div className="mb-3">
          <Link href="/" className="text-sm text-[#f0bdc7] underline decoration-[#dd2d4a]/70">
            Volver al inicio
          </Link>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Investigacion</h1>

        {loadState === "loading" ? <p className="mt-3 text-sm text-[#c39aa1]">Cargando...</p> : null}
        {loadState === "error" ? <p className="mt-3 text-sm text-red-300">{loadError}</p> : null}

        {loadState === "ready" && investigation ? (
          <dl className="mt-3 grid gap-2 text-sm text-[#f0d3d9] sm:grid-cols-2">
            <div>
              <dt className="font-medium text-white">ID</dt>
              <dd className="break-all">{investigation.id}</dd>
            </div>
            <div>
              <dt className="font-medium text-white">Estado</dt>
              <dd>{investigation.status}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-medium text-white">Query</dt>
              <dd>{investigation.query}</dd>
            </div>
            <div>
              <dt className="font-medium text-white">Creada</dt>
              <dd>{new Date(investigation.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-medium text-white">Actualizada</dt>
              <dd>{new Date(investigation.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={startState === "starting"}
            className="rounded-lg bg-[#dd2d4a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {startState === "starting" ? "Iniciando..." : "Iniciar investigacion"}
          </button>
          {startMessage ? <p className="text-sm text-[#f2c6cf]">{startMessage}</p> : null}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-[#880d1e]/60 bg-[#150409] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#c39aa1]">SSE</p>
          <p className="mt-2 text-lg font-semibold text-white">{labelForStreamStatus(status)}</p>
          {errorMessage ? <p className="mt-1 text-sm text-red-300">{errorMessage}</p> : null}
        </article>

        <article className="rounded-xl border border-[#880d1e]/60 bg-[#150409] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#c39aa1]">Run</p>
          <p className="mt-2 text-lg font-semibold text-white">{runState.status}</p>
          <p className="mt-1 text-sm text-[#f0d3d9]">{runState.summaryMessage}</p>
        </article>

        <article className="rounded-xl border border-[#880d1e]/60 bg-[#150409] p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[#c39aa1]">Progreso</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatRoundSummary(runState.progress.round, runState.progress.maxRounds)}
          </p>
          <p className="mt-1 text-sm text-[#f0d3d9]">
            workers {runState.progress.processedWorkers} ok / {runState.progress.failedWorkers} fail
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-[#880d1e]/60 bg-[#120308] p-4">
        <h2 className="text-xl font-semibold text-white">Board de findings</h2>
        <p className="mt-2 text-sm text-[#c39aa1]">
          Click en una card para inspeccionar detalle completo. El drag y las conexiones siguen activos.
        </p>
        <FindingBoardCanvas
          cards={findingCards}
          connections={findingConnections}
          selectedCardId={selectedCardId}
          onCardSelect={(cardId) => setSelectedCardId(cardId)}
        />
      </section>

      {selectedCard ? (
        <section className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-2xl border border-[#dd2d4a]/55 bg-[#120308] p-5 shadow-2xl shadow-black/70"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[#c39aa1]">Detalle de card</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{selectedCard.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCardId(null)}
                className="rounded-md border border-[#880d1e]/75 px-3 py-1 text-xs font-semibold text-[#f0d3d9]"
              >
                Cerrar
              </button>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-[#f0d3d9]">{selectedCard.summary}</p>

            <dl className="mt-4 grid gap-3 text-sm text-[#f0d3d9] sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-[#c39aa1]">Fuente</dt>
                <dd>{selectedCard.sourceType}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-[#c39aa1]">Dominio</dt>
                <dd>{selectedCard.sourceDomain}</dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg border border-[#5f0b17] bg-[#0d0206] p-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#c39aa1]">Evidencia disponible</h4>
              {selectedCard.evidence.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#f0d3d9]">
                  {selectedCard.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[#c39aa1]">No se adjuntaron evidencias explicitas para este finding.</p>
              )}
            </div>

            <a
              href={selectedCard.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-md border border-[#dd2d4a]/75 bg-[#dd2d4a]/15 px-3 py-2 text-sm font-semibold text-[#ffd6de] underline"
            >
              Abrir fuente original
            </a>
          </div>
        </section>
      ) : null}

      {showFinalReport ? (
        <section className="rounded-2xl border border-[#dd2d4a]/45 bg-gradient-to-br from-[#0f0205] via-[#13040a] to-[#080104] p-4">
          <h2 className="text-xl font-semibold text-white">Reporte investigativo</h2>

          <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#120308] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Conclusion ejecutiva</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#f0d3d9]">{narrative.executiveConclusion}</p>
          </article>

          <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#120308] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Conexiones clave</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#f0d3d9]">
              {narrative.keyConnections.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>

          <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#120308] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Evidencia principal</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#f0d3d9]">
              {narrative.mainEvidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>

          <article className="mt-4 rounded-xl border border-amber-400/50 bg-amber-200/10 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">Incertidumbres y gaps</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100">
              {narrative.uncertainties.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>

          <details className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#120308] p-4">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">
              Diagnostico tecnico
            </summary>

            {structuredReport ? (
              <>
                <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#0d0206] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Cobertura y terminacion</h3>
                  <dl className="mt-3 grid gap-2 text-sm text-[#f0d3d9] sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-[#c39aa1]">Workers reportados</dt>
                      <dd className="font-semibold text-white">
                        {structuredReport.coverage.workersReported}/{structuredReport.coverage.totalWorkers}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">Productivos / Fallidos / Idle</dt>
                      <dd className="font-semibold text-white">
                        {structuredReport.coverage.productiveWorkers} / {structuredReport.coverage.failedWorkers} / {structuredReport.coverage.idleWorkers}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">Findings creados</dt>
                      <dd className="font-semibold text-white">{structuredReport.coverage.findingsCreatedTotal}</dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">Coverage ratio</dt>
                      <dd className="font-semibold text-white">
                        {(structuredReport.coverage.findingsCoverageRatio * 100).toFixed(1)}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">Termination</dt>
                      <dd className="font-semibold text-white">
                        {structuredReport.termination.status} / {structuredReport.termination.reason}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">Rounds ejecutadas</dt>
                      <dd className="font-semibold text-white">{structuredReport.termination.roundsExecuted}</dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">URLs procesadas / fallidas</dt>
                      <dd className="font-semibold text-white">
                        {structuredReport.coverage.urlsProcessedTotal} / {structuredReport.coverage.urlsFailedTotal}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#c39aa1]">URLs reservadas</dt>
                      <dd className="font-semibold text-white">{structuredReport.coverage.urlsReservedTotal}</dd>
                    </div>
                  </dl>
                </article>

                <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#0d0206] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Mini reportes por agente</h3>
                  {structuredReport.agentReports.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#f0d3d9]">
                      {structuredReport.agentReports.map((report) => (
                        <li key={report.workerId} className="rounded-lg border border-[#5f0b17] bg-[#120308] px-3 py-2">
                          <p className="font-semibold text-white">
                            {report.workerId} - {report.status}
                          </p>
                          <p className="mt-1 text-xs text-[#c39aa1]">{report.note}</p>
                          <p className="mt-1 text-xs text-[#f0d3d9]">
                            round {report.round} - node {report.node}
                            {report.processedUrl ? ` - ${report.processedUrl}` : ""}
                            {report.errorCode ? ` - error ${report.errorCode}` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-[#c39aa1]">No hubo reportes de agentes en el payload final.</p>
                  )}
                </article>

                <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#0d0206] p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Hallazgos clave</h3>
                  {structuredReport.keyFindings.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-[#f0d3d9]">
                      {structuredReport.keyFindings.map((finding) => (
                        <li key={finding.id} className="rounded-lg border border-[#5f0b17] bg-[#120308] px-3 py-2">
                          <p className="font-semibold text-white">{finding.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#c39aa1]">
                            confidence {finding.confidence}
                          </p>
                          <p className="mt-1 text-sm text-[#f0d3d9]">{finding.summary}</p>
                          <p className="mt-1 break-all text-xs text-[#f2c6cf]">{finding.sourceUrl}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-[#c39aa1]">No se consolidaron hallazgos clave para esta corrida.</p>
                  )}
                </article>
              </>
            ) : null}

            {runState.runSummary ? (
              <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#0d0206] p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Resumen de corrida</h3>
                <dl className="mt-3 grid gap-2 text-sm text-[#f0d3d9] sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-[#c39aa1]">Findings</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.findingsCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">Workers productivos</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.productiveWorkers}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">Workers fallidos</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.failedWorkers}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">Total workers</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.totalWorkers}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">Termination</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.terminationReason}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">URLs reservadas</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.urlsReservedTotal}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">URLs procesadas</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.urlsProcessedTotal}</dd>
                  </div>
                  <div>
                    <dt className="text-[#c39aa1]">URLs fallidas</dt>
                    <dd className="font-semibold text-white">{runState.runSummary.urlsFailedTotal}</dd>
                  </div>
                </dl>
              </article>
            ) : null}

            {topFailureReasons.length > 0 ? (
              <article className="mt-4 rounded-xl border border-[#880d1e]/60 bg-[#0d0206] p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#c39aa1]">Top failure reasons</h3>
                <ul className="mt-3 list-disc pl-5 text-sm text-[#f0d3d9]">
                  {topFailureReasons.map((reason) => (
                    <li key={reason.errorCode}>
                      {reason.errorCode}: {reason.count}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}
          </details>

          {hasZeroFindings ? (
            <div className="mt-4 rounded-lg border border-amber-400/60 bg-amber-200/10 p-3">
              <p className="text-sm font-medium text-amber-100">
                La corrida termino sin findings. Revisa el resumen de fallo para diagnosticar rapido.
              </p>
              {activeRunDiagnostics?.latestWorkerErrors && activeRunDiagnostics.latestWorkerErrors.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-amber-100">
                  {activeRunDiagnostics.latestWorkerErrors.map((error) => (
                    <li key={`${error.workerId}-${error.timestamp}`}>
                      {error.workerId}: [{error.stage}] {error.errorCode} - {error.shortMessage}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {diagnosticsError ? <p className="mt-3 text-sm text-red-200">{diagnosticsError}</p> : null}
        </section>
      ) : null}
    </main>
  );
}

function formatRoundSummary(round: number | null, maxRounds: number | null): string {
  if (round === null || maxRounds === null) {
    return "Sin actividad reciente";
  }

  return `${round}/${maxRounds}`;
}

function labelForStreamStatus(status: string): string {
  if (status === "connected") {
    return "Conectado";
  }

  if (status === "connecting") {
    return "Conectando";
  }

  if (status === "disconnected") {
    return "Desconectado";
  }

  return "Con error";
}
