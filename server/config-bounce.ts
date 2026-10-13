/**
 * Configurazione della lettura dei bounce dalla casella Microsoft 365
 * (issue #126).
 *
 * Tutto in `app_settings`, niente `.env`: le credenziali arrivano dal
 * consorzio a collaudo e il secret scade ogni due anni, quindi si devono poter
 * cambiare dall'interfaccia senza un deploy.
 *
 * Il secret segue le regole delle altre password: non torna mai al client
 * (`secretImpostato`) e un valore vuoto al salvataggio tiene quello salvato.
 */
import { z } from "zod";
import type { ArchivioImpostazioni } from "./config-notifiche";
import { separaDestinatari, validaDestinatari } from "./avviso-sync";

export const CHIAVI_BOUNCE = {
  enabled: "bounce.enabled",
  tenantId: "bounce.tenantId",
  clientId: "bounce.clientId",
  clientSecret: "bounce.clientSecret",
  casella: "bounce.casella",
  secretScadenza: "bounce.secretScadenza",
  riepilogo: "bounce.riepilogo.enabled",
  destinatari: "bounce.riepilogo.destinatari",
  // Stato della lettura, scritto dal server e mai dalla scheda.
  letturaDal: "bounce.letturaDal",
  ultimoEsito: "bounce.ultimoEsito",
} as const;

/** Giorni prima della scadenza del secret da cui si comincia ad avvisare. */
export const GIORNI_PREAVVISO_SECRET = 30;

export type ConfigBounce = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  casella: string;
  /** `AAAA-MM-GG`, inserita a mano: con `Mail.Read` l'app non la può leggere da Microsoft. */
  secretScadenza: string;
  riepilogo: boolean;
  destinatari: string[];
};

export type EsitoLettura = {
  quando: string; // ISO
  riuscita: boolean;
  messaggio: string;
  esaminati: number;
  bounce: number;
  abbinati: number;
};

/** Quello che la scheda riceve: mai il secret. */
export type VistaConfigBounce = Omit<ConfigBounce, "clientSecret"> & {
  secretImpostato: boolean;
  /** Null se la scadenza non è inserita; negativo se è già passata. */
  giorniAllaScadenza: number | null;
  ultimoEsito: EsitoLettura | null;
};

export type CredenzialiGraph = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  casella: string;
};

function testo(v: string | undefined): string {
  return (v ?? "").trim();
}

export function leggiConfigBounce(settings: Record<string, string>): ConfigBounce {
  return {
    enabled: testo(settings[CHIAVI_BOUNCE.enabled]) === "true",
    tenantId: testo(settings[CHIAVI_BOUNCE.tenantId]),
    clientId: testo(settings[CHIAVI_BOUNCE.clientId]),
    clientSecret: testo(settings[CHIAVI_BOUNCE.clientSecret]),
    casella: testo(settings[CHIAVI_BOUNCE.casella]).toLowerCase(),
    secretScadenza: testo(settings[CHIAVI_BOUNCE.secretScadenza]),
    riepilogo: testo(settings[CHIAVI_BOUNCE.riepilogo]) === "true",
    destinatari: separaDestinatari(settings[CHIAVI_BOUNCE.destinatari] ?? ""),
  };
}

export function leggiUltimoEsito(settings: Record<string, string>): EsitoLettura | null {
  const grezzo = testo(settings[CHIAVI_BOUNCE.ultimoEsito]);
  if (grezzo === "") return null;
  try {
    return JSON.parse(grezzo) as EsitoLettura;
  } catch {
    return null;
  }
}

/** Giorni interi da `oggi` alla scadenza, contati sul calendario e non sulle ore. */
export function giorniAllaScadenza(scadenza: string, oggi: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scadenza)) return null;
  const fine = Date.parse(`${scadenza}T00:00:00Z`);
  if (Number.isNaN(fine)) return null;
  const inizio = Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate());
  return Math.round((fine - inizio) / 86_400_000);
}

export function vistaConfigBounce(settings: Record<string, string>, oggi: Date = new Date()): VistaConfigBounce {
  const { clientSecret, ...resto } = leggiConfigBounce(settings);
  return {
    ...resto,
    secretImpostato: clientSecret !== "",
    giorniAllaScadenza: giorniAllaScadenza(resto.secretScadenza, oggi),
    ultimoEsito: leggiUltimoEsito(settings),
  };
}

