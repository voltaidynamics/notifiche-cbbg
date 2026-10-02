/**
 * Configurazione della verifica Active Directory (issue #96).
 *
 * Il bind lo fa il web service del consorzio, endpoint `getuserAD`: qui c'è solo
 * dove chiamarlo. Nessun ripiego su `.env`: l'URL si conferma al collaudo
 * dall'interfaccia, senza un deploy.
 *
 * Nessuna copia in memoria: si rilegge da `app_settings` a ogni login, perché
 * l'URL predefinito dipende da `ws.base`, che si modifica da un'altra scheda, e
 * una copia andrebbe tenuta allineata a mano.
 */
import type { ArchivioImpostazioni } from "./config-notifiche";
import { CHIAVE_BASE } from "./sync/config";

export const CHIAVI_AD = {
  enabled: "ad.enabled",
  url: "ad.url",
  timeoutMs: "ad.timeoutMs",
} as const;

/** Il percorso che il consorzio ha documentato, sotto `ws.base`. */
export const PERCORSO_GETUSERAD = "/RestTabelle/RestTabelle.svc/getuserAD";

export const TIMEOUT_AD_MIN = 1000;
export const TIMEOUT_AD_MAX = 60000;

export type ConfigAd = {
  enabled: boolean;
  url: string; // quello salvato; "" = usa il predefinito da ws.base
  timeoutMs: number;
};

/** Quello che la scheda mostra: la configurazione più l'URL che verrà davvero chiamato. */
export type VistaConfigAd = ConfigAd & { urlEffettivo: string; urlDerivato: boolean };

/** Dove e come chiamare l'endpoint `getuserAD` (issue #96). */
export type EndpointAd = {
  url: string; // senza "/" finale
  auth: string | null; // header Authorization, lo stesso del WebService
  timeoutMs: number;
};

const TIMEOUT_PREDEFINITO = 5000;

function testo(v: string | undefined): string {
  return (v ?? "").trim();
}

function senzaBarraFinale(url: string): string {
  return url.replace(/\/+$/, "");
}

export function leggiConfigAd(settings: Record<string, string>): ConfigAd {
  const timeout = Number(testo(settings[CHIAVI_AD.timeoutMs]));
  return {
    enabled: testo(settings[CHIAVI_AD.enabled]) === "true",
    url: senzaBarraFinale(testo(settings[CHIAVI_AD.url])),
    timeoutMs:
      Number.isInteger(timeout) && timeout >= TIMEOUT_AD_MIN && timeout <= TIMEOUT_AD_MAX
        ? timeout
        : TIMEOUT_PREDEFINITO,
  };
}

export function vistaConfigAd(settings: Record<string, string>): VistaConfigAd {
  const c = leggiConfigAd(settings);
  if (c.url !== "") return { ...c, urlEffettivo: c.url, urlDerivato: false };
  // Calcolato in lettura e mai scritto: se cambia ws.base, l'URL lo segue
  // finché nessuno ne salva uno esplicito.
  const base = senzaBarraFinale(testo(settings[CHIAVE_BASE]));
  return base === ""
    ? { ...c, urlEffettivo: "", urlDerivato: false }
    : { ...c, urlEffettivo: base + PERCORSO_GETUSERAD, urlDerivato: true };
}

/**
 * L'endpoint da chiamare, o `null` se AD non va usata. `ancheSpenta` serve
 * solo alla prova di Impostazioni: si prova prima di accendere.
 */
export function endpointAd(
  settings: Record<string, string>,
  opzioni: { ancheSpenta?: boolean } = {},
): EndpointAd | null {
  const v = vistaConfigAd(settings);
  if (!v.enabled && !opzioni.ancheSpenta) return null;
  if (v.urlEffettivo === "") return null;
  const auth = testo(settings["ws.auth"]);
  return { url: v.urlEffettivo, auth: auth === "" ? null : auth, timeoutMs: v.timeoutMs };
}

export async function salvaConfigAd(
  archivio: ArchivioImpostazioni,
  patch: Partial<ConfigAd>,
): Promise<VistaConfigAd> {
  const settings = await archivio.getAllSettings();
  const attuale = leggiConfigAd(settings);
  // Ripassata da leggiConfigAd: si scrive la forma normalizzata, la stessa che
  // si rileggerà al prossimo login.
  const nuova = leggiConfigAd({
    [CHIAVI_AD.enabled]: String(patch.enabled ?? attuale.enabled),
    [CHIAVI_AD.url]: patch.url ?? attuale.url,
    [CHIAVI_AD.timeoutMs]: String(patch.timeoutMs ?? attuale.timeoutMs),
  });
  const scritte = {
    [CHIAVI_AD.enabled]: nuova.enabled ? "true" : "false",
    [CHIAVI_AD.url]: nuova.url,
    [CHIAVI_AD.timeoutMs]: String(nuova.timeoutMs),
  };
  for (const [chiave, valore] of Object.entries(scritte)) {
    await archivio.setSetting(chiave, valore);
  }
  return vistaConfigAd({ ...settings, ...scritte });
}
