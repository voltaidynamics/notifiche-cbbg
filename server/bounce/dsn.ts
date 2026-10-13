/**
 * Riconoscere un bounce e capire a chi si riferisce (issue #126).
 *
 * Due strade, in quest'ordine:
 *
 * 1. Il DSN standard (RFC 3464): `multipart/report` con una parte
 *    `message/delivery-status`. Da lì si leggono destinatario, `Status` e
 *    `Action` senza indovinare niente. Lo mandano Exchange Online e quasi tutti
 *    i server.
 * 2. Il ripiego euristico dello script di prova del consorzio: mittente
 *    `postmaster`/`mailer-daemon`, oggetto tipico, codice e indirizzo cercati
 *    nel testo. Serve ai server che rimandano un testo libero.
 *
 * Per abbinare il bounce alla comunicazione conta il `Message-ID` del
 * messaggio originale, che i bounce riportano negli header allegati: è lo
 * stesso che Nodemailer ci ha restituito all'invio. L'indirizzo nel testo è
 * solo un ripiego — lo stesso conduttore riceve decine di comunicazioni.
 */
import {
  gruppiDeliveryStatus,
  intestazione,
  leggiIntestazioni,
  leggiMime,
  tutteLeParti,
  type ParteMime,
} from "./mime";
import { classificaBounce, type TipoBounce } from "@shared/bounce";

export type AnalisiMessaggio =
  | { bounce: false }
  | {
      bounce: true;
      codice: string | null;
      tipo: TipoBounce;
      diagnostica: string | null;
      destinatario: string | null;
      messageIdOriginale: string | null;
    };

const SUGGERIMENTI_OGGETTO = [
  "undeliverable",
  "undelivered",
  "delivery status notification",
  "mail delivery failed",
  "delivery failure",
  "returned mail",
  "failure notice",
  "non recapitabile",
  "non recapitato",
  "recapito non riuscito",
  "mancato recapito",
  "impossibile recapitare",
];

const STATUS_DOPO_SMTP = /\b[245]\d\d[ -]+([245]\.\d{1,3}\.\d{1,3})(?![\d.]*\d)/;
const STATUS = /(?<![\d.])([245]\.\d{1,3}\.\d{1,3})(?![\d.]*\d)/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const MESSAGE_ID_NEL_TESTO = /^message-id:\s*(<[^>\s]+>)/im;

/** `<abc@host>`: la forma con cui Nodemailer restituisce il messageId e lo salviamo. */
export function normalizzaMessageId(valore: string | null): string | null {
  if (!valore) return null;
  const m = /<([^<>\s]+)>/.exec(valore) ?? /^\s*([^<>\s]+@[^<>\s]+)\s*$/.exec(valore);
  return m ? `<${m[1]}>` : null;
}

/** `rfc822; mario@x.it` → `mario@x.it` */
function indirizzoDaCampo(valore: string | null): string | null {
  if (!valore) return null;
  const dopo = valore.includes(";") ? valore.slice(valore.indexOf(";") + 1) : valore;
  const m = dopo.match(EMAIL);
  return m ? m[0].toLowerCase() : null;
}

function primo(gruppo: Map<string, string[]>, nome: string): string | null {
  return gruppo.get(nome)?.[0] ?? null;
}

