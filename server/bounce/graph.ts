/**
 * Microsoft Graph, in sola lettura, per la casella dei bounce (issue #126).
 *
 * Flusso client credentials: l'app registrata in Entra ID dal consorzio ha il
 * solo permesso applicativo `Mail.Read`, ristretto a quella casella da una
 * Application Access Policy. Tre chiamate in tutto — token, elenco dei
 * messaggi, MIME di un messaggio — e nessuna libreria Microsoft.
 *
 * Il secret non deve mai uscire da qui: nessun messaggio d'errore lo cita,
 * perché quei messaggi finiscono nei log e nella scheda di Impostazioni.
 */
import type { CredenzialiGraph } from "../config-bounce";

export const GRAPH = "https://graph.microsoft.com/v1.0";
const LOGIN = "https://login.microsoftonline.com";
const TIMEOUT_MS = 30_000;

export type RispostaGraph = { ok: boolean; status: number; text(): Promise<string> };
export type FetchGraph = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<RispostaGraph>;

const fetchPredefinito: FetchGraph = (url, init) => fetch(url, init);

export class ErroreGraph extends Error {}

export type MessaggioGraph = {
  id: string;
  internetMessageId: string | null;
  oggetto: string;
  mittente: string;
  ricevutoAt: Date;
};

/** I codici AADSTS che si incontrano davvero alla prima configurazione. */
const SUGGERIMENTI_AAD: [string, string][] = [
  ["AADSTS7000215", "client secret non valido: serve la colonna «Value», non il «Secret ID»"],
  ["AADSTS7000222", "client secret scaduto: va generato un secret nuovo in Entra ID"],
  ["AADSTS700016", "Client ID non trovato in questo tenant: controlla Client ID e Tenant ID"],
  ["AADSTS90002", "Tenant ID non trovato"],
  ["AADSTS900023", "Tenant ID non valido"],
];

function suggerimentoGraph(status: number, codice: string, casella: string): string {
  const c = codice.toLowerCase();
  if (status === 401) return "token rifiutato";
  if (status === 403 || c === "erroraccessdenied") {
    return (
      "accesso negato: consenso amministratore non concesso a Mail.Read, Application Access " +
      `Policy non ancora propagata (fino a 30 minuti) o policy che non include ${casella}`
    );
  }
  if (status === 404 || c.includes("invaliduser") || c.includes("mailboxnotenabled")) {
    return `casella ${casella} non trovata o non su Exchange Online`;
  }
  if (status === 429) return "troppe richieste, si riprova al prossimo giro";
  return "";
}

async function chiama(
  fetchGraph: FetchGraph,
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
): Promise<RispostaGraph> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchGraph(url, { ...init, signal: controller.signal });
  } catch (err) {
    const dove = url.split("?")[0];
    throw new ErroreGraph(
      controller.signal.aborted
        ? `${dove}: nessuna risposta in ${TIMEOUT_MS / 1000} secondi`
        : `${dove}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function json(testo: string): Record<string, any> {
  try {
    const v = JSON.parse(testo);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export async function ottieniToken(
  cred: CredenzialiGraph,
  fetchGraph: FetchGraph = fetchPredefinito,
): Promise<string> {
  const corpo = new URLSearchParams({
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  }).toString();
  const r = await chiama(fetchGraph, `${LOGIN}/${encodeURIComponent(cred.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: corpo,
  });
  const dati = json(await r.text());
  if (r.ok && typeof dati.access_token === "string") return dati.access_token;

  const descrizione = String(dati.error_description ?? dati.error ?? `HTTP ${r.status}`);
  const suggerimento = SUGGERIMENTI_AAD.find(([codice]) => descrizione.includes(codice))?.[1];
  // Trace ID, Correlation ID e Timestamp servono solo al supporto Microsoft:
  // stanno su una riga a sé o in coda alla stessa, a seconda dell'errore.
  const prima = descrizione
    .split(/\r?\n/)[0]
    .replace(/\s*Trace ID:[\s\S]*$/, "")
    .split(cred.clientSecret)
    .join("***");
  throw new ErroreGraph(
    suggerimento ? `Autenticazione rifiutata: ${suggerimento} (${prima})` : `Autenticazione rifiutata: ${prima}`,
  );
}

/** I permessi applicativi scritti nel token (`roles`), o null se non leggibile. */
export function permessiDelToken(token: string): string[] | null {
  try {
    const payload = token.split(".")[1];
    const dati = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Array.isArray(dati.roles) ? dati.roles.map(String) : [];
  } catch {
    return null;
  }
}

async function erroreDaRisposta(r: RispostaGraph, casella: string): Promise<ErroreGraph> {
  const errore = json(await r.text()).error ?? {};
  const codice = String(errore.code ?? "");
  const messaggio = String(errore.message ?? `HTTP ${r.status}`);
  const suggerimento = suggerimentoGraph(r.status, codice, casella);
  return new ErroreGraph(
    `Microsoft Graph HTTP ${r.status}${codice ? ` (${codice})` : ""}: ${messaggio}` +
      (suggerimento ? ` — ${suggerimento}` : ""),
  );
}

function urlCasella(casella: string): string {
  return `${GRAPH}/users/${encodeURIComponent(casella)}`;
}

/**
 * I messaggi dell'inbox ricevuti da `dal` in poi, dal più vecchio: se il
 * `limite` interrompe la lettura, il giro dopo riparte da dove si è fermato.
 */
export async function elencaMessaggi(
  token: string,
  casella: string,
  dal: Date,
  limite: number,
  fetchGraph: FetchGraph = fetchPredefinito,
): Promise<MessaggioGraph[]> {
  const parametri = [
    ["$filter", `receivedDateTime ge ${dal.toISOString().replace(/\.\d{3}Z$/, "Z")}`],
    ["$orderby", "receivedDateTime asc"],
    ["$select", "id,internetMessageId,subject,from,receivedDateTime"],
    ["$top", String(Math.min(limite, 50))],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  let url: string | null = `${urlCasella(casella)}/mailFolders/inbox/messages?${parametri}`;
  const out: MessaggioGraph[] = [];
  while (url && out.length < limite) {
    const r = await chiama(fetchGraph, url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!r.ok) throw await erroreDaRisposta(r, casella);
    const dati = json(await r.text());
    const valori: any[] = Array.isArray(dati.value) ? dati.value : [];
    for (const m of valori) {
      out.push({
        id: String(m.id),
        internetMessageId: typeof m.internetMessageId === "string" ? m.internetMessageId : null,
        oggetto: String(m.subject ?? ""),
        mittente: String(m.from?.emailAddress?.address ?? "").toLowerCase(),
        ricevutoAt: new Date(m.receivedDateTime),
      });
    }
    url = typeof dati["@odata.nextLink"] === "string" ? dati["@odata.nextLink"] : null;
  }
  return out.slice(0, limite);
}

/** Il messaggio intero in formato MIME: l'unico modo di leggere il DSN e gli header originali. */
export async function scaricaMime(
  token: string,
  casella: string,
  id: string,
  fetchGraph: FetchGraph = fetchPredefinito,
): Promise<string> {
  const r = await chiama(fetchGraph, `${urlCasella(casella)}/messages/${encodeURIComponent(id)}/$value`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw await erroreDaRisposta(r, casella);
  return r.text();
}
