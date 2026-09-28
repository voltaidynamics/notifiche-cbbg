import { cn } from "@/lib/utils";
import { canaleDi, COLORE_CANALE_PEC, ETICHETTE_CANALE, haIndirizzo, type CanaleEmail } from "@shared/canale-email";
import { haNumero } from "@shared/destinatari";

/**
 * Da quale delle due caselle passa (o è passata) una comunicazione.
 *
 * Lo stesso badge in due punti: nel dettaglio dello Storico, dove racconta un
 * invio già avvenuto, e nella tabella dei conduttori di «Invia notifica», dove
 * anticipa quello che succederà. Due rendering separati sarebbero due palette
 * che prima o poi divergono, proprio sul dato che l'operatore controlla per
 * capire se una comunicazione avrà valore legale.
 *
 * `null` significa «non si sa»: le notifiche precedenti ai due canali non hanno
 * registrato il canale, e un conduttore senza indirizzo non ne userà nessuno.
 * In entrambi i casi si mostra un trattino, non si indovina "Email".
 */
export function BadgeCanale({ canale }: { canale: CanaleEmail | null }) {
  if (canale === null) return <span className="text-gray-400">—</span>;
  if (canale === "pec") {
    return (
      <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium", COLORE_CANALE_PEC)}>
        {ETICHETTE_CANALE.pec}
      </span>
    );
  }
  // La posta ordinaria è il caso normale: testo, non badge, come le tratte
  // aperte in «Invia notifica».
  return <span className="text-xs text-gray-600">{ETICHETTE_CANALE.normale}</span>;
}

// Azzurro per l'SMS: il terzo colore accanto al viola della PEC e al testo
// grigio della posta ordinaria, così i tre canali restano distinguibili a
// colpo d'occhio nella stessa cella.
const COLORE_CANALE_SMS = "bg-sky-100 text-sky-700";

/**
 * Se questa comunicazione raggiungerà il contatto anche via SMS.
 *
 * Sta accanto al canale di posta, non al posto suo: i due canali non si
 * escludono, e un conduttore con indirizzo e numero è raggiunto da entrambi.
 * Compare solo quando un numero c'è davvero — è il senso di «disponibile».
 *
 * `attivo` è la spunta «Invia anche via SMS», che è spenta di default: acceso
 * il badge dice «parte», spento dice «si potrebbe». Mostrarlo sempre uguale
 * prometterebbe un SMS che non parte, mostrarlo solo da acceso nasconderebbe
 * proprio il dato che serve per decidere se accendere la spunta.
 */
export function BadgeSms({ attivo }: { attivo: boolean }) {
  if (attivo) {
    return (
      <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium", COLORE_CANALE_SMS)}>
        SMS
      </span>
    );
  }
  return (
    <span
      className="text-xs rounded px-1.5 py-0.5 border border-gray-300 text-gray-400"
      title="Ha un numero: spunta «Invia anche via SMS» per usarlo"
    >
      SMS
    </span>
  );
}

/**
 * Tutti i canali su cui questa comunicazione raggiunge un contatto.
 *
 * Un conduttore non ha *un* canale: ha una casella (ordinaria o certificata) e,
 * spesso, anche un numero. Finché la colonna mostrava la sola posta, di chi
 * aveva il solo numero diceva «—» — cioè «non lo raggiungi», mentre l'SMS
 * partiva davvero.
 *
 * Il trattino resta, ma solo quando non resta nessun canale: accanto al badge
 * SMS direbbe «niente» e «SMS» nella stessa cella.
 */
export function BadgeCanaliContatto({
  email,
  tipoEmail,
  cellulare,
  smsAttivo,
}: {
  email: string | null | undefined;
  tipoEmail: string | null | undefined;
  cellulare: string | null | undefined;
  smsAttivo: boolean;
}) {
  const canale = haIndirizzo(email) ? canaleDi(tipoEmail) : null;
  const sms = haNumero(cellulare);
  return (
    <span className="inline-flex items-center gap-1.5">
      {(canale !== null || !sms) && <BadgeCanale canale={canale} />}
      {sms && <BadgeSms attivo={smsAttivo} />}
    </span>
  );
}
