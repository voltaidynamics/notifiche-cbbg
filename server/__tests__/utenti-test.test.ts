// Un utente di test senza recapiti non riceve niente da nessun canale: sarebbe
// una riga che promette un collaudo che non avviene.

import { describe, it, expect } from "vitest";
import { recapitoMancante, utenteTestRaggiungibile } from "@shared/utenti-test";

describe("recapitoMancante", () => {
  it("accetta chi ha solo l'email", () => {
    expect(recapitoMancante({ email: "collaudo@consorzio.it", telefono: null })).toBe(false);
  });

  it("accetta chi ha solo il telefono", () => {
    expect(recapitoMancante({ email: null, telefono: "3311234567" })).toBe(false);
  });

  it("accetta chi ha entrambi", () => {
    expect(recapitoMancante({ email: "collaudo@consorzio.it", telefono: "3311234567" })).toBe(false);
  });

  it("rifiuta chi non ha nessuno dei due", () => {
    expect(recapitoMancante({ email: null, telefono: null })).toBe(true);
    expect(recapitoMancante({})).toBe(true);
  });

  // Uno spazio non è un recapito: il form manda "" e il server riceve " ".
  it("rifiuta i recapiti fatti di soli spazi", () => {
    expect(recapitoMancante({ email: "   ", telefono: "" })).toBe(true);
  });
});

// È il gate su cui si appoggiano sia la pagina di invio sia il server: se
// sbaglia, o parte un invio che non raggiunge nessuno, o l'operatore vede un
// utente di test come raggiungibile quando in realtà l'SMS è spento.
describe("utenteTestRaggiungibile", () => {
  it("raggiunge chi ha solo l'email, con SMS spento", () => {
    expect(utenteTestRaggiungibile({ haEmail: true, haTelefono: false }, false)).toBe(true);
  });

  it("raggiunge chi ha solo l'email, con SMS acceso", () => {
    expect(utenteTestRaggiungibile({ haEmail: true, haTelefono: false }, true)).toBe(true);
  });

  it("raggiunge chi ha solo il telefono soltanto con l'SMS acceso", () => {
    expect(utenteTestRaggiungibile({ haEmail: false, haTelefono: true }, true)).toBe(true);
    expect(utenteTestRaggiungibile({ haEmail: false, haTelefono: true }, false)).toBe(false);
  });

  it("raggiunge chi ha entrambi, con SMS spento o acceso", () => {
    expect(utenteTestRaggiungibile({ haEmail: true, haTelefono: true }, false)).toBe(true);
    expect(utenteTestRaggiungibile({ haEmail: true, haTelefono: true }, true)).toBe(true);
  });

  it("non raggiunge chi non ha nessuno dei due", () => {
    expect(utenteTestRaggiungibile({ haEmail: false, haTelefono: false }, false)).toBe(false);
    expect(utenteTestRaggiungibile({ haEmail: false, haTelefono: false }, true)).toBe(false);
  });
});
