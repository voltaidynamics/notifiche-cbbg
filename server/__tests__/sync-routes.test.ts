import { describe, it, expect } from "vitest";
import { componiStatoSync } from "../sync/stato";
import type { SyncLog } from "@shared/schema";

function log(over: Partial<SyncLog>): SyncLog {
  return {
    id: 1, trigger: "manuale", startedAt: new Date("2026-07-27T10:00:00Z"),
    finishedAt: null, status: "running", entityCounts: null, errors: null, ...over,
  };
}

describe("componiStatoSync", () => {
  it("senza log restituisce tutto nullo", () => {
    expect(componiStatoSync([], false)).toEqual({ inCorso: false, ultimo: null, ultimoCompletato: null });
  });

  it("il log più recente è 'ultimo'", () => {
    const recenti = [log({ id: 3 }), log({ id: 2, status: "success" })];
    expect(componiStatoSync(recenti, true).ultimo?.id).toBe(3);
  });

  it("'ultimoCompletato' salta i log ancora in esecuzione", () => {
    const recenti = [log({ id: 3, status: "running" }), log({ id: 2, status: "partial" })];
    expect(componiStatoSync(recenti, true).ultimoCompletato?.id).toBe(2);
  });

  it("un log fallito NON conta come completato", () => {
    const recenti = [log({ id: 2, status: "failed" })];
    expect(componiStatoSync(recenti, false).ultimoCompletato).toBeNull();
  });

  it("un log parziale conta come completato", () => {
    const recenti = [log({ id: 2, status: "partial" })];
    expect(componiStatoSync(recenti, false).ultimoCompletato?.id).toBe(2);
  });

  it("'ultimoCompletato' salta un log fallito più recente per trovare l'ultimo success/partial", () => {
    const recenti = [log({ id: 3, status: "failed" }), log({ id: 2, status: "success" })];
    expect(componiStatoSync(recenti, false).ultimoCompletato?.id).toBe(2);
  });
});
