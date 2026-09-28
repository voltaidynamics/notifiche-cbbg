import { readFile } from "node:fs/promises";
import {
  type ConfigWs, type WsEntity, ETICHETTE_ENTITA, entitaConfigurata, urlEntita,
} from "./config";

const TIMEOUT_MS = 20_000;

export class SorgenteNonConfigurata extends Error {
  constructor(entita: WsEntity) {
    super(`Sorgente non configurata per: ${ETICHETTE_ENTITA[entita]}`);
    this.name = "SorgenteNonConfigurata";
  }
}

export interface WsSource {
  fetchRaw(entita: WsEntity, params?: Record<string, string>): Promise<unknown>;
}

/**
 * Il consorzio non ha ancora fissato la forma della risposta: accettiamo sia
 * un array diretto sia un oggetto che ne contiene uno.
 */
export function estraiArray(grezzo: unknown): unknown[] {
  if (grezzo == null) return [];
  if (Array.isArray(grezzo)) return grezzo;
  if (typeof grezzo === "object") {
    for (const v of Object.values(grezzo as Record<string, unknown>)) {
      if (Array.isArray(v)) return v;
    }
  }
  throw new Error("Forma della risposta non riconosciuta: atteso un array");
}

async function leggiDaFile(percorso: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(percorso, "utf8"));
  } catch (e) {
    throw new Error(`Lettura di ${percorso} fallita: ${(e as Error).message}`);
  }
}

async function leggiDaHttp(
  url: string,
  auth: string | null,
  params?: Record<string, string>,
): Promise<unknown> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const indirizzo = qs ? `${url}?${qs}` : url;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) headers.Authorization = auth;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(indirizzo, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`${indirizzo} ha risposto ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Sorgente unica che sceglie file o HTTP entità per entità. */
export function creaSource(config: ConfigWs): WsSource {
  return {
    async fetchRaw(entita, params) {
      if (!entitaConfigurata(config, entita)) throw new SorgenteNonConfigurata(entita);
      const c = config.entita[entita];
      return c.mode === "file"
        ? leggiDaFile(c.path as string)
        : leggiDaHttp(urlEntita(config, entita) as string, config.auth, params);
    },
  };
}
