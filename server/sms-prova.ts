/**
 * SMS di prova dalla pagina Impostazioni — il gemello di `email-prova.ts`.
 *
 * «Prova credenziali» interroga il credito e non spende un messaggio: dice che
 * la piattaforma riconosce le credenziali e l'IP, non che un SMS arrivi. Questo
 * ne spedisce uno vero, con le credenziali **salvate**, al numero scelto da chi
 * prova — costa un SMS, ed è il prezzo della prova che funziona davvero.
 */
import { z } from "zod";
import { sendSMS, type SMSResult } from "./sms";
import { getConfigSms, smsConfigurata, type ConfigSms } from "./config-notifiche";

// Cifre, con al più un "+" iniziale, una volta tolti spazi, punti, trattini e
// parentesi — gli stessi che `numeroE164()` toglie prima di spedire.
const NUMERO = /^\+?\d{6,15}$/;

export const richiestaSmsProvaSchema = z.object({
  numero: z
    .string()
    .transform((s) => s.replace(/[\s.\-()]/g, ""))
    .refine((s) => NUMERO.test(s), "Numero di telefono non valido"),
});

export type EsitoSmsProva = { inviato: true; numero: string } | { inviato: false; motivo: string };

export async function inviaSmsProva(
  numero: string,
  deps: {
    config?: ConfigSms;
    invia?: (to: string, testo: string, config: ConfigSms) => Promise<SMSResult>;
    adesso?: Date;
  } = {},
): Promise<EsitoSmsProva> {
  const config = deps.config ?? getConfigSms();
  if (!smsConfigurata(config)) {
    return {
      inviato: false,
      motivo: "Credenziali SMS non salvate: inseriscile e salvale prima della prova.",
    };
  }
  const quando = (deps.adesso ?? new Date()).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  const testo = `Notifiche Impianti: SMS di prova inviato il ${quando}. Se lo leggi, le credenziali salvate funzionano.`;
  const esito = await (deps.invia ?? sendSMS)(numero, testo, config);
  if (!esito.success) return { inviato: false, motivo: esito.error || "Invio SMS fallito" };
  return { inviato: true, numero };
}
