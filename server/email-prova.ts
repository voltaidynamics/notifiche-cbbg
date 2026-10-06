/**
 * Mail di prova dalla pagina Impostazioni.
 *
 * «Test Connessione» chiama `transporter.verify()`: prova login e handshake, e
 * basta. Un server che accetta le credenziali può comunque rifiutare il
 * messaggio (mittente non autorizzato, relay negato, quota esaurita), e un
 * messaggio accettato può finire nello spam o non arrivare. L'unica prova che
 * «funziona davvero» è una mail vera, letta da chi l'ha chiesta.
 *
 * Usa la configurazione **salvata**, non quella nel form: è quella con cui
 * partono le comunicazioni ai conduttori, ed è lei che va collaudata.
 */
import { z } from "zod";
import { createTransporter } from "./email";
import { emailConfigurata, getConfigCanale, mittenteDi, type ConfigEmail } from "./config-notifiche";
import { CANALI_EMAIL, ETICHETTE_CANALE, type CanaleEmail } from "@shared/canale-email";

export const richiestaEmailProvaSchema = z.object({
  canale: z.enum(CANALI_EMAIL),
  destinatario: z.string().trim().email("Indirizzo email non valido"),
});

type Trasporto = { sendMail(msg: Record<string, unknown>): Promise<unknown> };

export type EsitoEmailProva =
  | { inviata: true; destinatario: string; mittente: string }
  | { inviata: false; motivo: string };

export async function inviaEmailProva(
  canale: CanaleEmail,
  destinatario: string,
  deps: { config?: ConfigEmail; trasporto?: Trasporto; adesso?: Date } = {},
): Promise<EsitoEmailProva> {
  const config = deps.config ?? getConfigCanale(canale);
  const etichetta = ETICHETTE_CANALE[canale];
  if (!emailConfigurata(config)) {
    return {
      inviata: false,
      motivo: `Configurazione ${etichetta} non salvata: inserisci e salva le credenziali prima della prova.`,
    };
  }

  const mittente = mittenteDi(config);
  const quando = (deps.adesso ?? new Date()).toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  try {
    const trasporto = deps.trasporto ?? (createTransporter(config) as Trasporto);
    await trasporto.sendMail({
      from: mittente,
      to: destinatario,
      subject: `Mail di prova — Notifiche Impianti (${etichetta})`,
      text:
        `Questa è una mail di prova inviata dalla pagina Impostazioni di Notifiche Impianti.\n\n` +
        `Canale: ${etichetta}\nMittente: ${mittente}\nInviata il: ${quando}\n\n` +
        `Se la stai leggendo, le credenziali salvate funzionano.`,
    });
    return { inviata: true, destinatario, mittente };
  } catch (e) {
    return { inviata: false, motivo: (e as Error).message || "Invio fallito" };
  }
}
