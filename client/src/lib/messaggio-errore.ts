// Il testo che un operatore legge quando qualcosa va storto (issue #100).
//
// `apiRequest` (client/src/lib/queryClient.ts) costruisce i suoi errori come
// `400: {"message":"…"}`, e quasi ogni pagina passava `error.message` al toast
// così com'era. Questa è l'unica regola che lo ripulisce: la applica da sé il
// popup degli errori (`client/src/components/ui/toaster.tsx`), quindi una
// chiamata a `toast({ variant: "destructive", description: e.message })` non
// deve fare niente di suo.
//
// Il messaggio del server, quando c'è, vince sempre: le rotte rispondono in
// italiano e dicono cosa è successo davvero. I ripieghi servono solo quando
// il corpo non porta testo utile — vuoto, una pagina HTML del proxy, la frase
// inglese di default dello stato HTTP — o quando la richiesta non è proprio
// arrivata al server.
//
// Niente import: il file gira anche nei test di vitest, in ambiente node.

export const MESSAGGIO_RETE =
  "Impossibile contattare il server. Controlla la connessione e riprova.";
export const MESSAGGIO_SESSIONE =
  "La sessione è scaduta. Accedi di nuovo per continuare.";
export const MESSAGGIO_PERMESSI = "Non hai i permessi per questa operazione.";
export const MESSAGGIO_NON_TROVATO = "L'elemento richiesto non esiste più.";
export const MESSAGGIO_TROPPO_GRANDE = "I dati inviati sono troppo grandi per il server.";
export const MESSAGGIO_NON_RAGGIUNGIBILE =
  "Il server non è raggiungibile in questo momento. Riprova tra qualche minuto.";
export const MESSAGGIO_SERVER =
  "Si è verificato un errore sul server. Riprova; se il problema continua, avvisa l'assistenza.";
export const MESSAGGIO_RISPOSTA_INATTESA =
  "Il server ha dato una risposta inattesa. Riprova tra qualche istante.";
export const MESSAGGIO_RICHIESTA = "La richiesta non è valida.";
export const MESSAGGIO_GENERICO = "Si è verificato un errore imprevisto.";

// Il messaggio con cui il guard globale di `server/auth.ts` risponde 401 a
// una richiesta senza sessione: a metà lavoro vuol dire che è scaduta.
const NON_AUTENTICATO = "Non autenticato";

// Gli errori che `fetch` lancia quando la richiesta non parte o non torna,
// nelle formulazioni di Chrome, Firefox e Safari.
const ERRORI_RETE = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /network request failed/i,
];

// `res.json()` su una pagina HTML (tipicamente un errore del proxy con 200).
const ERRORI_PARSING = [/unexpected token/i, /is not valid json/i, /json\.parse/i, /unexpected end of json/i];

// Le frasi di default degli stati HTTP: `res.statusText`, o il corpo di
// `res.sendStatus()`. Non dicono niente a chi legge, quindi valgono «nessun testo».
const FRASI_HTTP = new Set(
  [
    "bad request", "unauthorized", "forbidden", "not found", "method not allowed",
    "conflict", "payload too large", "request entity too large", "too many requests",
    "internal server error", "bad gateway", "service unavailable", "gateway timeout",
  ],
);

function ripiegoPerStato(stato: number): string {
  if (stato === 401) return MESSAGGIO_SESSIONE;
  if (stato === 403) return MESSAGGIO_PERMESSI;
  if (stato === 404) return MESSAGGIO_NON_TROVATO;
  if (stato === 413) return MESSAGGIO_TROPPO_GRANDE;
  if (stato === 502 || stato === 503 || stato === 504) return MESSAGGIO_NON_RAGGIUNGIBILE;
  if (stato >= 500) return MESSAGGIO_SERVER;
  if (stato >= 400) return MESSAGGIO_RICHIESTA;
  return MESSAGGIO_GENERICO;
}

function testoDaJson(corpo: string): string | null | undefined {
  // undefined = non era JSON; null = JSON senza un testo da mostrare.
  let json: unknown;
  try {
    json = JSON.parse(corpo);
  } catch {
    return undefined;
  }
  if (json && typeof json === "object") {
    for (const campo of ["message", "errore", "error"]) {
      const v = (json as Record<string, unknown>)[campo];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  }
  if (typeof json === "string" && json.trim()) return json.trim();
  return null;
}

function senzaTesto(corpo: string): boolean {
  return corpo === "" || corpo.startsWith("<") || FRASI_HTTP.has(corpo.toLowerCase());
}

/** Il messaggio leggibile da un errore qualunque: `Error`, stringa o altro. */
export function messaggioErrore(errore: unknown): string {
  let testo: string;
  if (errore instanceof Error) testo = errore.message;
  else if (typeof errore === "string") testo = errore;
  else if (errore == null) testo = "";
  else testo = String(errore);
  testo = testo.trim();

  const conStato = /^(\d{3}):\s*([\s\S]*)$/.exec(testo);
  const stato = conStato ? Number(conStato[1]) : null;
  let corpo = conStato ? conStato[2].trim() : testo;

  const daJson = testoDaJson(corpo);
  if (daJson !== undefined) corpo = daJson ?? "";

  if (stato !== null) {
    if (stato === 401 && corpo === NON_AUTENTICATO) return MESSAGGIO_SESSIONE;
    return senzaTesto(corpo) ? ripiegoPerStato(stato) : corpo;
  }

  if (ERRORI_RETE.some((r) => r.test(corpo))) return MESSAGGIO_RETE;
  if (ERRORI_PARSING.some((r) => r.test(corpo))) return MESSAGGIO_RISPOSTA_INATTESA;
  if (corpo === "" || corpo.startsWith("<")) return MESSAGGIO_GENERICO;
  return corpo;
}
