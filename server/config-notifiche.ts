/**
 * Configurazione dei canali di notifica (email e SMS).
 *
 * Prima di questo modulo le credenziali salvate dall'interfaccia finivano solo
 * in `process.env` del processo in esecuzione: sparivano al primo riavvio di pm2
 * e, per gli SMS, non avevano alcun effetto perche' le credenziali venivano
 * lette una sola volta al caricamento del modulo.
 *
 * Ora la fonte di verita' e' la tabella `app_settings`, con le variabili
 * d'ambiente come ripiego: cosi' un'installazione nuova parte da `.env` e chi
 * salva dall'interfaccia sovrascrive in modo permanente.
 */

// I due canali di posta stanno in `@shared/canale-email`: la stessa regola
// serve alla pagina «Invia notifica», che non può importare da `server/`.
// Ripassano da qui perché è qui che le cerca chi legge la configurazione.
import type { CanaleEmail } from "@shared/canale-email";
export { CANALI_EMAIL, ETICHETTE_CANALE, canaleDi, type CanaleEmail } from "@shared/canale-email";

export type ConfigEmail = {
  service: string;          // "gmail" | "smtp" | altro servizio Nodemailer
  user: string;             // username di login SMTP
  password: string;
  /**
   * Indirizzo «From» dei messaggi; vuoto = lo username. Esiste perché non tutti
   * i servizi SMTP fanno login con l'indirizzo: quello dei test ha uno username
   * come `1132a1555b5fd6ae90f1`, che come mittente nessun server accetterebbe.
   */
  mittente: string;
  smtpHost: string | null;  // usati solo con service === "smtp"
  smtpPort: number | null;
  smtpSecure: boolean;
};

export type ConfigSms = {
  clientid: string;
  password: string;
};

/** Il minimo che serve a questo modulo: evita di dipendere da tutta IStorage. */
export type ArchivioImpostazioni = {
  getAllSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;
};

export const CHIAVI_EMAIL = {
  service: "email.service",
  user: "email.user",
  password: "email.password",
  mittente: "email.from",
  smtpHost: "email.smtpHost",
  smtpPort: "email.smtpPort",
  smtpSecure: "email.smtpSecure",
} as const;

/**
 * Il secondo account di posta: la PEC.
 *
 * L'anagrafica distingue i conduttori con `tipo_email`, e fra gli attivi 1479 su
 * 3254 hanno un indirizzo PEC. Una comunicazione spedita a una PEC da una
 * casella ordinaria non ha valore legale — niente ricevuta di accettazione né di
 * consegna — e molte caselle PEC rifiutano del tutto la posta non certificata:
 * servono due mittenti distinti, non un mittente con due indirizzi.
 */
export const CHIAVI_EMAIL_PEC = {
  service: "emailPec.service",
  user: "emailPec.user",
  password: "emailPec.password",
  mittente: "emailPec.from",
  smtpHost: "emailPec.smtpHost",
  smtpPort: "emailPec.smtpPort",
  smtpSecure: "emailPec.smtpSecure",
} as const;

export const CHIAVI_SMS = {
  clientid: "sms.clientid",
  password: "sms.password",
} as const;

