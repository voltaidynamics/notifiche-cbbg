import { describe, it, expect } from "vitest";
import { storicoEsempio, dettaglioEsempio } from "../../client/src/lib/sample-storico";

describe("dati di esempio dello Storico", () => {
  it("senza filtri mostra tutte le righe", () => {
    expect(storicoEsempio({}).length).toBeGreaterThan(0);
  });

  it("il filtro utente restringe le righe", () => {
    const tutte = storicoEsempio({});
    const utente = tutte[0].utente!;
    const filtrate = storicoEsempio({ utente });
    expect(filtrate.length).toBeGreaterThan(0);
    expect(filtrate.length).toBeLessThanOrEqual(tutte.length);
    expect(filtrate.every((r) => r.utente === utente)).toBe(true);
  });

  it("il filtro roggia trova per codice e per descrizione", () => {
    const conCodice = storicoEsempio({ roggia: "S45DA0021" });
    const conDescrizione = storicoEsempio({ roggia: "Serio" });
    expect(conCodice.length).toBeGreaterThan(0);
    expect(conDescrizione.map((r) => r.id)).toEqual(conCodice.map((r) => r.id));
  });

  it("il filtro destinatario trova per codice conduttore e per descrizione", () => {
    expect(storicoEsempio({ destinatario: "S45DA1G21" }).length).toBeGreaterThan(0);
    expect(storicoEsempio({ destinatario: "Sereni" }).length).toBeGreaterThan(0);
  });

  it("i filtri tipo e classificazione restringono le righe", () => {
    const aperture = storicoEsempio({ tipo: "apertura" });
    expect(aperture.length).toBeGreaterThan(0);
    expect(aperture.every((r) => r.tipo === "apertura")).toBe(true);

    const inquinamento = storicoEsempio({ classificazione: "inquinamento" });
    expect(inquinamento.length).toBeGreaterThan(0);
    expect(inquinamento.every((r) => r.classificazione === "inquinamento")).toBe(true);
  });

  it("un filtro senza corrispondenze restituisce zero righe, non tutte", () => {
    expect(storicoEsempio({ roggia: "XX000ZZZZ" })).toHaveLength(0);
  });

  it("l'esempio usa solo i valori nuovi dei due assi", () => {
    for (const r of storicoEsempio({})) {
      expect(["apertura", "chiusura", "altro"]).toContain(r.tipo);
      expect(["ordinaria", "straordinaria", "inquinamento"]).toContain(r.classificazione);
    }
  });

  it("il dettaglio porta messaggio e destinatari", () => {
    const riga = storicoEsempio({})[0];
    const d = dettaglioEsempio(riga.id)!;
    expect(d.messaggio.length).toBeGreaterThan(0);
    expect(d.destinatari.length).toBe(riga.numDestinatari);
  });

  it("un id inesistente non ha dettaglio", () => {
    expect(dettaglioEsempio(1)).toBeUndefined();
  });
});
