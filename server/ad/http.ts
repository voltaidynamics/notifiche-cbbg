/**
 * Verifica delle credenziali di dominio tramite l'endpoint `getuserAD` del web
 * service del consorzio (issue #96). Il bind lo fa il consorzio: noi mandiamo
 * username e password nel percorso e leggiamo `[{"status":true|false}]`.
 *
 * La password viaggia nel percorso dell'URL: è il contratto del consorzio, non
 * una scelta nostra, e finisce nei log di accesso del loro web service. Quello
 * che possiamo garantire è che da qui non esca: nessun URL completo nei log,
 * nel `dettaglio` o nella risposta della prova.
 */
import { randomUUID } from "node:crypto";
import type { EndpointAd } from "../config-ad";
import { passwordVuota, type EsitoAd, type VerificatoreAd } from "./verificatore";

export type RispostaHttp = { ok: boolean; status: number; text(): Promise<string> };
export type FetchAd = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<RispostaHttp>;

const fetchPredefinito: FetchAd = (url, init) => fetch(url, init);

function senzaBarraFinale(url: string): string {
  return url.replace(/\/+$/, "");
}

/** `<base>/<username>/<password>`, ciascun segmento codificato. */
export function urlVerifica(base: string, username: string, password: string): string {
  return `${senzaBarraFinale(base)}/${encodeURIComponent(username)}/${encodeURIComponent(password)}`;
}

/** Lo stesso URL con `***` al posto della password: l'unica forma che può finire in un log. */
function urlMascherato(base: string, username: string): string {
  return `${senzaBarraFinale(base)}/${encodeURIComponent(username)}/***`;
}

/** Toglie la password, in chiaro e codificata, da un testo che potrebbe citarla. */
function mascheraPassword(testo: string, password: string): string {
  // Prima la forma più lunga: se la codificata contiene la chiara, sostituire
  // prima la chiara lascerebbe pezzi della codificata. Niente `Set`: il
  // target ES5 di tsc non lo sa iterare.
  const forme = [encodeURIComponent(password), password].sort((a, b) => b.length - a.length);
  let r = testo;
  for (const forma of forme) {
    if (forma !== "") r = r.split(forma).join("***");
  }
  return r;
}

/** «.» e «..» sono segmenti di percorso, non valori: l'URL li risolve. */
function soloPunti(segmento: string): boolean {
  return segmento === "." || segmento === "..";
}

/**
 * `true`/`false` se il corpo è la risposta documentata, `null` per qualunque
 * altra cosa. Un `null` diventa «non raggiungibile»: una risposta imprevista non
 * deve mai leggersi come una password giusta, e nemmeno come una sbagliata.
 */
export function leggiStatus(corpo: string): boolean | null {
  let dato: unknown;
  try {
    dato = JSON.parse(corpo);
  } catch {
    return null;
  }
  if (Array.isArray(dato)) {
    if (dato.length !== 1) return null;
    dato = dato[0];
  }
  if (dato === null || typeof dato !== "object") return null;
  const status = (dato as { status?: unknown }).status;
  return typeof status === "boolean" ? status : null;
}

export class HttpVerificatoreAd implements VerificatoreAd {
  constructor(
    private endpoint: EndpointAd,
    private fetchAd: FetchAd = fetchPredefinito,
  ) {}

  async verifica(username: string, password: string): Promise<EsitoAd> {
    const nome = username.trim();
    // Prima di qualunque I/O: un segmento vuoto produrrebbe un URL di cui non
    // conosciamo il comportamento, e un segmento «.» o «..» fetch lo collassa
    // (anche codificato, %2e): con username «..» si chiamerebbe un altro
    // endpoint del web service, con le nostre credenziali ws.auth.
    if (nome === "" || passwordVuota(password) || soloPunti(nome) || soloPunti(password)) {
      return { esito: "credenzialiNonValide" };
    }

    const { url, auth, timeoutMs } = this.endpoint;
    const dove = urlMascherato(url, nome);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (auth) headers.Authorization = auth;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const risposta = await this.fetchAd(urlVerifica(url, nome, password), {
        headers,
        signal: controller.signal,
      });
      if (!risposta.ok) {
        return { esito: "nonRaggiungibile", dettaglio: `${dove}: HTTP ${risposta.status}` };
      }
      const status = leggiStatus(await risposta.text());
      if (status === null) {
        return { esito: "nonRaggiungibile", dettaglio: `${dove}: risposta non riconosciuta` };
      }
      return status ? { esito: "ok" } : { esito: "credenzialiNonValide" };
    } catch (err) {
      // Alcuni errori di fetch citano l'URL, cioè la password: si maschera
      // prima di usare il messaggio, sempre.
      const motivo = controller.signal.aborted
        ? `timeout dopo ${timeoutMs} ms`
        : mascheraPassword(err instanceof Error ? err.message : String(err), password);
      return { esito: "nonRaggiungibile", dettaglio: `${dove}: ${motivo}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

export type EsitoProva = { riuscita: boolean; messaggio: string; verifica?: EsitoAd };

/**
 * Il bottone «Prova» di Impostazioni. Prima chiama l'endpoint con credenziali
 * inventate e pretende un `false` ben formato: così controlla URL, header e
 * formato senza credenziali vere e senza rischiare di bloccare un account. Solo
 * se quel controllo passa, prova le credenziali eventualmente fornite.
 */
export async function provaEndpoint(
  endpoint: EndpointAd | null,
  credenziali?: { username: string; password: string },
  fetchAd: FetchAd = fetchPredefinito,
): Promise<EsitoProva> {
  if (!endpoint) {
    return {
      riuscita: false,
      messaggio:
        "Nessun URL: impostalo in questa scheda, oppure imposta l'indirizzo base nella scheda WebService.",
    };
  }
  const v = new HttpVerificatoreAd(endpoint, fetchAd);
  const inventato = await v.verifica(`verifica-app-${randomUUID().slice(0, 8)}`, randomUUID());
  if (inventato.esito === "nonRaggiungibile") {
    return {
      riuscita: false,
      messaggio: `Endpoint non raggiungibile o risposta non valida — ${inventato.dettaglio}`,
    };
  }
  if (inventato.esito === "ok") {
    return {
      riuscita: false,
      messaggio:
        "L'endpoint ha accettato credenziali inventate: risponde «true» a chiunque. Non attivare l'autenticazione finché il consorzio non lo corregge.",
    };
  }
  const base: EsitoProva = {
    riuscita: true,
    messaggio: "Endpoint raggiungibile: ha rifiutato credenziali inventate, come deve.",
  };
  if (!credenziali) return base;
  return { ...base, verifica: await v.verifica(credenziali.username, credenziali.password) };
}
