/**
 * Riepilogo giornaliero via email delle mail non recapitate (issue #126).
 *
 * Al contrario dell'avviso del sync, parte solo se c'è qualcosa da dire: bounce
 * nuovi, una lettura che non funziona, un secret vicino alla scadenza. Gli
 * ultimi due ripetono ogni giorno finché qualcuno non interviene — sono
 * proprio i guasti che altrimenti nessuno vedrebbe, perché una casella che non
 * si legge più non produce bounce.
 *
 * I ritardi temporanei non compaiono: Exchange continua a provare, e se
 * rinuncia arriva un bounce vero. Si segnano comunque come notificati.
 */
import type { IStorage } from "../storage";
import type { ArchivioImpostazioni, ConfigEmail } from "../config-notifiche";
import { getConfigEmail, emailConfigurata, mittenteDi } from "../config-notifiche";
import { createTransporter } from "../email";
import { formattaIstante, type Messaggio } from "../avviso-sync";
import {
  GIORNI_PREAVVISO_SECRET,
  giorniAllaScadenza,
  leggiConfigBounce,
  leggiUltimoEsito,
  type EsitoLettura,
} from "../config-bounce";
import { descriviBounce, segnaMancatoRecapito, type RigaBounce } from "@shared/bounce";
import { codiceNotifica } from "@shared/storico-notifiche";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type IngressoRiepilogo = {
  righe: RigaBounce[];
  esito: EsitoLettura | null;
  giorniScadenza: number | null;
  casella: string;
};

/** Il messaggio, o `null` se non c'è niente da dire. */
export function componiRiepilogo(i: IngressoRiepilogo): Messaggio | null {
  const definitivi = i.righe.filter((r) => segnaMancatoRecapito(r.tipo));
  const letturaGuasta = i.esito !== null && !i.esito.riuscita;
  const scadenzaVicina = i.giorniScadenza !== null && i.giorniScadenza <= GIORNI_PREAVVISO_SECRET;
  if (definitivi.length === 0 && !letturaGuasta && !scadenzaVicina) return null;

  const avvisi: string[] = [];
  if (letturaGuasta) {
    avvisi.push(
      `<b>La lettura della casella ${escapeHtml(i.casella)} non funziona</b> ` +
        `(ultimo tentativo ${formattaIstante(i.esito!.quando)}): ${escapeHtml(i.esito!.messaggio)}. ` +
        "Finché non si risolve, i bounce nuovi non vengono rilevati.",
    );
  }
  if (scadenzaVicina) {
    const g = i.giorniScadenza!;
    avvisi.push(
      g < 0
        ? `<b>Il client secret di Microsoft 365 è scaduto da ${-g} ${-g === 1 ? "giorno" : "giorni"}.</b> Va generato un secret nuovo in Entra ID e inserito in Impostazioni → Bounce.`
        : `<b>Il client secret di Microsoft 365 scade fra ${g} ${g === 1 ? "giorno" : "giorni"}.</b> Va generato un secret nuovo in Entra ID e inserito in Impostazioni → Bounce.`,
    );
  }

  const righe = definitivi
    .map((r) => {
      const comunicazione =
        r.notificationId === null
          ? "<i>non abbinata</i>"
          : `${codiceNotifica(r.notificationId)}${r.oggettoComunicazione ? ` — ${escapeHtml(r.oggettoComunicazione)}` : ""}`;
      const conduttore = r.codiceConduttore
        ? `${escapeHtml(r.codiceConduttore)}${r.descrizioneConduttore ? ` ${escapeHtml(r.descrizioneConduttore)}` : ""}`
        : "—";
      return (
        "<tr>" +
        `<td>${formattaIstante(r.ricevutoAt)}</td>` +
        `<td>${escapeHtml(r.destinatario ?? "—")}</td>` +
        `<td>${conduttore}</td>` +
        `<td>${comunicazione}</td>` +
        `<td>${escapeHtml(descriviBounce(r.codice, r.tipo))}</td>` +
        "</tr>"
      );
    })
    .join("");

  const tabella =
    definitivi.length === 0
      ? ""
      : `<p>${definitivi.length === 1 ? "Una mail non è stata recapitata" : `${definitivi.length} mail non sono state recapitate`}:</p>` +
        '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px">' +
        "<tr><th>Ricevuto</th><th>Indirizzo</th><th>Conduttore</th><th>Comunicazione</th><th>Motivo</th></tr>" +
        righe +
        "</table>" +
        "<p>Gli indirizzi restano nell'anagrafica del consorzio e continuano a ricevere le comunicazioni: " +
        "la correzione va fatta alla fonte.</p>";

  const oggetto =
    definitivi.length > 0
      ? `Notifiche Impianti — ${definitivi.length === 1 ? "1 mail non recapitata" : `${definitivi.length} mail non recapitate`}`
      : letturaGuasta
        ? "Notifiche Impianti — la lettura dei bounce non funziona"
        : "Notifiche Impianti — client secret Microsoft 365 in scadenza";

  return {
    oggetto,
    html: avvisi.map((a) => `<p>${a}</p>`).join("") + tabella,
  };
}

