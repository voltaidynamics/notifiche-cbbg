// Lettura dei campi JSON di sync_logs, condivisa fra server e client.
//
// `errors`, `entityCounts` e `skippedEntities` sono colonne di testo: vanno
// trattate come dati esterni non fidati, non come JSON già validato. Un parse
// fallito degrada a valore vuoto invece di far risalire l'eccezione — sul client
// durante il render non c'è un ErrorBoundary a intercettarla, sul server farebbe
// fallire la rotta che legge lo storico.
//
// Stanno in shared/ perché le usano l'email di riepilogo (server) e sia la
// pagina Anagrafiche sia lo storico dei caricamenti (client): due copie
// divergenti mostrerebbero lo stesso log in due modi diversi.
import { ETICHETTE_ENTITA, type WsEntity } from "./wsEntities";

/**
 * Chiavi dei conteggi che sync-all.ts produce ma che non sono un'entità di
 * WS_ENTITIES: le tre scritture nel registro (madri/tratte/legami, che
 * sommano più entità) e le diagnostiche (righe scartate, madri/tratte di
 * servizio, tipi di irrigazione ignoti). Senza questa mappa comparirebbero
 * in pagina Impostazioni così come sono, ad es. "tratteScartate".
 */
const ETICHETTE_CONTEGGIO: Record<string, string> = {
  madri: "Madri",
  tratte: "Tratte",
  legami: "Legami",
  tratteScartate: "Tratte scartate (aggregazioni non IM)",
  tratteSenzaMadre: "Tratte scartate (codice troppo corto)",
  tratteNonGruppo: "Tratte S scartate (non gruppi di consegna)",
  legamiScartati: "Legami scartati (codici N o codice troppo corto)",
  madriDiServizio: "Madri non classificate create",
  tratteDiServizio: "Tratte non classificate create",
  madriTipoIgnoto: "Impianti con tipo irrigazione sconosciuto",
  madriRogge: "Rogge madri (R)",
  tratteRogge: "Tratte delle rogge madri",
  roggeFiglieScartate: "Righe scartate dalla gerarchia R (codice non valido)",
  roggeFiglieSenzaMadre: "Tratte R senza madre in elenco (mostrate con madre «-»)",
  roggeMadriDuplicate: "Rogge madri ripetute nell'elenco (tenuta la prima)",
};

/** Chiavi che non sono né un'entità di WS_ENTITIES né in ETICHETTE_CONTEGGIO ripiegano sulla chiave stessa. */
export function etichettaConteggio(chiave: string): string {
  return ETICHETTE_CONTEGGIO[chiave] ?? ETICHETTE_ENTITA[chiave as WsEntity] ?? chiave;
}

/** Errori ed entità saltate: stessa forma, campi distinti e significati diversi. */
export function analizzaArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function analizzaConteggi(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function riassumiConteggi(conteggi: Record<string, number>): string {
  return Object.entries(conteggi)
    .map(([chiave, n]) => `${etichettaConteggio(chiave)}: ${n}`)
    .join(" · ");
}
