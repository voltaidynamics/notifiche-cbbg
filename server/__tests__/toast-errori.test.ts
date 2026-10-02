import { describe, it, expect } from "vitest";
import { reducer } from "../../client/src/hooks/use-toast";

// Errori e conferme in due liste separate (issue #100): l'errore va nel popup
// e nessuna conferma lo può scalzare.
const vuoto = { toasts: [], errori: [] };
const errore = (id: string) => ({ id, title: "Errore", variant: "destructive" as const, open: true });
const conferma = (id: string) => ({ id, title: "Salvato", open: true });

describe("reducer dei toast (issue #100)", () => {
  it("un toast destructive finisce fra gli errori, non fra le conferme", () => {
    const s = reducer(vuoto, { type: "ADD_TOAST", toast: errore("1") });
    expect(s.errori.map((t) => t.id)).toEqual(["1"]);
    expect(s.toasts).toEqual([]);
  });

  it("una conferma arrivata dopo non scalza l'errore aperto", () => {
    let s = reducer(vuoto, { type: "ADD_TOAST", toast: errore("1") });
    s = reducer(s, { type: "ADD_TOAST", toast: conferma("2") });
    expect(s.errori.map((t) => t.id)).toEqual(["1"]);
    expect(s.toasts.map((t) => t.id)).toEqual(["2"]);
  });

  it("gli errori si accodano e la chiusura toglie solo il primo", () => {
    let s = reducer(vuoto, { type: "ADD_TOAST", toast: errore("1") });
    s = reducer(s, { type: "ADD_TOAST", toast: errore("2") });
    s = reducer(s, { type: "DISMISS_TOAST", toastId: "1" });
    expect(s.errori.map((t) => t.id)).toEqual(["2"]);
  });

  it("un dismiss senza id chiude le conferme ma lascia gli errori", () => {
    let s = reducer(vuoto, { type: "ADD_TOAST", toast: errore("1") });
    s = reducer(s, { type: "ADD_TOAST", toast: conferma("2") });
    s = reducer(s, { type: "DISMISS_TOAST" });
    expect(s.errori.map((t) => t.id)).toEqual(["1"]);
    expect(s.toasts[0].open).toBe(false);
  });
});
