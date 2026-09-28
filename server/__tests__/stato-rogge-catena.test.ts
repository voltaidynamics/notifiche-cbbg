import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import { preparaInvio, type ArchivioInvio } from "../invio-notifica";
import { componiRispostaStato, risolviStato } from "@shared/stato-rogge";
import type { ConfigEmail } from "../config-notifiche";

/**
 * La prova d'insieme dei task 1-4 della issue #22 (stato delle rogge).
 *
 * Collega tutti i pezzi con un `MemStorage` vero: `preparaInvio` (che scrive
 * `notification_targets`, task 3) → `getEventiStato()` (l'unica lettura, task
 * 2) → `componiRispostaStato()` (la regola pura di `shared/stato-rogge.ts`,
 * task 1) → `risolviStato()`, la stessa funzione che legge la rotta
 * `GET /api/consorzio/stato-rogge` (task 4). Nessuna mail parte davvero — il
 * trasporto è finto — e nessuna riga tocca il database di produzione: questa
 * macchina *è* la produzione, e la prova end-to-end sull'app viva prevista dal
 * piano (invio reale dalla pagina + controllo della Dashboard) non si può fare
 * qui senza spedire posta vera a conduttori veri.
 */

const CONFIG_OK: ConfigEmail = {
  service: "gmail",
  user: "consorzio@example.it",
  password: "segreta",
  smtpHost: null,
  smtpPort: null,
  smtpSecure: false,
};

function trasportoFinto() {
  return { sendMail: async () => ({ messageId: "id-mail" }) };
}

describe("stato delle rogge: la catena preparaInvio → getEventiStato → componiRispostaStato", () => {
  let s: MemStorage;

  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro({
      madri: [{ codice: "R01", name: "R01 - Roggia bolgare", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" }],
      tratte: [{ keyroggia: "R01D01000", name: "Bolgare capofonte", codiceMadre: "R01" }],
      legami: [{ keykey: "1", keyroggia: "R01D01000", metodo: "live" }],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Mario Rossi", email: "mario@e.it", cellulare: "3311234567", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);
  });

  const invia = (tipo: "chiusura" | "apertura") =>
    preparaInvio(
      {
        tratte: ["R01D01000"],
        madri: [],
        destinatari: ["1"],
        titolo: `Titolo ${tipo}`,
        messaggio: `Messaggio di ${tipo}`,
        tipo,
        classificazione: "ordinaria",
        legame: "live",
      },
      {},
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_OK },
        creaTrasporto: () => trasportoFinto(),
      },
    );

  it("dopo una chiusura il codice risulta chiuso, e dopo l'apertura torna aperto", async () => {
    const chiusura = await invia("chiusura");
    if (!chiusura.ok) throw new Error(chiusura.errore);

    // La mappa keyroggia -> madre e' quella del registro (task 5): la stessa
    // che leggerebbe la rotta vera.
    const mappaMadri = await s.getMappaMadri();

    // La stessa lettura della rotta: getEventiStato() legge notification_targets,
    // componiRispostaStato() applica la regola pura del task 1.
    const eventiDopoChiusura = await s.getEventiStato();
    const rispostaDopoChiusura = componiRispostaStato(eventiDopoChiusura, new Date(0), mappaMadri);
    const statoDopoChiusura = risolviStato("R01D01000", "tratta", rispostaDopoChiusura.stati, mappaMadri["R01D01000"] ?? null);

    expect(statoDopoChiusura.stato).toBe("chiusa");
    expect(statoDopoChiusura.notificaId).toBe(chiusura.preparato.notificationId);
    expect(rispostaDopoChiusura.chiusure).toHaveLength(1);

    const apertura = await invia("apertura");
    if (!apertura.ok) throw new Error(apertura.errore);

    const eventiDopoApertura = await s.getEventiStato();
    const rispostaDopoApertura = componiRispostaStato(eventiDopoApertura, new Date(0), mappaMadri);
    const statoDopoApertura = risolviStato("R01D01000", "tratta", rispostaDopoApertura.stati, mappaMadri["R01D01000"] ?? null);

    expect(statoDopoApertura.stato).toBe("aperta");
    expect(statoDopoApertura.chiusaDal).toBeNull();
  });
});
