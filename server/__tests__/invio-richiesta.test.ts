// Le regole della richiesta di invio interattivo e il token del pixel (issue #23).

import { describe, it, expect } from "vitest";
import { validaRichiestaInvio, mancanoDestinatari, spuntaSms } from "@shared/invio-notifica";
import { tokenDestinatario, leggiTokenTracking } from "../tracking-token";

const buona = {
  tratte: ["S45D00001"],
  destinatari: ["1001"],
  titolo: "CBBG - Chiusura Roggia Comuna",
  messaggio: "Si comunica la chiusura della tratta.",
  tipo: "chiusura",
  classificazione: "ordinaria",
  legame: "live",
};

describe("validaRichiestaInvio", () => {
  it("accetta una richiesta completa e restituisce i valori ripuliti", () => {
    const esito = validaRichiestaInvio({ ...buona, titolo: "  Titolo  " });
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.richiesta.titolo).toBe("Titolo");
    expect(esito.richiesta.tipo).toBe("chiusura");
    expect(esito.richiesta.classificazione).toBe("ordinaria");
  });

  it("toglie doppioni e spazi dai codici", () => {
    const esito = validaRichiestaInvio({
      ...buona,
      tratte: [" S45D00001 ", "S45D00001", "S45D00002", "", 7 as unknown as string],
      destinatari: ["1001", "1001"],
    });
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.richiesta.tratte).toEqual(["S45D00001", "S45D00002"]);
    expect(esito.richiesta.destinatari).toEqual(["1001"]);
  });

  // Il titolo è l'oggetto della mail (issue #23): senza, il consorzio spedirebbe
  // una comunicazione senza oggetto — la prima cosa che i client di posta
  // segnalano come sospetta.
  it("rifiuta il titolo mancante o fatto di soli spazi", () => {
    for (const titolo of ["", "   ", undefined]) {
      const esito = validaRichiestaInvio({ ...buona, titolo });
      expect(esito.ok).toBe(false);
      if (esito.ok) return;
      expect(esito.errore).toContain("Titolo");
    }
  });

  it("rifiuta il messaggio mancante", () => {
    const esito = validaRichiestaInvio({ ...buona, messaggio: "  " });
    expect(esito).toEqual({ ok: false, errore: "Messaggio mancante" });
  });

  // Issue #28: il testo SMS è un campo a sé, e oggi nessun SMS parte —
  // pretenderlo fermerebbe comunicazioni legittime per un campo che nessuno
  // consuma ancora.
  describe("testo SMS (issue #28)", () => {
    it("accetta una richiesta senza testo SMS e lo restituisce vuoto", () => {
      const esito = validaRichiestaInvio(buona);
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.messaggioSms).toBe("");
    });

    it("tiene il testo SMS ripulito dagli spazi", () => {
      const esito = validaRichiestaInvio({ ...buona, messaggioSms: "  Roggia chiusa dal 20/08.  " });
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.messaggioSms).toBe("Roggia chiusa dal 20/08.");
    });

    it("non confonde il testo SMS con quello della mail", () => {
      const esito = validaRichiestaInvio({ ...buona, messaggioSms: "Versione corta" });
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.messaggio).toBe("Si comunica la chiusura della tratta.");
      expect(esito.richiesta.messaggioSms).toBe("Versione corta");
    });

    // Il testo mail resta obbligatorio: il solo SMS non manda niente a nessuno.
    it("rifiuta comunque una richiesta col solo testo SMS", () => {
      const esito = validaRichiestaInvio({ ...buona, messaggio: "", messaggioSms: "Versione corta" });
      expect(esito).toEqual({ ok: false, errore: "Messaggio mancante" });
    });
  });

  // L'interruttore dell'invio SMS: acceso, il testo diventa obbligatorio —
  // spedire un SMS vuoto costa quanto spedirne uno pieno.
  describe("invio SMS", () => {
    it("resta spento se la richiesta non lo nomina", () => {
      const esito = validaRichiestaInvio(buona);
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.inviaSms).toBe(false);
    });

    it("accetta l'invio SMS quando c'è anche il testo", () => {
      const esito = validaRichiestaInvio({ ...buona, inviaSms: true, messaggioSms: "Roggia chiusa." });
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.inviaSms).toBe(true);
      expect(esito.richiesta.messaggioSms).toBe("Roggia chiusa.");
    });

    it("rifiuta l'invio SMS senza testo SMS", () => {
      expect(validaRichiestaInvio({ ...buona, inviaSms: true })).toEqual({
        ok: false,
        errore: "Testo SMS mancante",
      });
      expect(validaRichiestaInvio({ ...buona, inviaSms: true, messaggioSms: "   " })).toEqual({
        ok: false,
        errore: "Testo SMS mancante",
      });
    });
  });

  it("rifiuta un invio senza niente di selezionato", () => {
    expect(validaRichiestaInvio({ ...buona, tratte: [] })).toEqual({
      ok: false,
      errore: "Nessuna tratta selezionata",
    });
  });

  // I destinatari possono essere zero: e' l'invio ai soli utenti di test
  // (issue #36). Chi decide e' `preparaInvio`, che gli utenti di test li vede;
  // la validazione della richiesta non li conosce e non puo' decidere.
  it("accetta zero destinatari: sono gli invii ai soli utenti di test", () => {
    const esito = validaRichiestaInvio({ ...buona, destinatari: [] });
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.richiesta.destinatari).toEqual([]);
  });

  // I pozzi si scelgono per madre e non per tratta (issue #26): la loro
  // selezione arriva qui con `tratte` vuoto e `madri` pieno, e deve passare.
  describe("selezione per madre", () => {
    it("accetta un invio con le sole madri", () => {
      const esito = validaRichiestaInvio({ ...buona, tratte: [], madri: ["R10", "R11"] });
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.madri).toEqual(["R10", "R11"]);
      expect(esito.richiesta.tratte).toEqual([]);
    });

    it("ripulisce le madri come le tratte, senza doppioni né spazi", () => {
      const esito = validaRichiestaInvio({
        ...buona,
        tratte: [],
        madri: [" R10 ", "R10", "", 7 as unknown as string, "R11"],
      });
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.madri).toEqual(["R10", "R11"]);
    });

    it("una richiesta senza madri resta valida, con l'elenco vuoto", () => {
      const esito = validaRichiestaInvio(buona);
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.richiesta.madri).toEqual([]);
    });
  });

  // I due assi restano obbligatori come dalla issue #13: la validazione della
  // richiesta non è un'occasione per riaprire una scorciatoia.
  it("rifiuta tipo e classificazione mancanti, con i messaggi di sempre", () => {
    const senzaTipo = validaRichiestaInvio({ ...buona, tipo: "" });
    expect(senzaTipo.ok).toBe(false);
    if (senzaTipo.ok) return;
    expect(senzaTipo.errore).toContain("Tipo");

    const senzaClassificazione = validaRichiestaInvio({ ...buona, classificazione: "urgente" });
    expect(senzaClassificazione.ok).toBe(false);
    if (senzaClassificazione.ok) return;
    expect(senzaClassificazione.errore).toContain("Classificazione");
  });

  // Il titolo si controlla prima dei codici: chi scrive la comunicazione deve
  // sapere che manca l'oggetto, non che manca una tratta che ha già scelto.
  it("segnala il titolo prima delle selezioni", () => {
    const esito = validaRichiestaInvio({ ...buona, titolo: "", tratte: [], destinatari: [] });
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toContain("Titolo");
  });

  it("rifiuta una richiesta senza legame", () => {
    const { legame, ...senza } = buona;
    const esito = validaRichiestaInvio(senza);
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toMatch(/legame/i);
  });

  it("rifiuta un legame fuori elenco", () => {
    // "stagione irrigua" è l'etichetta, non il codice: se passasse, in colonna
    // finirebbe una parola che nessuna query del mirror riconosce.
    for (const v of ["stagione irrigua", "LIVE", "boh", 3, null]) {
      expect(validaRichiestaInvio({ ...buona, legame: v }).ok).toBe(false);
    }
  });

  it("porta il legame nella richiesta validata", () => {
    const esito = validaRichiestaInvio({ ...buona, legame: "stagione" });
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.richiesta.legame).toBe("stagione");
  });

  describe("mancanoDestinatari", () => {
    it("nessun conduttore e nessun utente di test attivo: non si parte", () => {
      expect(mancanoDestinatari({ conduttori: 0, utentiTestAttivi: 0 })).toBe(true);
    });

    it("nessun conduttore ma un utente di test attivo: si parte", () => {
      expect(mancanoDestinatari({ conduttori: 0, utentiTestAttivi: 1 })).toBe(false);
    });

    it("conduttori scelti: si parte comunque", () => {
      expect(mancanoDestinatari({ conduttori: 3, utentiTestAttivi: 0 })).toBe(false);
    });
  });

  // Issue #117: la mail parte con l'SMS di default, ma solo se l'SMS può partire.
  describe("spuntaSms", () => {
    it("SMS configurati e nessuna scelta dell'operatore: accesa", () => {
      expect(spuntaSms(true, null)).toEqual({ accesa: true, disponibile: true });
    });

    it("l'operatore che la spegne la tiene spenta", () => {
      expect(spuntaSms(true, false)).toEqual({ accesa: false, disponibile: true });
    });

    // Accesa senza credenziali, il server rifiuterebbe l'invio per intero:
    // nessuno riuscirebbe più a spedire nemmeno la mail.
    it("SMS non configurati: spenta e non selezionabile, qualunque scelta", () => {
      expect(spuntaSms(false, null)).toEqual({ accesa: false, disponibile: false });
      expect(spuntaSms(false, true)).toEqual({ accesa: false, disponibile: false });
    });

    it("finché la configurazione non è arrivata: spenta", () => {
      expect(spuntaSms(undefined, null)).toEqual({ accesa: false, disponibile: false });
    });
  });
});

describe("token del pixel di tracking", () => {
  it("va e torna sul formato nuovo", () => {
    expect(tokenDestinatario(12, 34)).toBe("12-d34");
    expect(leggiTokenTracking("12-d34")).toEqual({ notificationId: 12, recipientId: 34 });
  });

  it("continua a leggere i token storici, che portano lo userId", () => {
    expect(leggiTokenTracking("12-34")).toEqual({ notificationId: 12, userId: 34 });
  });

  // Il prefisso esiste per questo: senza, l'id di una riga destinatario verrebbe
  // letto come uno userId, e il pixel marcherebbe come aperta la mail di un
  // altro conduttore.
  it("non confonde i due formati", () => {
    expect(leggiTokenTracking("12-d34")).not.toHaveProperty("userId");
    expect(leggiTokenTracking("12-34")).not.toHaveProperty("recipientId");
  });

  it("rifiuta ciò che non sa leggere invece di tirare a indovinare", () => {
    for (const token of ["", "12", "12-", "-34", "12-d", "a-b", "12-34-56", "12-d3x", undefined, null]) {
      expect(leggiTokenTracking(token)).toBeNull();
    }
  });
});
