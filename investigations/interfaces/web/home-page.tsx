"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent, ReactElement } from "react";

import type { InvestigationResponse } from "@/investigations/interfaces/web/contracts";
import {
  createInvestigation,
  deleteInvestigation,
  listInvestigations,
  startInvestigation,
} from "@/investigations/interfaces/web/investigations-api";

type AsyncState = "idle" | "loading" | "error";

export function HomePage(): ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [items, setItems] = useState<InvestigationResponse[]>([]);
  const [listState, setListState] = useState<AsyncState>("loading");
  const [createState, setCreateState] = useState<AsyncState>("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshInvestigations = async (): Promise<void> => {
    setListState("loading");
    setErrorMessage(null);

    try {
      const response = await listInvestigations();
      setItems(response);
      setListState("idle");
    } catch (error: unknown) {
      setListState("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo cargar el listado.");
    }
  };

  useEffect(() => {
    void refreshInvestigations();
  }, []);

  const canSubmit = query.trim().length > 0 && createState !== "loading";

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }

    setCreateState("loading");
    setErrorMessage(null);

    try {
      const created = await createInvestigation({ query: normalizedQuery });
      setItems((previous) => [created, ...previous]);
      setQuery("");
      setCreateState("idle");

      if (autoStart) {
        void startInvestigation(created.id).catch(() => {
          // El detalle tambien auto-inicia como respaldo.
        });
      }

      router.push(`/investigation/${created.id}`);
    } catch (error: unknown) {
      setCreateState("error");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo crear la investigacion.");
    }
  };

  const onDelete = async (investigationId: string): Promise<void> => {
    if (deletingId) {
      return;
    }

    const shouldDelete = window.confirm("Esta accion elimina la investigacion. Continuar?");
    if (!shouldDelete) {
      return;
    }

    setDeletingId(investigationId);
    setErrorMessage(null);

    try {
      await deleteInvestigation(investigationId);
      await refreshInvestigations();
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudo eliminar la investigacion.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <section className="rounded-2xl border border-[#dd2d4a]/35 bg-gradient-to-br from-[#1a0509] via-[#110307] to-black p-6 shadow-[0_0_40px_rgba(136,13,30,0.25)]">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Investigaciones</h1>
        <p className="mt-2 text-sm text-[#c39aa1]">
          Arranca una investigacion y entra directo al board en tiempo real.
        </p>

        <form className="mt-5 flex flex-col gap-3" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="query">
            Tema de investigacion
          </label>
          <input
            id="query"
            name="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ejemplo: conexiones entre contratos publicos y proveedores"
            className="w-full rounded-lg border border-[#dd2d4a]/35 bg-black/60 px-4 py-3 text-sm text-white outline-none placeholder:text-[#c39aa1]/75 focus:border-[#dd2d4a]"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-[#f5d7dd]">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(event) => setAutoStart(event.target.checked)}
                className="size-4 rounded border border-[#dd2d4a]/50 bg-black"
              />
              Auto-start al crear
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-[#dd2d4a] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createState === "loading" ? "Creando..." : "Crear e ir al board"}
            </button>
          </div>
        </form>

        {errorMessage ? <p className="mt-3 text-sm text-red-300">{errorMessage}</p> : null}
      </section>

      <section className="rounded-2xl border border-[#880d1e]/45 bg-[#130409] p-4">
        <h2 className="text-lg font-semibold text-white">Recientes</h2>
        {listState === "loading" ? <p className="mt-3 text-sm text-[#c39aa1]">Cargando...</p> : null}
        {listState === "error" ? (
          <p className="mt-3 text-sm text-red-300">No se pudo cargar el listado.</p>
        ) : null}
        {listState === "idle" && items.length === 0 ? (
          <p className="mt-3 text-sm text-[#c39aa1]">No hay investigaciones todavia.</p>
        ) : null}
        {items.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {items.map((investigation) => (
              <li
                key={investigation.id}
                className="rounded-lg border border-[#880d1e]/50 bg-black/35 p-3 text-sm text-[#f4cfd6]"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-white">{investigation.query}</p>
                    <p className="text-xs text-[#c39aa1]">
                      Estado: {investigation.status} - Creada: {new Date(investigation.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Link
                    href={`/investigation/${investigation.id}`}
                    className="inline-flex rounded-md border border-[#dd2d4a]/70 px-3 py-1 text-xs font-medium text-white"
                  >
                    Abrir
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onDelete(investigation.id)}
                    disabled={deletingId === investigation.id}
                    className="inline-flex rounded-md border border-red-400/70 px-3 py-1 text-xs font-medium text-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === investigation.id ? "Eliminando..." : "Eliminar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
