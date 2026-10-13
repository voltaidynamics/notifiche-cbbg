/**
 * Un giro di lettura della casella dei bounce (issue #126).
 *
 * Dall'ultimo messaggio visto in poi, dal più vecchio: per ciascuno si scarica
 * il MIME, si decide se è un bounce, lo si abbina alla mail spedita e lo si
 * registra. Ogni messaggio finisce in `bounce_messaggi`, bounce o no, perché la
 * casella non si può segnare come letta: è quella tabella a dire cosa è già
 * stato visto.
 *
 * L'esito dell'ultimo giro resta in `app_settings` (`bounce.ultimoEsito`):
 * la scheda di Impostazioni e il riepilogo via email lo mostrano, così un
 * secret scaduto non passa inosservato per settimane.
 */
import type { IStorage } from "../storage";
import type { ArchivioImpostazioni } from "../config-notifiche";
import {
  CHIAVI_BOUNCE,
  credenzialiGraph,
  leggiConfigBounce,
  type CredenzialiGraph,
  type EsitoLettura,
} from "../config-bounce";
import {
  elencaMessaggi,
  ottieniToken,
  permessiDelToken,
  scaricaMime,
  type FetchGraph,
} from "./graph";
import { analizzaMessaggio } from "./dsn";

/** Messaggi per giro: con un giro ogni 10 minuti, un arretrato si smaltisce da sé. */
export const LIMITE_PER_GIRO = 200;
/** Al primo giro si guarda indietro di una settimana, non dall'inizio della casella. */
export const GIORNI_PRIMA_LETTURA = 7;

export type ArchivioBounce = ArchivioImpostazioni &
  Pick<IStorage, "chiaviBounceEsaminate" | "trovaDestinatarioDelBounce" | "registraMessaggioBounce">;

export type DipendenzeLettura = {
  archivio: ArchivioBounce;
  fetchGraph?: FetchGraph;
  adesso?: () => Date;
};

export class LetturaBounceInCorso extends Error {
  constructor() {
    super("Una lettura della casella è già in corso");
  }
}

// Un processo solo (pm2 in fork mode), come il lock del sync.
let inCorso = false;

function plurale(n: number, uno: string, molti: string): string {
  return `${n} ${n === 1 ? uno : molti}`;
}

async function registraEsito(archivio: ArchivioImpostazioni, esito: EsitoLettura): Promise<void> {
  try {
    await archivio.setSetting(CHIAVI_BOUNCE.ultimoEsito, JSON.stringify(esito));
  } catch (e) {
    console.error("[bounce] Impossibile salvare l'esito della lettura:", e);
  }
}

async function giro(
  cred: CredenzialiGraph,
  settings: Record<string, string>,
  deps: Required<Omit<DipendenzeLettura, "fetchGraph">> & { fetchGraph?: FetchGraph },
): Promise<EsitoLettura> {
  const { archivio, fetchGraph, adesso } = deps;
  const inizio = adesso();
  const salvato = Date.parse(settings[CHIAVI_BOUNCE.letturaDal] ?? "");
  const dal = Number.isNaN(salvato)
    ? new Date(inizio.getTime() - GIORNI_PRIMA_LETTURA * 86_400_000)
    : new Date(salvato);

  const conteggi = { esaminati: 0, bounce: 0, abbinati: 0 };
  let ultimoVisto: Date | null = null;
  try {
    const token = await ottieniToken(cred, fetchGraph);
    const messaggi = await elencaMessaggi(token, cred.casella, dal, LIMITE_PER_GIRO, fetchGraph);
    const chiave = (m: (typeof messaggi)[number]) => m.internetMessageId ?? `graph:${m.id}`;
    const giaVisti = await archivio.chiaviBounceEsaminate(messaggi.map(chiave));

    for (const m of messaggi) {
      if (!giaVisti.has(chiave(m))) {
        const analisi = analizzaMessaggio(await scaricaMime(token, cred.casella, m.id, fetchGraph), cred.casella);
        const abbinato = analisi.bounce
          ? await archivio.trovaDestinatarioDelBounce({
              messageId: analisi.messageIdOriginale,
              email: analisi.destinatario,
              ricevutoAt: m.ricevutoAt,
            })
          : undefined;
        const nuovo = await archivio.registraMessaggioBounce({
          chiave: chiave(m),
          ricevutoAt: m.ricevutoAt,
          mittente: m.mittente || null,
          oggetto: m.oggetto || null,
          eBounce: analisi.bounce,
          ...(analisi.bounce
            ? {
                codice: analisi.codice,
                tipo: analisi.tipo,
                diagnostica: analisi.diagnostica,
                destinatario: analisi.destinatario,
                messageIdOriginale: analisi.messageIdOriginale,
                recipientId: abbinato?.recipientId ?? null,
                abbinamento: abbinato?.abbinamento ?? null,
              }
            : {}),
        });
        if (nuovo) {
          conteggi.esaminati++;
          if (analisi.bounce) conteggi.bounce++;
          if (abbinato) conteggi.abbinati++;
        }
      }
      ultimoVisto = m.ricevutoAt;
    }

    const altri = messaggi.length >= LIMITE_PER_GIRO ? " Ce ne sono altri: proseguo al prossimo giro." : "";
    return {
      quando: inizio.toISOString(),
      riuscita: true,
      messaggio:
        conteggi.esaminati === 0
          ? `Nessun messaggio nuovo in ${cred.casella}.${altri}`
          : `${plurale(conteggi.esaminati, "messaggio nuovo", "messaggi nuovi")}: ` +
            `${plurale(conteggi.bounce, "bounce", "bounce")}, ` +
            `${plurale(conteggi.abbinati, "abbinato", "abbinati")} a una comunicazione.${altri}`,
      ...conteggi,
    };
  } catch (e) {
    return {
      quando: inizio.toISOString(),
      riuscita: false,
      messaggio: e instanceof Error ? e.message : String(e),
      ...conteggi,
    };
  } finally {
    // Il punto da cui ripartire avanza fin dove si è arrivati, anche se il
    // giro si è fermato a metà: quello che è già registrato non si rilegge.
    if (ultimoVisto && ultimoVisto.getTime() > dal.getTime()) {
      await archivio.setSetting(CHIAVI_BOUNCE.letturaDal, ultimoVisto.toISOString());
    }
  }
}

