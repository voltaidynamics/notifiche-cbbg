/**
 * Il dialogo vero con il domain controller.
 *
 * Modalità scelta: **simple bind diretto come l'utente**. Il consorzio non ci
 * concede un account di servizio, quindi si può fare una cosa sola — tentare il
 * bind e vedere se riesce. Niente ricerca di utenti, niente lettura dei gruppi.
 */
import { Client, type ClientOptions } from "ldapts";
import {
  type EsitoAd,
  type VerificatoreAd,
  passwordVuota,
  esitoDaErroreLdap,
} from "./verificatore";
import { type ConfigAd, adConfigurato } from "../config-ad";

export function urlDa(c: ConfigAd): string {
  // StartTLS parte in chiaro e alza il TLS dopo la connessione: lo schema resta ldap://.
  const schema = c.tls === "ldaps" ? "ldaps" : "ldap";
  return `${schema}://${c.host}:${c.port}`;
}

export function opzioniTls(
  c: ConfigAd,
): { ca?: string[]; rejectUnauthorized: boolean; servername: string } {
  const ca = c.caPem.trim();
  return {
    ...(ca === "" ? {} : { ca: [c.caPem] }),
    rejectUnauthorized: c.rejectUnauthorized,
    // Node sceglie il nome da verificare come `servername || host ||
    // socket._host || "localhost"` (tls.connect). Con un hostname
    // `socket._host` è valorizzato e il controllo è corretto da solo; con un
    // IP letterale (il caso più probabile in collaudo, dove i sysadmin danno
    // l'IP del domain controller) `socket._host` resta null e si ricade su
    // "localhost" — un nome che nessun certificato CA corretto verifica mai.
    // Va esplicitato qui, altrimenti StartTLS su IP fallisce sempre.
    servername: c.host,
  };
}

export function upn(username: string, dominio: string): string {
  const u = username.trim();
  return u.includes("@") ? u : `${u}@${dominio}`;
}

/** Fabbriche di connessione iniettabili — usate solo dai test, vedi sotto. */
type FabbricheConnessione = Pick<ClientOptions, "createConnection" | "createSecureConnection">;

/**
 * Le opzioni del client `ldapts`, con `tlsOptions` incluso **solo per
 * `ldaps`**. `Client` considera "sicura" — e apre subito un socket TLS invece
 * di uno in chiaro — qualunque connessione le cui `tlsOptions` abbiano almeno
 * un campo definito (`hasTlsOptions` in `ldapts/src/Client.ts`), a prescindere
 * dallo schema dell'URL. `opzioniTls` ritorna sempre `rejectUnauthorized`,
 * quindi passarlo qui anche per `ldap://` forzerebbe un handshake TLS su una
 * porta che parla LDAP in chiaro: nessuno risponde, e il tentativo si blocca
 * fino al `connectTimeout` invece di riuscire o fallire subito — due modalità
 * su tre smetterebbero di funzionare. Per `starttls` le stesse opzioni vanno a
 * `startTLS()`, dopo che la connessione in chiaro è aperta: è lì che
 * appartengono per quella modalità.
 */
function opzioniClient(
  c: ConfigAd,
  tls: ReturnType<typeof opzioniTls>,
  fabbriche?: FabbricheConnessione,
): ClientOptions {
  return {
    url: urlDa(c),
    timeout: c.timeoutMs,
    connectTimeout: c.timeoutMs,
    ...(c.tls === "ldaps" ? { tlsOptions: tls } : {}),
    ...fabbriche,
  };
}

export class LdapVerificatoreAd implements VerificatoreAd {
  /**
   * La configurazione arriva da una funzione, non da un valore catturato alla
   * costruzione: salvarla dall'interfaccia deve avere effetto subito. È la
   * stessa lezione di `server/sms.ts`, dove il client del fornitore SMS
   * costruito una volta al caricamento del modulo rese inerti le credenziali
   * salvate.
   *
   * Il secondo parametro esiste solo per i test: inietta
   * `createConnection`/`createSecureConnection` per osservare quale tipo di
   * socket ldapts apre in ciascuna modalità TLS, senza toccare la rete. In
   * produzione resta `undefined` e ldapts usa i suoi default
   * (`net.connect` / `tls.connect`).
   */
  constructor(
    private leggiConfig: () => ConfigAd,
    private fabbricheConnessione?: FabbricheConnessione,
  ) {}

