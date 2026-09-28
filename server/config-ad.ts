/**
 * Configurazione di Active Directory.
 *
 * Gemello di `config-notifiche.ts`, con una differenza deliberata: **non c'è
 * nessun ripiego sulle variabili d'ambiente**. Host, porta, suffisso di dominio
 * e certificato della CA interna sono i quattro dati che i sistemisti del
 * consorzio ci daranno in sede: devono poter essere inseriti dall'interfaccia al
 * collaudo, senza un deploy e senza toccare `.env`.
 *
 * Non c'è nemmeno nessun segreto: avendo scelto il bind diretto come l'utente,
 * non esiste un account di servizio le cui credenziali vadano custodite. Il
 * `caPem` è un certificato pubblico e può tornare al client senza problemi.
 */
import type { ArchivioImpostazioni } from "./config-notifiche";

export const MODI_TLS = ["ldaps", "starttls", "nessuno"] as const;
export type ModoTls = (typeof MODI_TLS)[number];

export type ConfigAd = {
  enabled: boolean;
  host: string;
  port: number;
  dominio: string; // suffisso UPN, es. "consorzio.local"
  tls: ModoTls;
  caPem: string;
  rejectUnauthorized: boolean;
  timeoutMs: number;
};

export const CHIAVI_AD = {
  enabled: "ad.enabled",
  host: "ad.host",
  port: "ad.port",
  dominio: "ad.dominio",
  tls: "ad.tls",
  caPem: "ad.caPem",
  rejectUnauthorized: "ad.rejectUnauthorized",
  timeoutMs: "ad.timeoutMs",
} as const;

const DEFAULT: ConfigAd = {
  enabled: false,
  host: "",
  port: 636,
  dominio: "",
  tls: "ldaps",
  caPem: "",
  rejectUnauthorized: true,
  timeoutMs: 5000,
};

function testo(v: string | undefined): string {
  return (v ?? "").trim();
}

function numero(v: string | undefined, predefinito: number): number {
  const s = testo(v);
  if (s === "") return predefinito;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : predefinito;
}

function booleano(v: string | undefined, predefinito: boolean): boolean {
  const s = testo(v);
  if (s === "") return predefinito;
  if (s === "true") return true;
  if (s === "false") return false;
  // Un valore sconosciuto ripiega sul default e non su false: un errore di
  // battitura (es. "no" o "vero") non deve declassare un booleano critico come
  // rejectUnauthorized su cui viaggiano le password verso il domain controller.
  return predefinito;
}

export function leggiConfigAd(settings: Record<string, string>): ConfigAd {
  const tls = testo(settings[CHIAVI_AD.tls]);
  return {
    enabled: booleano(settings[CHIAVI_AD.enabled], DEFAULT.enabled),
    host: testo(settings[CHIAVI_AD.host]),
    port: numero(settings[CHIAVI_AD.port], DEFAULT.port),
    dominio: testo(settings[CHIAVI_AD.dominio]),
    // Un valore sconosciuto ripiega su ldaps e mai sul chiaro: un errore di
    // battitura non deve declassare il canale su cui viaggiano le password.
    tls: (MODI_TLS as readonly string[]).includes(tls) ? (tls as ModoTls) : DEFAULT.tls,
    caPem: settings[CHIAVI_AD.caPem] ?? "",
    rejectUnauthorized: booleano(
      settings[CHIAVI_AD.rejectUnauthorized],
      DEFAULT.rejectUnauthorized,
    ),
    timeoutMs: numero(settings[CHIAVI_AD.timeoutMs], DEFAULT.timeoutMs),
  };
}

export function adConfigurato(c: ConfigAd): boolean {
  return c.enabled && c.host !== "" && c.dominio !== "";
}

/**
 * L'inverso di `leggiConfigAd`: serializza una `ConfigAd` nella stessa forma
 * `Record<string, string>` con le chiavi di `CHIAVI_AD`. Serve solo a far
 * ripassare un oggetto già costruito dalla normalizzazione di `leggiConfigAd`
 * (vedi `salvaConfigAd`), non è la via con cui l'app legge le impostazioni.
 */
function serializzaConfigAd(c: ConfigAd): Record<string, string> {
  return {
    [CHIAVI_AD.enabled]: c.enabled ? "true" : "false",
    [CHIAVI_AD.host]: c.host,
    [CHIAVI_AD.port]: String(c.port),
    [CHIAVI_AD.dominio]: c.dominio,
    [CHIAVI_AD.tls]: c.tls,
    [CHIAVI_AD.caPem]: c.caPem,
    [CHIAVI_AD.rejectUnauthorized]: c.rejectUnauthorized ? "true" : "false",
    [CHIAVI_AD.timeoutMs]: String(c.timeoutMs),
  };
}

// ---- Stato in memoria ------------------------------------------------------

let configAd: ConfigAd = { ...DEFAULT };

/**
 * Una **copia**, non l'oggetto vivo: chi la riceve non deve poter riscrivere la
 * configurazione di autenticazione senza passare da `salvaConfigAd`, cioè senza
 * persistenza e senza che nessuno se ne accorga. `ConfigAd` è piatto, quindi lo
 * spread basta.
 */
export function getConfigAd(): ConfigAd {
  return { ...configAd };
}

/** Da chiamare all'avvio del processo, prima di servire richieste. */
export async function caricaConfigAd(archivio: ArchivioImpostazioni): Promise<void> {
  configAd = leggiConfigAd(await archivio.getAllSettings());
}

export async function salvaConfigAd(
  archivio: ArchivioImpostazioni,
  patch: Partial<ConfigAd>,
): Promise<ConfigAd> {
  // Ripassare il merge da `leggiConfigAd` invece di fidarsi del `patch`
  // com'è: senza questo, salvare `host: "  "` lo scriverebbe non tagliato, e
  // il processo in corsa continuerebbe a trattare AD come configurato fino al
  // prossimo riavvio — quando `leggiConfigAd` lo rileggerebbe vuoto.
  const aggiornata: ConfigAd = leggiConfigAd(serializzaConfigAd({ ...configAd, ...patch }));

  await archivio.setSetting(CHIAVI_AD.enabled, aggiornata.enabled ? "true" : "false");
  await archivio.setSetting(CHIAVI_AD.host, aggiornata.host);
  await archivio.setSetting(CHIAVI_AD.port, String(aggiornata.port));
  await archivio.setSetting(CHIAVI_AD.dominio, aggiornata.dominio);
  await archivio.setSetting(CHIAVI_AD.tls, aggiornata.tls);
  await archivio.setSetting(CHIAVI_AD.caPem, aggiornata.caPem);
  await archivio.setSetting(
    CHIAVI_AD.rejectUnauthorized,
    aggiornata.rejectUnauthorized ? "true" : "false",
  );
  await archivio.setSetting(CHIAVI_AD.timeoutMs, String(aggiornata.timeoutMs));

  configAd = aggiornata;
  return aggiornata;
}