/**
 * `ancheSpenta` serve al bottone «Leggi ora»: si prova prima di accendere.
 * Senza, con l'interruttore spento risponde `null` e non tocca niente.
 */
export async function leggiCasellaBounce(
  deps: DipendenzeLettura,
  opzioni: { ancheSpenta?: boolean } = {},
): Promise<EsitoLettura | null> {
  const adesso = deps.adesso ?? (() => new Date());
  const settings = await deps.archivio.getAllSettings();
  const config = leggiConfigBounce(settings);
  if (!config.enabled && !opzioni.ancheSpenta) return null;
  if (inCorso) throw new LetturaBounceInCorso();

  inCorso = true;
  try {
    const cred = credenzialiGraph(config);
    const esito: EsitoLettura = cred
      ? await giro(cred, settings, { archivio: deps.archivio, fetchGraph: deps.fetchGraph, adesso })
      : {
          quando: adesso().toISOString(),
          riuscita: false,
          messaggio: "Configurazione incompleta: servono Tenant ID, Client ID, client secret e casella.",
          esaminati: 0,
          bounce: 0,
          abbinati: 0,
        };
    if (!esito.riuscita) console.error(`[bounce] Lettura fallita: ${esito.messaggio}`);
    await registraEsito(deps.archivio, esito);
    return esito;
  } finally {
    inCorso = false;
  }
}

export type EsitoProva = { riuscita: boolean; messaggio: string };

/**
 * Il bottone «Prova» di Impostazioni: token e lettura dell'elenco, senza
 * scaricare né registrare niente. Usa la configurazione salvata, anche spenta.
 */
export async function provaCasellaBounce(
  cred: CredenzialiGraph | null,
  fetchGraph?: FetchGraph,
  adesso: Date = new Date(),
): Promise<EsitoProva> {
  if (!cred) {
    return {
      riuscita: false,
      messaggio: "Configurazione incompleta: servono Tenant ID, Client ID, client secret e casella. Salva prima di provare.",
    };
  }
  try {
    const token = await ottieniToken(cred, fetchGraph);
    const permessi = permessiDelToken(token);
    if (permessi !== null && !permessi.some((p) => p.startsWith("Mail.Read"))) {
      return {
        riuscita: false,
        messaggio:
          `Token ottenuto, ma senza il permesso Mail.Read (permessi: ${permessi.join(", ") || "nessuno"}). ` +
          "Va concesso il consenso amministratore in Entra ID.",
      };
    }
    const dal = new Date(adesso.getTime() - 30 * 86_400_000);
    const messaggi = await elencaMessaggi(token, cred.casella, dal, 50, fetchGraph);
    const quanti = messaggi.length >= 50 ? "almeno 50 messaggi" : plurale(messaggi.length, "messaggio", "messaggi");
    return {
      riuscita: true,
      messaggio: `Accesso riuscito: la casella ${cred.casella} è leggibile (${quanti} negli ultimi 30 giorni).`,
    };
  } catch (e) {
    return { riuscita: false, messaggio: e instanceof Error ? e.message : String(e) };
  }
}
