// Il token del pixel che segnala l'apertura di una mail.
//
// Nasce dall'invio sull'anagrafica vera (issue #23). Un conduttore del mirror ha
// per chiave `conduttori.keykey`, che è testo, mentre `notification_recipients.userId`
// è un intero con FK sui `consorziati` legacy: sul percorso nuovo quella colonna
// resta null, e il token storico `notificationId-userId` non identificherebbe
// più nessuno.
//
// Peggio: non identificherebbe *il destinatario sbagliato in silenzio*. Il
// parser vecchio, davanti all'id di una riga destinatario, cercherebbe un
// `userId` con lo stesso numero e potrebbe marcare come aperta la mail di
// qualcun altro. Per questo il formato nuovo porta un prefisso — `12-d34` — e i
// due si distinguono a colpo d'occhio invece che per fortuna.

/** Riferimento estratto da un token di tracking. */
export type RiferimentoTracking =
  /** Formato nuovo: la riga destinatario per id. */
  | { notificationId: number; recipientId: number }
  /** Formato storico: il conduttore legacy per id. */
  | { notificationId: number; userId: number };

/** Il token da mettere nel pixel di una riga destinatario. */
export function tokenDestinatario(notificationId: number, recipientId: number): string {
  return `${notificationId}-d${recipientId}`;
}

const intero = (s: string): number | null => {
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * Rilegge un token di tracking, nei due formati.
 *
 * Ritorna `null` su tutto ciò che non è leggibile: il pixel non deve mai
 * decidere "a naso" quale destinatario aggiornare.
 */
export function leggiTokenTracking(token: string | undefined | null): RiferimentoTracking | null {
  if (typeof token !== "string") return null;
  const parti = token.split("-");
  if (parti.length !== 2) return null;

  const notificationId = intero(parti[0]);
  if (notificationId === null) return null;

  const secondo = parti[1];
  if (secondo.startsWith("d")) {
    const recipientId = intero(secondo.slice(1));
    return recipientId === null ? null : { notificationId, recipientId };
  }

  const userId = intero(secondo);
  return userId === null ? null : { notificationId, userId };
}
