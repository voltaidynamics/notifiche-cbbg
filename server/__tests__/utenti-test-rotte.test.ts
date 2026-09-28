// La validazione di un utente di test (issue #36).
//
// Express non e' testabile in questo repository: si prova la funzione pura che
// la rotta chiama, che e' dove stanno tutte le decisioni.

import { describe, it, expect } from "vitest";
import { validaUtenteTest } from "../utentiTestRoutes";

const buono = {
  nome: "Francesco",
  email: "collaudo@consorzio.it",
  tipoEmail: "normale",
  telefono: "3311234567",
  attivo: true,
};

describe("validaUtenteTest", () => {
  it("accetta una riga completa e ripulisce gli spazi", () => {
    const esito = validaUtenteTest({ ...buono, nome: "  Francesco  ", email: " collaudo@consorzio.it " });
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.dati.nome).toBe("Francesco");
    expect(esito.dati.email).toBe("collaudo@consorzio.it");
  });

  it("rifiuta chi non ha nome", () => {
    expect(validaUtenteTest({ ...buono, nome: "   " })).toEqual({ ok: false, errore: "Nome mancante" });
  });

  it("rifiuta chi non ha nessun recapito", () => {
    expect(validaUtenteTest({ ...buono, email: "", telefono: "" })).toEqual({
      ok: false,
      errore: "Serve almeno un recapito: email o telefono",
    });
  });

  // Un tipo email sconosciuto non deve diventare "normale" di nascosto: una PEC
  // spedita da una casella ordinaria non ha valore legale, ed e' esattamente
  // quello che il collaudo deve verificare.
  it("rifiuta un tipo email che non esiste", () => {
    expect(validaUtenteTest({ ...buono, tipoEmail: "raccomandata" })).toEqual({
      ok: false,
      errore: "Tipo email non valido: attesi Email o PEC",
    });
  });

  it("tratta un recapito vuoto come assente, non come stringa vuota", () => {
    const esito = validaUtenteTest({ ...buono, telefono: "  " });
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.dati.telefono).toBeNull();
  });

  // Chi non lo manda resta attivo: e' il caso normale, si censisce un utente
  // per usarlo.
  it("un utente nuovo nasce attivo se non si dice altro", () => {
    const esito = validaUtenteTest({ nome: "Nicolas", email: "n@c.it", tipoEmail: "pec" });
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.dati.attivo).toBe(true);
    expect(esito.dati.tipoEmail).toBe("pec");
  });
});