/** Le credenziali per Graph, o `null` se ne manca anche una sola. */
export function credenzialiGraph(c: ConfigBounce): CredenzialiGraph | null {
  if (!c.tenantId || !c.clientId || !c.clientSecret || !c.casella) return null;
  return { tenantId: c.tenantId, clientId: c.clientId, clientSecret: c.clientSecret, casella: c.casella };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Il tenant si può indicare anche col dominio (`cbbg.onmicrosoft.com`).
const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export const patchConfigBounceSchema = z
  .object({
    enabled: z.boolean(),
    tenantId: z
      .string()
      .trim()
      .refine((v) => v === "" || GUID.test(v) || DOMINIO.test(v), "Tenant ID: un GUID o un dominio"),
    clientId: z
      .string()
      .trim()
      .refine((v) => v === "" || GUID.test(v), "Client ID: deve essere un GUID (Application (client) ID)"),
    // Un GUID qui è quasi sempre il «Secret ID» copiato al posto del «Value»:
    // Microsoft non genera mai un valore con quella forma. Meglio fermarlo ora
    // che scoprirlo dal primo token rifiutato.
    clientSecret: z
      .string()
      .trim()
      .refine(
        (v) => !GUID.test(v),
        "Hai incollato il «Secret ID»: serve la colonna «Value» del client secret",
      ),
    casella: z.union([z.literal(""), z.string().trim().email("Casella: non è un indirizzo email valido")]),
    secretScadenza: z.union([
      z.literal(""),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Scadenza del secret: data non valida")
        .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Scadenza del secret: data non valida"),
    ]),
    riepilogo: z.boolean(),
    destinatari: z.string(),
  })
  .partial()
  .strict();

export type PatchConfigBounce = z.infer<typeof patchConfigBounceSchema>;

export class ErroreConfigBounce extends Error {}

export async function salvaConfigBounce(
  archivio: ArchivioImpostazioni,
  patch: PatchConfigBounce,
): Promise<VistaConfigBounce> {
  const scritte: Record<string, string> = {};
  if (patch.enabled !== undefined) scritte[CHIAVI_BOUNCE.enabled] = patch.enabled ? "true" : "false";
  if (patch.tenantId !== undefined) scritte[CHIAVI_BOUNCE.tenantId] = patch.tenantId.trim();
  if (patch.clientId !== undefined) scritte[CHIAVI_BOUNCE.clientId] = patch.clientId.trim();
  // Vuoto = tieni quello salvato: la scheda non lo può rimostrare.
  if (patch.clientSecret !== undefined && patch.clientSecret.trim() !== "") {
    scritte[CHIAVI_BOUNCE.clientSecret] = patch.clientSecret.trim();
  }
  if (patch.casella !== undefined) scritte[CHIAVI_BOUNCE.casella] = patch.casella.trim().toLowerCase();
  if (patch.secretScadenza !== undefined) scritte[CHIAVI_BOUNCE.secretScadenza] = patch.secretScadenza;
  if (patch.riepilogo !== undefined) scritte[CHIAVI_BOUNCE.riepilogo] = patch.riepilogo ? "true" : "false";
  if (patch.destinatari !== undefined) {
    // Come per gli avvisi del sync: un refuso non deve spegnere il riepilogo
    // in silenzio, si rifiuta il salvataggio intero.
    const { validi, invalidi } = validaDestinatari(separaDestinatari(patch.destinatari));
    if (invalidi.length > 0) throw new ErroreConfigBounce(`Indirizzi non validi: ${invalidi.join(", ")}`);
    scritte[CHIAVI_BOUNCE.destinatari] = validi.join(", ");
  }

  const settings = await archivio.getAllSettings();
  const finale = leggiConfigBounce({ ...settings, ...scritte });
  if (finale.riepilogo && finale.destinatari.length === 0) {
    throw new ErroreConfigBounce("Per attivare il riepilogo serve almeno un destinatario.");
  }
  if (finale.enabled && !credenzialiGraph(finale)) {
    throw new ErroreConfigBounce(
      "Per attivare la lettura servono Tenant ID, Client ID, client secret e casella.",
    );
  }

  for (const [chiave, valore] of Object.entries(scritte)) {
    await archivio.setSetting(chiave, valore);
  }
  return vistaConfigBounce({ ...settings, ...scritte });
}