function senzaHtml(testo: string): string {
  return testo
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function testoLeggibile(radice: ParteMime): string {
  return tutteLeParti(radice)
    .filter((p) => p.tipo === "text/plain" || p.tipo === "text/html")
    .map((p) => (p.tipo === "text/html" ? senzaHtml(p.testo) : p.testo))
    .join("\n");
}

/** Il Message-ID della mail che è tornata indietro, ovunque il bounce lo riporti. */
function messageIdOriginale(radice: ParteMime): string | null {
  for (const p of tutteLeParti(radice)) {
    if ((p.tipo === "message/rfc822" || p.tipo === "message/global") && p.parti[0]) {
      const id = normalizzaMessageId(intestazione(p.parti[0], "message-id"));
      if (id) return id;
    }
    if (p.tipo === "text/rfc822-headers" || p.tipo === "message/rfc822-headers") {
      const id = normalizzaMessageId(leggiIntestazioni(p.testo).get("message-id")?.[0] ?? null);
      if (id) return id;
    }
  }
  // Alcuni server incollano gli header originali nel testo del messaggio.
  const nelTesto = MESSAGE_ID_NEL_TESTO.exec(testoLeggibile(radice));
  if (nelTesto) return normalizzaMessageId(nelTesto[1]);
  // Ultimo ripiego: chi risponde a un messaggio lo cita in In-Reply-To.
  return normalizzaMessageId(intestazione(radice, "in-reply-to"));
}

function mittente(radice: ParteMime): string {
  const da = intestazione(radice, "from") ?? "";
  return (da.match(EMAIL)?.[0] ?? "").toLowerCase();
}

function sembraBounce(radice: ParteMime): boolean {
  const da = mittente(radice);
  const oggetto = (intestazione(radice, "subject") ?? "").toLowerCase();
  return (
    intestazione(radice, "x-ms-exchange-message-is-ndr") !== null ||
    da.startsWith("postmaster@") ||
    da.startsWith("mailer-daemon@") ||
    SUGGERIMENTI_OGGETTO.some((s) => oggetto.includes(s))
  );
}

/**
 * `casella` è quella che leggiamo: il suo indirizzo compare in ogni bounce
 * (è il mittente originale) e non va mai scambiato per il destinatario.
 */
export function analizzaMessaggio(grezzo: string, casella: string): AnalisiMessaggio {
  const radice = leggiMime(grezzo);
  const report = tutteLeParti(radice).find(
    (p) => p.tipo === "message/delivery-status" || p.tipo === "message/global-delivery-status",
  );

  if (report) {
    const perDestinatario = gruppiDeliveryStatus(report.testo).filter(
      (g) => g.has("final-recipient") || g.has("original-recipient"),
    );
    const azione = (g: Map<string, string[]>) => (primo(g, "action") ?? "").toLowerCase();
    const scelto =
      perDestinatario.find((g) => azione(g) === "failed") ??
      perDestinatario.find((g) => azione(g) === "delayed");
    // Un DSN di sola consegna riuscita (`delivered`, `relayed`) non è un bounce.
    if (!scelto) return { bounce: false };
    const codice = (primo(scelto, "status") ?? "").match(STATUS)?.[1] ?? null;
    return {
      bounce: true,
      codice,
      tipo: classificaBounce(codice, azione(scelto)),
      diagnostica: primo(scelto, "diagnostic-code"),
      destinatario:
        indirizzoDaCampo(primo(scelto, "final-recipient")) ??
        indirizzoDaCampo(primo(scelto, "original-recipient")),
      messageIdOriginale: messageIdOriginale(radice),
    };
  }

  if (!sembraBounce(radice)) return { bounce: false };

  const testo = testoLeggibile(radice);
  const codice = (STATUS_DOPO_SMTP.exec(testo) ?? STATUS.exec(testo))?.[1] ?? null;
  const daEscludere = new Set([casella.toLowerCase(), mittente(radice)]);
  const destinatario =
    (testo.match(EMAIL) ?? [])
      .map((e) => e.toLowerCase())
      .find(
        (e) =>
          !daEscludere.has(e) && !e.startsWith("postmaster@") && !e.startsWith("mailer-daemon@"),
      ) ?? null;
  const rigaCodice = codice
    ? testo.split(/\r?\n/).find((r) => r.includes(codice))?.trim() ?? null
    : null;
  return {
    bounce: true,
    codice,
    tipo: classificaBounce(codice),
    diagnostica: rigaCodice && rigaCodice.length <= 500 ? rigaCodice : null,
    destinatario,
    messageIdOriginale: messageIdOriginale(radice),
  };
}
