import { WS_ENTITIES, PERCORSI_WS, type WsEntity } from "@shared/wsEntities";

// Riesportati così il resto del server importa tutto da "./config".
export { WS_ENTITIES, ETICHETTE_ENTITA, PERCORSI_WS } from "@shared/wsEntities";
export type { WsEntity } from "@shared/wsEntities";

export type ModalitaSorgente = "http" | "file";

export type ConfigEntita = {
  mode: ModalitaSorgente;
  url: string | null;
  path: string | null;
};

export type ConfigWs = {
  auth: string | null;
  /** Prefisso comune degli endpoint HTTP; le URL per entità lo scavalcano. */
  base: string | null;
  entita: Record<WsEntity, ConfigEntita>;
};

export const CHIAVE_BASE = "ws.base";

export function chiaveSetting(entita: WsEntity, campo: "mode" | "url" | "path"): string {
  return `ws.${entita}.${campo}`;
}

function valoreONull(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

export function leggiConfigWs(settings: Record<string, string>): ConfigWs {
  const entita = {} as Record<WsEntity, ConfigEntita>;
  for (const e of WS_ENTITIES) {
    const modeGrezza = valoreONull(settings[chiaveSetting(e, "mode")]);
    entita[e] = {
      mode: modeGrezza === "file" ? "file" : "http",
      url: valoreONull(settings[chiaveSetting(e, "url")]),
      path: valoreONull(settings[chiaveSetting(e, "path")]),
    };
  }
  return {
    auth: valoreONull(settings["ws.auth"]),
    base: valoreONull(settings[CHIAVE_BASE]),
    entita,
  };
}

/**
 * L'indirizzo HTTP di un'entità: la sua URL propria, oppure la base più il
 * percorso dell'entità. `null` se non c'è né l'una né l'altra.
 */
export function urlEntita(config: ConfigWs, entita: WsEntity): string | null {
  const propria = config.entita[entita].url;
  if (propria !== null) return propria;
  if (config.base === null) return null;
  // La barra finale della base va tolta, non raddoppiata: chi incolla un
  // indirizzo dal browser se la porta dietro quasi sempre.
  return config.base.replace(/\/+$/, "") + PERCORSI_WS[entita];
}

/** Un'entità è utilizzabile se la sua modalità ha di che lavorare. */
export function entitaConfigurata(config: ConfigWs, entita: WsEntity): boolean {
  const c = config.entita[entita];
  return c.mode === "file" ? c.path !== null : urlEntita(config, entita) !== null;
}