/** Una stringa fatta di soli spazi vale come valore assente, non come "svuota". */
function valoreONull(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

function primoValorizzato(...valori: (string | undefined)[]): string {
  for (const v of valori) {
    const s = valoreONull(v);
    if (s !== null) return s;
  }
  return "";
}

function numeroONull(v: string | undefined): number | null {
  const s = valoreONull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Solo `"true"` accende e solo `"false"` spegne: qualunque altro valore ripiega
 * sul default.
 *
 * Prima qui c'era `sicura === "true"`, che manda a `false` ogni valore non
 * riconosciuto. Per la posta ordinaria è innocuo, perché il default è già spento
 * — ma per la PEC il default è **acceso**, e un `"no"` finito in `app_settings`
 * (una modifica a mano, una migrazione futura) spegnerebbe in silenzio il TLS
 * verso il gestore, senza un errore da nessuna parte: un errore di battitura
 * non declassa un canale su cui viaggiano credenziali.
 */
function booleano(v: string | null, predefinito: boolean): boolean {
  if (v === null) return predefinito;
  if (v === "true") return true;
  if (v === "false") return false;
  return predefinito;
}

export function leggiConfigEmail(
  settings: Record<string, string>,
  env: NodeJS.ProcessEnv,
): ConfigEmail {
  const porta = valoreONull(settings[CHIAVI_EMAIL.smtpPort]) ?? valoreONull(env.SMTP_PORT);
  const sicura = valoreONull(settings[CHIAVI_EMAIL.smtpSecure]) ?? valoreONull(env.SMTP_SECURE);
  return {
    service: primoValorizzato(settings[CHIAVI_EMAIL.service], env.EMAIL_SERVICE) || "gmail",
    user: primoValorizzato(settings[CHIAVI_EMAIL.user], env.EMAIL_USER),
    password: primoValorizzato(settings[CHIAVI_EMAIL.password], env.EMAIL_PASSWORD),
    mittente: primoValorizzato(settings[CHIAVI_EMAIL.mittente], env.EMAIL_FROM),
    smtpHost: valoreONull(settings[CHIAVI_EMAIL.smtpHost]) ?? valoreONull(env.SMTP_HOST),
    smtpPort: numeroONull(porta ?? undefined),
    smtpSecure: booleano(sicura, false),
  };
}

/**
 * Le credenziali della PEC.
 *
 * Il servizio di default è `smtp` e non `gmail`: una PEC si consegna al server
 * del gestore (Aruba, Register, Poste…), non a un servizio noto a Nodemailer.
 * Le variabili d'ambiente sono il punto di partenza di un'installazione nuova,
 * come per la posta ordinaria.
 */
export function leggiConfigEmailPec(
  settings: Record<string, string>,
  env: NodeJS.ProcessEnv,
): ConfigEmail {
  const porta = valoreONull(settings[CHIAVI_EMAIL_PEC.smtpPort]) ?? valoreONull(env.SMTP_PEC_PORT);
  const sicura = valoreONull(settings[CHIAVI_EMAIL_PEC.smtpSecure]) ?? valoreONull(env.SMTP_PEC_SECURE);
  return {
    service: primoValorizzato(settings[CHIAVI_EMAIL_PEC.service], env.EMAIL_PEC_SERVICE) || "smtp",
    user: primoValorizzato(settings[CHIAVI_EMAIL_PEC.user], env.EMAIL_PEC_USER),
    password: primoValorizzato(settings[CHIAVI_EMAIL_PEC.password], env.EMAIL_PEC_PASSWORD),
    mittente: primoValorizzato(settings[CHIAVI_EMAIL_PEC.mittente], env.EMAIL_PEC_FROM),
    smtpHost: valoreONull(settings[CHIAVI_EMAIL_PEC.smtpHost]) ?? valoreONull(env.SMTP_PEC_HOST),
    smtpPort: numeroONull(porta ?? undefined),
    // La PEC viaggia su TLS implicito (465) presso tutti i gestori italiani:
    // qui il default è acceso, al contrario della posta ordinaria — ed è
    // proprio per questo che `booleano` non deve mandare a `false` un valore
    // che non riconosce.
    smtpSecure: booleano(sicura, true),
  };
}

export function leggiConfigSms(
  settings: Record<string, string>,
  env: NodeJS.ProcessEnv,
): ConfigSms {
  return {
    clientid: primoValorizzato(settings[CHIAVI_SMS.clientid], env.SMS_CLIENTID),
    password: primoValorizzato(settings[CHIAVI_SMS.password], env.SMS_PASSWORD),
  };
}

/** L'indirizzo «From» con cui parte un messaggio: il mittente, o lo username. */
export function mittenteDi(c: ConfigEmail): string {
  return c.mittente || c.user;
}

export function emailConfigurata(c: ConfigEmail): boolean {
  return c.user !== "" && c.password !== "";
}

export function smsConfigurata(c: ConfigSms): boolean {
  return c.clientid !== "" && c.password !== "";
}

// ---- Stato in memoria ------------------------------------------------------
// Copia di lavoro riletta dal database all'avvio e riallineata a ogni salvataggio,
// cosi' l'invio non paga una query per ogni messaggio.

let configEmail: ConfigEmail = leggiConfigEmail({}, process.env);
let configEmailPec: ConfigEmail = leggiConfigEmailPec({}, process.env);
let configSms: ConfigSms = leggiConfigSms({}, process.env);

// Tutti i getter restituiscono una **copia**, non l'oggetto vivo: un chiamante
// distratto non deve poter riscrivere la configurazione attiva senza passare da
// `salvaConfig*`, cioè senza persistenza e senza lasciare traccia. Sono oggetti
// piatti, quindi lo spread basta. Nessun chiamante confronta per identità:
// `server/sms.ts` legge le credenziali a ogni messaggio e non tiene nessun
// client in cache.

export function getConfigEmail(): ConfigEmail {
  return { ...configEmail };
}

export function getConfigEmailPec(): ConfigEmail {
  return { ...configEmailPec };
}

/** Le credenziali del canale con cui va spedita una certa comunicazione. */
export function getConfigCanale(canale: CanaleEmail): ConfigEmail {
  return { ...(canale === "pec" ? configEmailPec : configEmail) };
}

export function getConfigSms(): ConfigSms {
  return { ...configSms };
}

/** Da chiamare all'avvio del processo, prima di servire richieste. */
export async function caricaConfigNotifiche(
  archivio: ArchivioImpostazioni,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const settings = await archivio.getAllSettings();
  configEmail = leggiConfigEmail(settings, env);
  configEmailPec = leggiConfigEmailPec(settings, env);
  configSms = leggiConfigSms(settings, env);
}

/**
 * Un segreto vuoto significa "lascia quello che c'e' gia'", non "cancellalo":
 * l'interfaccia non puo' rimostrare la password salvata, quindi un salvataggio
 * fatto per cambiare solo l'indirizzo mittente cancellerebbe la password.
 */
function segretoAggiornato(nuovo: string | undefined, attuale: string): string {
  const s = valoreONull(nuovo);
  return s === null ? attuale : s;
}

export async function salvaConfigEmail(
  archivio: ArchivioImpostazioni,
  patch: Partial<{
    service: string;
    user: string;
    password: string;
    mittente: string;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean;
  }>,
): Promise<ConfigEmail> {
  const aggiornata: ConfigEmail = {
    service: valoreONull(patch.service) ?? configEmail.service,
    user: valoreONull(patch.user) ?? configEmail.user,
    password: segretoAggiornato(patch.password, configEmail.password),
    // Non è un segreto: la pagina lo rimostra, quindi vuoto vuol dire «nessun
    // mittente a parte», cioè torna lo username.
    mittente: patch.mittente === undefined ? configEmail.mittente : (valoreONull(patch.mittente) ?? ""),
    smtpHost: patch.smtpHost === undefined
      ? configEmail.smtpHost
      : valoreONull(patch.smtpHost ?? undefined),
    smtpPort: patch.smtpPort === undefined ? configEmail.smtpPort : patch.smtpPort,
    smtpSecure: patch.smtpSecure === undefined ? configEmail.smtpSecure : patch.smtpSecure,
  };

  await archivio.setSetting(CHIAVI_EMAIL.service, aggiornata.service);
  await archivio.setSetting(CHIAVI_EMAIL.user, aggiornata.user);
  await archivio.setSetting(CHIAVI_EMAIL.password, aggiornata.password);
  await archivio.setSetting(CHIAVI_EMAIL.mittente, aggiornata.mittente);
  await archivio.setSetting(CHIAVI_EMAIL.smtpHost, aggiornata.smtpHost ?? "");
  await archivio.setSetting(
    CHIAVI_EMAIL.smtpPort,
    aggiornata.smtpPort === null ? "" : String(aggiornata.smtpPort),
  );
  await archivio.setSetting(CHIAVI_EMAIL.smtpSecure, aggiornata.smtpSecure ? "true" : "false");

  configEmail = aggiornata;
  return aggiornata;
}

export async function salvaConfigEmailPec(
  archivio: ArchivioImpostazioni,
  patch: Partial<{
    service: string;
    user: string;
    password: string;
    mittente: string;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean;
  }>,
): Promise<ConfigEmail> {
  const aggiornata: ConfigEmail = {
    service: valoreONull(patch.service) ?? configEmailPec.service,
    user: valoreONull(patch.user) ?? configEmailPec.user,
    password: segretoAggiornato(patch.password, configEmailPec.password),
    // Non è un segreto: la pagina lo rimostra, quindi vuoto vuol dire «nessun
    // mittente a parte», cioè torna lo username.
    mittente: patch.mittente === undefined ? configEmailPec.mittente : (valoreONull(patch.mittente) ?? ""),
    smtpHost: patch.smtpHost === undefined
      ? configEmailPec.smtpHost
      : valoreONull(patch.smtpHost ?? undefined),
    smtpPort: patch.smtpPort === undefined ? configEmailPec.smtpPort : patch.smtpPort,
    smtpSecure: patch.smtpSecure === undefined ? configEmailPec.smtpSecure : patch.smtpSecure,
  };

  await archivio.setSetting(CHIAVI_EMAIL_PEC.service, aggiornata.service);
  await archivio.setSetting(CHIAVI_EMAIL_PEC.user, aggiornata.user);
  await archivio.setSetting(CHIAVI_EMAIL_PEC.password, aggiornata.password);
  await archivio.setSetting(CHIAVI_EMAIL_PEC.mittente, aggiornata.mittente);
  await archivio.setSetting(CHIAVI_EMAIL_PEC.smtpHost, aggiornata.smtpHost ?? "");
  await archivio.setSetting(
    CHIAVI_EMAIL_PEC.smtpPort,
    aggiornata.smtpPort === null ? "" : String(aggiornata.smtpPort),
  );
  await archivio.setSetting(CHIAVI_EMAIL_PEC.smtpSecure, aggiornata.smtpSecure ? "true" : "false");

  configEmailPec = aggiornata;
  return aggiornata;
}

export async function salvaConfigSms(
  archivio: ArchivioImpostazioni,
  patch: Partial<{ clientid: string; password: string }>,
): Promise<ConfigSms> {
  const aggiornata: ConfigSms = {
    clientid: valoreONull(patch.clientid) ?? configSms.clientid,
    // Una password vuota conserva quella salvata: l'interfaccia non puo'
    // rimostrarla, quindi un salvataggio fatto per cambiare il Client ID la
    // cancellerebbe.
    password: segretoAggiornato(patch.password, configSms.password),
  };

  await archivio.setSetting(CHIAVI_SMS.clientid, aggiornata.clientid);
  await archivio.setSetting(CHIAVI_SMS.password, aggiornata.password);

  configSms = aggiornata;
  return aggiornata;
}
