/**
 * Avviso via email dell'esito del caricamento notturno delle anagrafiche (issue #6).
 *
 * Sta in server/ e non in server/sync/ di proposito: il motore di sync si prova a
 * unità senza alcun mock SMTP, e portargli dentro nodemailer significherebbe
 * perdere quella proprietà.
 *
 * Il messaggio parte SEMPRE, anche quando è andato tutto bene. Avvisare solo in
 * caso di guasto sembra più educato ma non garantisce nulla: se il server è
 * spento non arriva niente, e il silenzio si legge come "tutto a posto". Con una
 * cadenza fissa, invece, la notte senza messaggio è essa stessa il segnale.
 */
import { z } from "zod";
import { analizzaArray, analizzaConteggi, etichettaConteggio } from "@shared/esito-sync";
import type { SyncLog } from "@shared/schema";
import { syncAll, SyncGiaInCorso, type EsitoSync } from "./sync/sync-all";
import { storage } from "./storage";
import { createTransporter } from "./email";
import { getConfigEmail, emailConfigurata, mittenteDi, type ConfigEmail } from "./config-notifiche";

export const CHIAVE_DESTINATARI = "sync.avvisi.destinatari";

/** Virgola, punto e virgola e a capo: chi incolla una lista non deve pensarci. */
export function separaDestinatari(testo: string): string[] {
  const grezzi = testo
    .split(/[,;\r\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== "");
  return Array.from(new Set(grezzi));
}

const SCHEMA_EMAIL = z.string().email();

export function validaDestinatari(lista: string[]): { validi: string[]; invalidi: string[] } {
  const validi: string[] = [];
  const invalidi: string[] = [];
  for (const indirizzo of lista) {
    if (SCHEMA_EMAIL.safeParse(indirizzo).success) validi.push(indirizzo);
    else invalidi.push(indirizzo);
  }
  return { validi, invalidi };
}

export function leggiDestinatari(settings: Record<string, string>): string[] {
  return separaDestinatari(settings[CHIAVE_DESTINATARI] ?? "");
}

export type Messaggio = { oggetto: string; html: string };

const FUSO = "Europe/Rome";

const CHIUSURA =
  "Questo riepilogo viene inviato dopo ogni caricamento notturno delle anagrafiche. " +
  "Se una notte non arriva, il caricamento non è stato eseguito.";

/**
 * Il server gira in UTC (vedi la crontab dei backup nel README), l'interfaccia
 * formatta nel browser dell'utente. Senza fuso esplicito lo stesso caricamento
 * risulterebbe delle 03:01 nell'email e delle 05:01 a schermo.
 *
 * Accetta anche una stringa perché `SyncLog.startedAt`/`finishedAt` sono
 * tipizzati `Date` solo a compile time: un log rehydratato da JSON (es. dalla
 * rotta che lo restituisce al client) li porta come stringa ISO. Chiamare
 * `.toLocaleString(...)` su una stringa non fallisce — cade silenziosamente su
 * `Object.prototype.toLocaleString`, che ignora gli argomenti e restituisce la
 * stringa intatta, senza applicare alcun fuso. `new Date(d)` normalizza
 * entrambi i casi (su una `Date` vera è una copia innocua).
 */
export function formattaIstante(d: Date | string): string {
  return new Date(d).toLocaleString("it-IT", {
    timeZone: FUSO,
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numero(n: number): string {
  return n.toLocaleString("it-IT");
}

/**
 * Solo le chiavi che contano righe davvero scritte nel mirror: conduttori si
 * scrive da solo, madri/tratte/legami sono l'esito di replaceRegistro dopo
 * aver assorbito tutte le entità del registro. Le altre chiavi che sync-all.ts
 * produce (tratteScartate, legamiScartati, madriDiServizio, tratteDiServizio,
 * madriTipoIgnoto) sono diagnostiche, non righe scritte: sommarle al totale
 * risponderebbe a una domanda che nessuno ha fatto — "quante ne sono
 * arrivate" e "quante ne abbiamo scartate" restano due domande diverse, e la
 * somma non risponde a nessuna delle due. Restano comunque visibili nella
 * tabella, che mostra ogni chiave di `conteggi` senza filtri.
 */
const CHIAVI_RIGHE_SCRITTE = ["conduttori", "madri", "tratte", "legami"];

function totaleRighe(conteggi: Record<string, number>): number {
  return CHIAVI_RIGHE_SCRITTE.reduce((a, chiave) => {
    const n = conteggi[chiave];
    return a + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function tabellaConteggi(conteggi: Record<string, number>): string {
  const voci = Object.entries(conteggi);
  if (voci.length === 0) return "<p>Nessuna riga caricata.</p>";
  const righe = voci
    .map(([chiave, n]) =>
      `<tr><td style="padding:2px 16px 2px 0">${escapeHtml(etichettaConteggio(chiave))}</td>` +
      `<td style="padding:2px 0;text-align:right">${numero(n)}</td></tr>`)
    .join("");
  return `<table>${righe}</table>`;
}

function elenco(titolo: string, voci: string[], colore: string): string {
  if (voci.length === 0) return "";
  const righe = voci.map((v) => `<li>${escapeHtml(v)}</li>`).join("");
  return `<p style="color:${colore}"><strong>${titolo}</strong></p><ul style="color:${colore}">${righe}</ul>`;
}

export function componiAvviso(esito: EsitoSync, inizio: Date, fine: Date): Messaggio {
  const totale = totaleRighe(esito.conteggi);
  const quando = formattaIstante(fine);
  const nErrori = esito.errori.length;

  const oggetto =
    esito.status === "success"
      ? `✅ Anagrafiche aggiornate — ${numero(totale)} righe (${quando})`
      : esito.status === "partial"
        ? `⚠️ Anagrafiche aggiornate solo in parte — ${numero(totale)} righe, ` +
          `${nErrori} ${nErrori === 1 ? "errore" : "errori"} (${quando})`
        : `❌ Anagrafiche NON aggiornate (${quando})`;

  const intestazione =
    esito.status === "success"
      ? "Il caricamento notturno delle anagrafiche è andato a buon fine."
      : esito.status === "partial"
        ? "Il caricamento notturno è riuscito solo in parte: le voci non elencate qui sotto NON sono state aggiornate."
        : "Il caricamento notturno NON è riuscito: a sistema restano i dati del caricamento precedente.";

  const durata = Math.max(0, Math.round((fine.getTime() - inizio.getTime()) / 1000));

  const html = [
    `<p>${intestazione}</p>`,
    tabellaConteggi(esito.conteggi),
    elenco("Errori:", esito.errori, "#b91c1c"),
    elenco("Non configurate, mai caricate:", esito.saltate, "#b45309"),
    `<p style="color:#6b7280;font-size:12px">Inizio ${escapeHtml(formattaIstante(inizio))}` +
      ` · fine ${escapeHtml(quando)} · durata ${durata} s</p>`,
    `<p style="color:#6b7280;font-size:12px">${CHIUSURA}</p>`,
  ].join("\n");

  return { oggetto, html };
}

/**
 * Per i casi in cui syncAll() SOLLEVA invece di restituire un esito: senza
 * questo, il guasto più grave — quello che impedisce persino di scrivere il log —
 * sarebbe l'unico a non produrre alcun avviso.
 */
export function componiAvvisoGuasto(motivo: string, quando: Date, giaInCorso = false): Messaggio {
  const q = formattaIstante(quando);
  const oggetto = giaInCorso
    ? `⚠️ Caricamento notturno non eseguito — un altro caricamento era in corso (${q})`
    : `❌ Caricamento notturno non avviato — ${motivo} (${q})`;

  const html = [
    `<p>${giaInCorso
      ? "Il caricamento notturno non è partito perché un altro caricamento era già in corso."
      : "Il caricamento notturno non è nemmeno partito: non esiste una registrazione a sistema."}</p>`,
    `<p><strong>Motivo:</strong> ${escapeHtml(motivo)}</p>`,
    `<p style="color:#6b7280;font-size:12px">${CHIUSURA}</p>`,
  ].join("\n");

  return { oggetto, html };
}

/**
 * Ricompone il messaggio di una corsa già registrata: serve al pulsante di prova.
 * I campi JSON si leggono con i parser condivisi di @shared/esito-sync (Step 2).
 */
export function componiAvvisoDaLog(log: SyncLog): Messaggio {
  const status: EsitoSync["status"] =
    log.status === "success" || log.status === "partial" ? log.status : "failed";
  const esito: EsitoSync = {
    syncLogId: log.id,
    status,
    conteggi: analizzaConteggi(log.entityCounts),
    errori: analizzaArray(log.errors),
    saltate: analizzaArray(log.skippedEntities),
  };
  return componiAvviso(esito, log.startedAt, log.finishedAt ?? log.startedAt);
}

export type MancatoInvio = {
  inviato: false;
  motivo: "nessun destinatario" | "email non configurata" | "errore";
  dettaglio?: string;
};

export type EsitoInvio = { inviato: true; destinatari: number } | MancatoInvio;

export type DepsAvviso = {
  archivio?: { getAllSettings(): Promise<Record<string, string>> };
  config?: ConfigEmail;
  trasporto?: { sendMail(opzioni: Record<string, unknown>): Promise<unknown> };
};

/**
 * Non solleva mai: l'avviso è un effetto collaterale del caricamento, e un SMTP
 * irraggiungibile è un problema dell'avviso, non delle anagrafiche.
 */
export async function inviaAvvisoSync(msg: Messaggio, deps: DepsAvviso = {}): Promise<EsitoInvio> {
  const archivio = deps.archivio ?? storage;
  const config = deps.config ?? getConfigEmail();

  let destinatari: string[];
  try {
    destinatari = leggiDestinatari(await archivio.getAllSettings());
  } catch (e) {
    return { inviato: false, motivo: "errore", dettaglio: (e as Error).message };
  }

  if (destinatari.length === 0) return { inviato: false, motivo: "nessun destinatario" };
  if (!emailConfigurata(config)) return { inviato: false, motivo: "email non configurata" };

  try {
    const trasporto = deps.trasporto ?? createTransporter(config);
    await trasporto.sendMail({
      from: mittenteDi(config),
      to: destinatari.join(", "),
      subject: msg.oggetto,
      html: msg.html,
    });
    return { inviato: true, destinatari: destinatari.length };
  } catch (e) {
    return { inviato: false, motivo: "errore", dettaglio: (e as Error).message };
  }
}

export function descriviMancatoInvio(esito: MancatoInvio): string {
  switch (esito.motivo) {
    case "nessun destinatario":
      return "Nessun destinatario configurato: salva almeno un indirizzo.";
    case "email non configurata":
      return "Configurazione email assente: compilala prima nel tab Email.";
    default:
      return esito.dettaglio ?? "Invio fallito";
  }
}

export type DepsNotturno = {
  sync?: (trigger: string) => Promise<EsitoSync>;
  invia?: (msg: Messaggio) => Promise<EsitoInvio>;
  adesso?: () => Date;
};

/**
 * La corsa notturna completa: caricamento + avviso.
 *
 * Sta qui e non in scheduler.ts perché quel modulo importa nodemailer e
 * l'intero storage, e provarne i tre rami significherebbe trascinarsi dietro
 * tutto. Il cron si limita a chiamare questa funzione.
 */
export async function eseguiSyncNotturno(deps: DepsNotturno = {}): Promise<EsitoInvio> {
  const sync = deps.sync ?? syncAll;
  const invia = deps.invia ?? inviaAvvisoSync;
  const adesso = deps.adesso ?? (() => new Date());

  const inizio = adesso();
  let msg: Messaggio;
  try {
    const esito = await sync("notturno");
    console.log(`[sync] notturno concluso: ${esito.status}`);
    msg = componiAvviso(esito, inizio, adesso());
  } catch (errore) {
    console.error("[sync] notturno fallito:", errore);
    msg = componiAvvisoGuasto(
      (errore as Error).message,
      adesso(),
      errore instanceof SyncGiaInCorso,
    );
  }

  try {
    const esitoInvio = await invia(msg);
    console.log(
      `[sync] avviso notturno: ${esitoInvio.inviato
        ? `inviato a ${esitoInvio.destinatari} destinatari`
        : `non inviato (${esitoInvio.motivo})`}`,
    );
    return esitoInvio;
  } catch (errore) {
    console.error("[sync] invio dell'avviso notturno fallito:", errore);
    return { inviato: false, motivo: "errore", dettaglio: (errore as Error).message };
  }
}
