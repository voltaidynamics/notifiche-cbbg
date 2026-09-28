import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";

describe("lettura anagrafiche", () => {
  let s: MemStorage;

  beforeEach(async () => {
    s = new MemStorage();
    // "R99D01" ha una madre che non è mai stata caricata nel registro: uno
    // scenario che la FK di `tratte.codice_madre` esclude su PostgreSQL, ma
    // che MemStorage (il ripiego senza DATABASE_URL) non impedisce — vedi il
    // test "una figlia con madre assente..." più sotto.
    await s.replaceRegistro({
      madri: [
        { codice: "R01", name: "Comuna", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" },
      ],
      tratte: [
        { keyroggia: "R01D01", name: "Comuna capofonte", codiceMadre: "R01" },
        { keyroggia: "R99D01", name: "Orfana", codiceMadre: "R99" },
      ],
      legami: [
        { keykey: "1", keyroggia: "R01D01", metodo: "live" },
        { keykey: "1", keyroggia: "R01D01", metodo: "stagione" },
        { keykey: "9", keyroggia: "R01D01", metodo: "live" },
      ],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Mario Rossi", email: "m@e.it", cellulare: "331", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
      { keykey: "2", descrizione: "Cessato Luigi", email: "c@e.it", cellulare: "332", tipoEmail: "normale", flagAttivo: false, dataConsenso: null },
      { keykey: "3", descrizione: "Senza Numero", email: "s@e.it", cellulare: "0", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);
  });

  it("le rogge risolvono la madre di ogni figlia", async () => {
    const righe = await s.getRigheRogge();
    const comuna = righe.find((r) => r.codiceFiglia === "R01D01");
    expect(comuna).toEqual({
      codiceMadre: "R01", descrizioneMadre: "Comuna",
      codiceFiglia: "R01D01", descrizioneFiglia: "Comuna capofonte",
    });
  });

  it("una figlia con madre assente resta visibile con descrizione vuota", async () => {
    const orfana = (await s.getRigheRogge()).find((r) => r.codiceFiglia === "R99D01");
    expect(orfana?.codiceMadre).toBe("R99");
    expect(orfana?.descrizioneMadre).toBe("");
  });

  it("i destinatari espongono codice, descrizione, numero e mail", async () => {
    const riga = (await s.getRigheDestinatari()).find((r) => r.codice === "1");
    expect(riga).toEqual(
      { codice: "1", descrizione: "Mario Rossi", numero: "331", mail: "m@e.it" },
    );
  });

  it("i destinatari non attivi (flag '*' sul WS) restano fuori dall'elenco", async () => {
    const codici = (await s.getRigheDestinatari()).map((r) => r.codice);
    expect(codici).not.toContain("2");
  });

  it("il cellulare '0' del WS si legge come numero assente", async () => {
    // Nel mirror lo "0" resta (copia fedele del consorzio): a sparire è solo
    // qui, dove l'elenco viene letto per essere mostrato.
    const riga = (await s.getRigheDestinatari()).find((r) => r.codice === "3");
    expect(riga?.numero).toBeNull();
  });

  it("i legami sono filtrati per metodo", async () => {
    // Tre legami live nel registro, ma quello del conduttore 9 si scarta.
    expect((await s.getRigheLegami("live")).length).toBe(1);
    expect((await s.getRigheLegami("stagione")).length).toBe(1);
  });

  it("i legami risolvono destinatario e roggia figlia", async () => {
    const riga = (await s.getRigheLegami("stagione"))[0];
    expect(riga).toEqual({
      codiceDestinatario: "1", descrizioneDestinatario: "Mario Rossi",
      codiceFiglia: "R01D01", descrizioneFiglia: "Comuna capofonte",
    });
  });

  it("un legame verso un destinatario assente si scarta", async () => {
    // Mail del consorzio del 24/09/2026: «non mostrare un codice conduttore se
    // non abbiamo il nome». Il conduttore 9 non è in anagrafica.
    const codici = (await s.getRigheLegami("live")).map((r) => r.codiceDestinatario);
    expect(codici).toEqual(["1"]);
  });

  it("un legame verso un conduttore cessato resta: il nome c'è", async () => {
    await s.replaceRegistro({
      madri: [], tratte: [],
      legami: [{ keykey: "2", keyroggia: "R01D01", metodo: "live" }],
    });
    expect((await s.getRigheLegami("live"))[0].descrizioneDestinatario).toBe("Cessato Luigi");
  });

  it("una roggia che nessuna anagrafica conosce si descrive col suo codice", async () => {
    await s.replaceRegistro({
      madri: [], tratte: [],
      legami: [{ keykey: "1", keyroggia: "R77D01", metodo: "live" }],
    });
    expect((await s.getRigheLegami("live"))[0].descrizioneFiglia).toBe("R77D01");
  });

  it("una roggia assente dagli impianti prende il nome dalla gerarchia R", async () => {
    await s.replaceGerarchiaRogge({
      madri: [{ codice: "R77", name: "R77 - Roggia" }],
      tratte: [{ keyroggia: "R77D01", name: "Fosso R", codiceMadre: "R77" }],
    });
    await s.replaceRegistro({
      madri: [], tratte: [],
      legami: [{ keykey: "1", keyroggia: "R77D01", metodo: "live" }],
    });
    expect((await s.getRigheLegami("live"))[0].descrizioneFiglia).toBe("Fosso R");
  });

  it("i destinatari senza nessun contatto compaiono comunque", async () => {
    // Mail del 24/09/2026: oggi il WS manda solo chi ha almeno un contatto, ma
    // se ne arrivasse uno senza va mostrato. L'unico filtro resta `flag_attivo`.
    await s.replaceConduttori([
      { keykey: "4", descrizione: "Nessun Contatto", email: null, cellulare: "0", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);
    expect(await s.getRigheDestinatari()).toEqual([
      { codice: "4", descrizione: "Nessun Contatto", numero: null, mail: null },
    ]);
  });
});
