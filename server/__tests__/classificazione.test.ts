import { describe, it, expect } from "vitest";
import {
  TIPI_NOTIFICA,
  TIPI_TEMPLATE,
  ETICHETTE_TIPO,
  COLORI_TIPO,
  isTipoTemplate,
  validaClassificazioneInvio,
} from "@shared/classificazione";
import { notifications, insertNotificationSchema } from "@shared/schema";

describe("tipi di notifica e di template", () => {
  it("i tre valori sono apertura, chiusura e altro", () => {
    expect([...TIPI_NOTIFICA]).toEqual(["apertura", "chiusura", "altro"]);
    expect([...TIPI_TEMPLATE]).toEqual(["apertura", "chiusura", "altro"]);
  });

  it("ogni tipo ha etichetta e colore, e i colori sono quelli chiesti nella issue", () => {
    for (const t of TIPI_TEMPLATE) {
      expect(ETICHETTE_TIPO[t]).toBeTruthy();
      expect(COLORI_TIPO[t]).toBeTruthy();
    }
    expect(COLORI_TIPO.apertura).toContain("green");
    expect(COLORI_TIPO.chiusura).toContain("red");
    expect(COLORI_TIPO.altro).toContain("gray");
  });

  it("isTipoTemplate respinge i vecchi tipi evento", () => {
    expect(isTipoTemplate("apertura")).toBe(true);
    expect(isTipoTemplate("manutenzione")).toBe(false);
    expect(isTipoTemplate("")).toBe(false);
  });
});

describe("colonne di classificazione su notifications", () => {
  it("la tabella ha una colonna classificazione", () => {
    expect(notifications.classificazione).toBeDefined();
  });

  it("la colonna event_type non esiste più: una notifica ha tre tipi, non cinque", () => {
    // Issue #18: `event_type` ammetteva chiusura, manutenzione, riduzione
    // portata, apertura e straordinario, e governava i canali per tipologia.
    // La colonna, la tabella di configurazione e l'API che la usava sono state
    // rimosse: quello che una comunicazione è lo dicono `tipo` e
    // `classificazione`.
    expect((notifications as Record<string, unknown>).eventType).toBeUndefined();
  });

  it("i default sono i ripieghi della colonna, non valori sensati per l'operatore", () => {
    const parsed = insertNotificationSchema.parse({
      subject: "Oggetto",
      message: "Testo",
    });
    expect(parsed.tipo).toBe("altro");
    expect(parsed.classificazione).toBe("ordinaria");
  });

  it("un tipo fuori elenco viene rifiutato", () => {
    expect(() =>
      insertNotificationSchema.parse({
        subject: "O", message: "T", tipo: "programmata",
      }),
    ).toThrow();
  });

  it("una classificazione fuori elenco viene rifiutata", () => {
    expect(() =>
      insertNotificationSchema.parse({
        subject: "O", message: "T", classificazione: "urgente",
      }),
    ).toThrow();
  });
});

describe("validaClassificazioneInvio", () => {
  it("accetta una coppia valida", () => {
    const esito = validaClassificazioneInvio({ tipo: "chiusura", classificazione: "inquinamento" });
    expect(esito).toEqual({ ok: true, tipo: "chiusura", classificazione: "inquinamento" });
  });

  it("rifiuta il tipo mancante e lo dice in italiano", () => {
    const esito = validaClassificazioneInvio({ classificazione: "ordinaria" });
    expect(esito.ok).toBe(false);
    expect(esito.ok === false && esito.errore).toContain("Tipo");
  });

  it("rifiuta la classificazione mancante", () => {
    const esito = validaClassificazioneInvio({ tipo: "apertura" });
    expect(esito.ok).toBe(false);
    expect(esito.ok === false && esito.errore).toContain("Classificazione");
  });

  it("rifiuta i vecchi valori del primo giro", () => {
    expect(validaClassificazioneInvio({ tipo: "programmata", classificazione: "ordinaria" }).ok).toBe(false);
    expect(validaClassificazioneInvio({ tipo: "apertura", classificazione: "urgente" }).ok).toBe(false);
  });

  it("non si fa ingannare da un valore non stringa", () => {
    expect(validaClassificazioneInvio({ tipo: 3, classificazione: null }).ok).toBe(false);
  });

  it("accetta 'altro' come tipo: è uno dei tre, non un ripiego", () => {
    expect(validaClassificazioneInvio({ tipo: "altro", classificazione: "ordinaria" }).ok).toBe(true);
  });

  it("il messaggio del tipo mancante elenca tutti e tre i valori ammessi", () => {
    // Altro è selezionabile dall'operatore (issue #13): un messaggio che ne
    // cita due su tre fa credere che il terzo sia rifiutato.
    const esito = validaClassificazioneInvio({ classificazione: "ordinaria" });
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toContain("Apertura");
    expect(esito.errore).toContain("Chiusura");
    expect(esito.errore).toContain("Altro");
  });
});
