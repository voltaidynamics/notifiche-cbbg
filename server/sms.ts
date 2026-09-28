/**
 * Invio SMS attraverso le API di Register.it (sfera.net).
 *
 * Prima di qui c'era Twilio, mai configurato: nessuna riga `sms.*` in
 * `app_settings` e nessun SMS mai partito. Il consorzio ha già questo
 * fornitore, e lo usa nell'altro suo progetto (Vasche di laminazione).
 *
 * La firma di `sendSMS` è rimasta quella di prima apposta: lo scheduler e
 * `/api/notifications/send` la chiamano già, e il cambio di fornitore non è
 * una buona ragione per rimetterci mano.
 */
import { getConfigSms, smsConfigurata, type ConfigSms } from './config-notifiche';

export interface SMSResult {
  success: boolean;
  /** sfera.net non restituisce un identificativo del messaggio: resta assente. */
  messageId?: string;
  error?: string;
}

// sfera.net non espone HTTPS: le credenziali viaggiano in chiaro. Non è una
// svista da correggere in `https://` — quell'endpoint non esiste. Il rischio è
// mitigato dalla whitelist IP sul pannello del fornitore, richiesta per questo
// server.
const SFERA_BASE_URL = 'http://sms.sfera.net/api';

/**
 * Il numero in formato E.164, che è come l'API lo vuole.
 *
 * Lo zero iniziale non si toglie: in un numero fisso italiano fa parte del
 * numero, e toglierlo ne comporrebbe un altro. Lo "0" con cui il web service
 * del consorzio dice «non ho il numero» è già scartato in lettura da
 * `numeroDestinatario()`, quindi qui non arriva.
 */
export function numeroE164(numero: string): string {
  const pulito = numero.replace(/[\s.\-()]/g, '');
  if (pulito.startsWith('+')) return pulito;
  if (pulito.startsWith('00')) return `+${pulito.slice(2)}`;
  return `+39${pulito}`;
}

/**
 * `config` esplicita serve al test dall'interfaccia, che prova credenziali non
 * ancora salvate senza sporcare la configurazione attiva.
 */
export async function sendSMS(
  to: string,
  message: string,
  config: ConfigSms = getConfigSms(),
): Promise<SMSResult> {
  if (!smsConfigurata(config)) {
    console.log('Credenziali SMS non configurate — messaggio non inviato a:', to);
    return { success: false, error: 'Credenziali SMS non configurate' };
  }

  const params = new URLSearchParams({
    clientid: config.clientid,
    password: config.password,
    smstext: message,
    // `recipent` è il nome del parametro nelle API Register.it, refuso incluso.
    recipent: numeroE164(to),
  });

  try {
    const res = await fetch(`${SFERA_BASE_URL}/sendsms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      return { success: false, error: `Errore HTTP ${res.status} dalla piattaforma SMS` };
    }

    // Un 200 non basta: la piattaforma dice quanti messaggi ha accettato, e
    // zero accettati è un fallimento — credito esaurito, numero rifiutato.
    const data = (await res.json()) as { total_sent?: number; message?: string };
    if (!data.total_sent || data.total_sent < 1) {
      return {
        success: false,
        error: data.message || 'Invio non confermato dalla piattaforma SMS',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Invio SMS fallito:', error);
    return { success: false, error: error?.message || 'Invio SMS fallito' };
  }
}

/**
 * Prova le credenziali interrogando il credito residuo.
 *
 * Non spende un SMS: la versione Twilio ne mandava uno vero al numero
 * mittente ogni volta che si premeva «Test connessione».
 */
export async function testConnessioneSms(
  config: ConfigSms = getConfigSms(),
): Promise<{ success: boolean; error?: string }> {
  if (!smsConfigurata(config)) {
    return { success: false, error: 'Credenziali SMS non configurate' };
  }

  const params = new URLSearchParams({
    clientid: config.clientid,
    password: config.password,
  });

  try {
    const res = await fetch(`${SFERA_BASE_URL}/credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      return { success: false, error: `Errore HTTP ${res.status} dalla piattaforma SMS` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Test SMS fallito' };
  }
}

export function isSMSConfigured(config: ConfigSms = getConfigSms()): boolean {
  return smsConfigurata(config);
}
