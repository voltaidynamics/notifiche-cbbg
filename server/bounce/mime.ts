/**
 * Lettore MIME ridotto all'osso, per i bounce (issue #126).
 *
 * Non è un parser di posta generale: serve a trovare in un DSN la parte
 * `message/delivery-status` e gli header del messaggio originale. Per questo
 * decodifica base64 e quoted-printable ma tratta ogni charset come UTF-8 — i
 * campi che cerchiamo (Status, Final-Recipient, Message-ID) sono ASCII.
 * Una libreria completa avrebbe portato una decina di dipendenze per leggere
 * quattro header.
 */

export type ParteMime = {
  /** Nomi in minuscolo; il primo valore vince in `intestazione()`. */
  intestazioni: Map<string, string[]>;
  /** `type/subtype` in minuscolo; `text/plain` se manca, come da RFC 2045. */
  tipo: string;
  parametri: Record<string, string>;
  /** Il corpo già decodificato dal transfer-encoding. */
  testo: string;
  parti: ParteMime[];
};

const PROFONDITA_MASSIMA = 8;

/** Separa header e corpo alla prima riga vuota. */
function separa(grezzo: string): { testa: string; corpo: string } {
  // Una parte senza header comincia direttamente con la riga vuota.
  const vuota = /^\r?\n/.exec(grezzo);
  if (vuota) return { testa: "", corpo: grezzo.slice(vuota[0].length) };
  const m = /\r?\n\r?\n/.exec(grezzo);
  if (!m) return { testa: grezzo, corpo: "" };
  return { testa: grezzo.slice(0, m.index), corpo: grezzo.slice(m.index + m[0].length) };
}

/** Header RFC 5322, con le righe di continuazione riunite. */
export function leggiIntestazioni(testa: string): Map<string, string[]> {
  const mappa = new Map<string, string[]>();
  const righe = testa.split(/\r?\n/);
  const logiche: string[] = [];
  for (const riga of righe) {
    if (/^[ \t]/.test(riga) && logiche.length > 0) {
      logiche[logiche.length - 1] += " " + riga.trim();
    } else if (riga.trim() !== "") {
      logiche.push(riga);
    }
  }
  for (const riga of logiche) {
    const i = riga.indexOf(":");
    if (i <= 0) continue;
    const nome = riga.slice(0, i).trim().toLowerCase();
    const valore = riga.slice(i + 1).trim();
    const valori = mappa.get(nome);
    if (valori) valori.push(valore);
    else mappa.set(nome, [valore]);
  }
  return mappa;
}

export function intestazione(p: Pick<ParteMime, "intestazioni">, nome: string): string | null {
  return p.intestazioni.get(nome.toLowerCase())?.[0] ?? null;
}

/** `multipart/report; report-type=delivery-status; boundary="x"` */
function leggiContentType(valore: string | null): { tipo: string; parametri: Record<string, string> } {
  if (!valore) return { tipo: "text/plain", parametri: {} };
  const [primo, ...resto] = valore.split(";");
  const parametri: Record<string, string> = {};
  for (const pezzo of resto) {
    const i = pezzo.indexOf("=");
    if (i <= 0) continue;
    const chiave = pezzo.slice(0, i).trim().toLowerCase();
    let v = pezzo.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1);
    parametri[chiave] = v;
  }
  return { tipo: primo.trim().toLowerCase() || "text/plain", parametri };
}

function decodificaQuotedPrintable(s: string): string {
  const senzaACapoMorbidi = s.replace(/=\r?\n/g, "");
  const byte: number[] = [];
  for (let i = 0; i < senzaACapoMorbidi.length; i++) {
    const c = senzaACapoMorbidi[i];
    const esadecimale = senzaACapoMorbidi.slice(i + 1, i + 3);
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(esadecimale)) {
      byte.push(parseInt(esadecimale, 16));
      i += 2;
    } else {
      byte.push(...Buffer.from(c, "utf8"));
    }
  }
  return Buffer.from(byte).toString("utf8");
}

function decodifica(corpo: string, encoding: string | null): string {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "base64":
      return Buffer.from(corpo.replace(/\s+/g, ""), "base64").toString("utf8");
    case "quoted-printable":
      return decodificaQuotedPrintable(corpo);
    default:
      return corpo;
  }
}

function dividiMultipart(corpo: string, confine: string): string[] {
  const parti: string[] = [];
  const delimitatore = "--" + confine;
  const righe = corpo.split(/\r?\n/);
  let corrente: string[] | null = null;
  for (const riga of righe) {
    const r = riga.trimEnd();
    if (r === delimitatore + "--") {
      if (corrente) parti.push(corrente.join("\n"));
      return parti;
    }
    if (r === delimitatore) {
      if (corrente) parti.push(corrente.join("\n"));
      corrente = [];
      continue;
    }
    if (corrente) corrente.push(riga);
  }
  // Chiusura mancante: si tiene quello che c'è, un bounce troncato vale ancora.
  if (corrente) parti.push(corrente.join("\n"));
  return parti;
}

function leggiParte(grezzo: string, profondita: number): ParteMime {
  const { testa, corpo } = separa(grezzo);
  const intestazioni = leggiIntestazioni(testa);
  const { tipo, parametri } = leggiContentType(intestazioni.get("content-type")?.[0] ?? null);
  const testo = decodifica(corpo, intestazioni.get("content-transfer-encoding")?.[0] ?? null);
  const parte: ParteMime = { intestazioni, tipo, parametri, testo, parti: [] };
  if (profondita >= PROFONDITA_MASSIMA) return parte;

  if (tipo.startsWith("multipart/") && parametri.boundary) {
    parte.parti = dividiMultipart(testo, parametri.boundary).map((p) => leggiParte(p, profondita + 1));
  } else if (tipo === "message/rfc822" || tipo === "message/global") {
    parte.parti = [leggiParte(testo, profondita + 1)];
  }
  return parte;
}

export function leggiMime(grezzo: string): ParteMime {
  return leggiParte(grezzo, 0);
}

/** Tutte le parti, in profondità, radice compresa. */
export function tutteLeParti(p: ParteMime): ParteMime[] {
  return [p, ...p.parti.flatMap(tutteLeParti)];
}

/**
 * I gruppi di campi di una parte `message/delivery-status` (RFC 3464): il
 * primo è per-messaggio, gli altri uno per destinatario.
 */
export function gruppiDeliveryStatus(testo: string): Map<string, string[]>[] {
  return testo
    .split(/\r?\n[ \t]*\r?\n/)
    .map((g) => g.trim())
    .filter((g) => g !== "")
    .map(leggiIntestazioni);
}
