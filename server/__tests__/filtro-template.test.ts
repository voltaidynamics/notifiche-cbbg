import { describe, it, expect } from "vitest";
import {
  filtraTemplate,
  ordinaTemplate,
  utentiDeiTemplate,
  FILTRO_TUTTI,
  UTENTE_NON_INDICATO,
  type TemplateFiltrabile,
} from "@shared/filtro-template";

const t = (over: Partial<TemplateFiltrabile> & { id: number }): TemplateFiltrabile => ({
  name: "Template",
  subject: "Oggetto",
  bodyEmail: "Corpo del messaggio",
  tipoTemplate: "chiusura",
  createdBy: "mario",
  ...over,
});

describe("filtraTemplate — ricerca", () => {
  it("senza criteri restituisce tutto", () => {
    const lista = [t({ id: 1 }), t({ id: 2 })];
    expect(filtraTemplate(lista, {})).toHaveLength(2);
  });

  it("pesca sul nome, ignorando maiuscole e spazi ai bordi", () => {
    const lista = [t({ id: 1, name: "Chiusura Adige" }), t({ id: 2, name: "Manutenzione Ticino" })];
    expect(filtraTemplate(lista, { ricerca: "  adige " }).map((x) => x.id)).toEqual([1]);
  });

  it("pesca sull'oggetto", () => {
    const lista = [t({ id: 1, subject: "Avviso di chiusura" }), t({ id: 2, subject: "Riapertura" })];
    expect(filtraTemplate(lista, { ricerca: "chiusura" }).map((x) => x.id)).toEqual([1]);
  });

  it("pesca sul corpo email", () => {
    const lista = [t({ id: 1, bodyEmail: "percorsi alternativi" }), t({ id: 2, bodyEmail: "servizio regolare" })];
    expect(filtraTemplate(lista, { ricerca: "alternativi" }).map((x) => x.id)).toEqual([1]);
  });

  it("pesca sull'utente", () => {
    const lista = [t({ id: 1, createdBy: "luca" }), t({ id: 2, createdBy: "sara" })];
    expect(filtraTemplate(lista, { ricerca: "sara" }).map((x) => x.id)).toEqual([2]);
  });

  it("un template senza autore non fa esplodere la ricerca", () => {
    const lista = [t({ id: 1, createdBy: null })];
    expect(filtraTemplate(lista, { ricerca: "mario" })).toEqual([]);
  });
});

describe("filtraTemplate — filtri", () => {
  it("il tipo seleziona un solo tipo template", () => {
    const lista = [t({ id: 1, tipoTemplate: "chiusura" }), t({ id: 2, tipoTemplate: "apertura" })];
    expect(filtraTemplate(lista, { tipo: "apertura" }).map((x) => x.id)).toEqual([2]);
  });

  it("la sentinella FILTRO_TUTTI non filtra nulla", () => {
    const lista = [t({ id: 1, tipoTemplate: "chiusura" }), t({ id: 2, tipoTemplate: "apertura" })];
    expect(filtraTemplate(lista, { tipo: FILTRO_TUTTI, utente: FILTRO_TUTTI })).toHaveLength(2);
  });

  it("il tipo altro non pesca apertura e chiusura", () => {
    const lista = [
      t({ id: 1, tipoTemplate: "altro" }),
      t({ id: 2, tipoTemplate: "apertura" }),
      t({ id: 3, tipoTemplate: "chiusura" }),
    ];
    expect(filtraTemplate(lista, { tipo: "altro" }).map((x) => x.id)).toEqual([1]);
  });

  it("l'utente seleziona per username esatto", () => {
    const lista = [t({ id: 1, createdBy: "mario" }), t({ id: 2, createdBy: "mariolino" })];
    expect(filtraTemplate(lista, { utente: "mario" }).map((x) => x.id)).toEqual([1]);
  });

  it("UTENTE_NON_INDICATO seleziona i template senza autore", () => {
    const lista = [t({ id: 1, createdBy: null }), t({ id: 2, createdBy: "mario" })];
    expect(filtraTemplate(lista, { utente: UTENTE_NON_INDICATO }).map((x) => x.id)).toEqual([1]);
  });

  it("i filtri si combinano in AND", () => {
    const lista = [
      t({ id: 1, tipoTemplate: "chiusura", createdBy: "mario", name: "Adige" }),
      t({ id: 2, tipoTemplate: "chiusura", createdBy: "luca", name: "Adige" }),
      t({ id: 3, tipoTemplate: "apertura", createdBy: "mario", name: "Adige" }),
    ];
    expect(filtraTemplate(lista, { ricerca: "adige", tipo: "chiusura", utente: "mario" }).map((x) => x.id)).toEqual([1]);
  });
});

describe("ordinaTemplate", () => {
  it("ordina per id crescente e decrescente", () => {
    const lista = [t({ id: 3 }), t({ id: 1 }), t({ id: 2 })];
    expect(ordinaTemplate(lista, "id", true).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(ordinaTemplate(lista, "id", false).map((x) => x.id)).toEqual([3, 2, 1]);
  });

  it("ordina per nome ignorando le maiuscole", () => {
    const lista = [t({ id: 1, name: "beta" }), t({ id: 2, name: "Alfa" })];
    expect(ordinaTemplate(lista, "name", true).map((x) => x.id)).toEqual([2, 1]);
  });

  it("i template senza autore finiscono in fondo in entrambe le direzioni", () => {
    const lista = [t({ id: 1, createdBy: null }), t({ id: 2, createdBy: "sara" }), t({ id: 3, createdBy: "luca" })];
    expect(ordinaTemplate(lista, "createdBy", true).map((x) => x.id)).toEqual([3, 2, 1]);
    expect(ordinaTemplate(lista, "createdBy", false).map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("non muta la lista ricevuta", () => {
    const lista = [t({ id: 2 }), t({ id: 1 })];
    ordinaTemplate(lista, "id", true);
    expect(lista.map((x) => x.id)).toEqual([2, 1]);
  });

  it("una lista vuota resta vuota", () => {
    expect(ordinaTemplate([], "id", true)).toEqual([]);
  });
});

describe("utentiDeiTemplate", () => {
  it("elenca gli username distinti in ordine alfabetico, senza i nulli", () => {
    const lista = [t({ id: 1, createdBy: "sara" }), t({ id: 2, createdBy: "luca" }), t({ id: 3, createdBy: "sara" }), t({ id: 4, createdBy: null })];
    expect(utentiDeiTemplate(lista)).toEqual(["luca", "sara"]);
  });

  it("su lista vuota restituisce lista vuota", () => {
    expect(utentiDeiTemplate([])).toEqual([]);
  });
});