  async verifica(username: string, password: string): Promise<EsitoAd> {
    // Prima di qualunque I/O: un unauthenticated bind riuscirebbe.
    if (passwordVuota(password)) return { esito: "credenzialiNonValide" };

    const c = this.leggiConfig();
    if (!adConfigurato(c)) {
      return { esito: "nonRaggiungibile", dettaglio: "Active Directory non è configurata" };
    }

    const tls = opzioniTls(c);
    // Una connessione per tentativo: nel protocollo LDAP il bind È lo stato
    // della connessione, e riusarne una già bindata fra utenti diversi è il modo
    // di autenticare la persona sbagliata.
    const client = new Client(opzioniClient(c, tls, this.fabbricheConnessione));

    try {
      if (c.tls === "starttls") await client.startTLS(tls);
      await client.bind(upn(username, c.dominio), password);
      return { esito: "ok" };
    } catch (err) {
      return esitoDaErroreLdap(err);
    } finally {
      await client.unbind().catch(() => {});
    }
  }
}

export type EsitoProva = {
  raggiungibile: boolean;
  messaggio: string;
  bind?: EsitoAd;
};

/**
 * Il bottone «Prova connessione» di Impostazioni. Con il vincolo che non
 * vedremo mai il loro AD prima del collaudo, questo è lo strumento diagnostico
 * principale: separa «host, porta, TLS e certificato sono a posto» da «queste
 * credenziali sono giuste».
 */
export async function provaConnessione(
  c: ConfigAd,
  credenziali?: { username: string; password: string },
): Promise<EsitoProva> {
  if (c.host === "" || c.dominio === "") {
    return { raggiungibile: false, messaggio: "Host e dominio sono obbligatori" };
  }

  const tls = opzioniTls(c);
  const client = new Client(opzioniClient(c, tls));

  try {
    if (c.tls === "starttls") await client.startTLS(tls);
    else await client.bind("", ""); // apre la connessione senza autenticare nessuno
  } catch (err) {
    const e = err as { message?: string; code?: unknown };
    const messaggio = e?.message ?? String(err);
    // Un codice numerico è un risultato LDAP vero e proprio: il server ha
    // risposto, quindi canale e TLS funzionano — anche quando la risposta è un
    // rifiuto. Non solo 49 (invalidCredentials): un domain controller che
    // rifiuta il bind anonimo risponde 48 (inappropriateAuthentication) o 53
    // (unwillingToPerform), e anche quella è una prova di raggiungibilità.
    // Solo un errore senza codice — di trasporto o TLS — significa che il
    // domain controller non è raggiungibile.
    if (typeof e?.code !== "number") {
      await client.unbind().catch(() => {});
      return { raggiungibile: false, messaggio };
    }
  }

  if (!credenziali) {
    await client.unbind().catch(() => {});
    return { raggiungibile: true, messaggio: "Domain controller raggiungibile, TLS a posto" };
  }

  await client.unbind().catch(() => {});
  // La prova credenziali non passa dal gate `enabled` di `verifica()`: il
  // flusso reale è un amministratore che compila host/dominio/credenziali e le
  // prova PRIMA di accendere l'interruttore, per sapere se l'account è giusto
  // senza dover attivare AD alla cieca. Host e dominio sono già convalidati
  // sopra, ed è quella la parte del gate che conta per un tentativo di bind:
  // l'interruttore no. Il gate vero di `verifica()` resta intatto per il login.
  const verificatore = new LdapVerificatoreAd(() => ({ ...c, enabled: true }));
  const bind = await verificatore.verifica(credenziali.username, credenziali.password);
  return {
    raggiungibile: true,
    messaggio: "Domain controller raggiungibile, TLS a posto",
    bind,
  };
}