export type DipendenzeRiepilogo = {
  archivio: ArchivioImpostazioni & Pick<IStorage, "bounceDaNotificare" | "segnaBounceNotificati" | "elencoBounce">;
  config?: ConfigEmail;
  trasporto?: { sendMail(m: Record<string, unknown>): Promise<unknown> };
  adesso?: () => Date;
};

export type EsitoRiepilogo =
  | { inviato: true; destinatari: number; bounce: number }
  | { inviato: false; motivo: string };

async function spedisci(
  deps: DipendenzeRiepilogo,
  destinatari: string[],
  msg: Messaggio,
): Promise<string | null> {
  const config = deps.config ?? getConfigEmail();
  if (destinatari.length === 0) return "Nessun destinatario del riepilogo: salva almeno un indirizzo.";
  if (!emailConfigurata(config)) return "Configurazione email assente: compilala prima nel tab Email.";
  try {
    const trasporto = deps.trasporto ?? createTransporter(config);
    await trasporto.sendMail({ from: mittenteDi(config), to: destinatari.join(", "), subject: msg.oggetto, html: msg.html });
    return null;
  } catch (e) {
    return `Invio del riepilogo fallito: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Il giro quotidiano: niente da dire, niente mail; i bounce mandati si segnano. */
export async function inviaRiepilogoBounce(deps: DipendenzeRiepilogo): Promise<EsitoRiepilogo> {
  const adesso = (deps.adesso ?? (() => new Date()))();
  const settings = await deps.archivio.getAllSettings();
  const config = leggiConfigBounce(settings);
  if (!config.riepilogo) return { inviato: false, motivo: "Riepilogo spento" };

  const righe = await deps.archivio.bounceDaNotificare();
  const msg = componiRiepilogo({
    righe,
    esito: config.enabled ? leggiUltimoEsito(settings) : null,
    giorniScadenza: config.enabled ? giorniAllaScadenza(config.secretScadenza, adesso) : null,
    casella: config.casella,
  });
  if (!msg) {
    // Solo ritardi temporanei: non si mandano, e non devono riemergere domani.
    await deps.archivio.segnaBounceNotificati(righe.map((r) => r.id), adesso);
    return { inviato: false, motivo: "Niente da segnalare" };
  }
  const errore = await spedisci(deps, config.destinatari, msg);
  if (errore) return { inviato: false, motivo: errore };
  await deps.archivio.segnaBounceNotificati(righe.map((r) => r.id), adesso);
  return { inviato: true, destinatari: config.destinatari.length, bounce: righe.length };
}

/**
 * Il bottone «Invia un riepilogo di prova»: gli ultimi bounce, già notificati
 * o no, e niente viene segnato. Senza bounce parte comunque, per provare
 * indirizzi e posta.
 */
export async function inviaRiepilogoProva(deps: DipendenzeRiepilogo): Promise<EsitoRiepilogo> {
  const adesso = (deps.adesso ?? (() => new Date()))();
  const settings = await deps.archivio.getAllSettings();
  const config = leggiConfigBounce(settings);
  const righe = await deps.archivio.elencoBounce(20);
  const msg = componiRiepilogo({
    righe,
    esito: leggiUltimoEsito(settings),
    giorniScadenza: giorniAllaScadenza(config.secretScadenza, adesso),
    casella: config.casella,
  }) ?? {
    oggetto: "Notifiche Impianti — nessuna mail non recapitata",
    html: "<p>Nessun bounce registrato e nessun problema di lettura.</p>",
  };
  const errore = await spedisci(deps, config.destinatari, { oggetto: `[PROVA] ${msg.oggetto}`, html: msg.html });
  if (errore) return { inviato: false, motivo: errore };
  return { inviato: true, destinatari: config.destinatari.length, bounce: righe.length };
}
