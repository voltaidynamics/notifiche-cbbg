import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import type { InsertNotificationTemplate } from "@shared/schema";

const base: InsertNotificationTemplate = {
  name: "Chiusura Adige",
  tipoTemplate: "chiusura",
  subject: "Avviso di chiusura",
  bodyEmail: "Corpo della mail",
  bodySms: "Testo SMS",
};

describe("MemStorage — autore del template", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("registra l'autore passato come secondo parametro", async () => {
    const t = await s.createTemplate(base, "mario");
    expect(t.createdBy).toBe("mario");
  });

  it("senza autore il campo resta null, non undefined", async () => {
    const t = await s.createTemplate(base);
    expect(t.createdBy).toBeNull();
  });

  it("i template di partenza non hanno autore", async () => {
    const tutti = await s.getAllTemplates();
    expect(tutti.length).toBeGreaterThan(0);
    expect(tutti.every((t) => t.createdBy === null)).toBe(true);
  });

  it("la modifica non riscrive l'autore", async () => {
    const t = await s.createTemplate(base, "mario");
    const dopo = await s.updateTemplate(t.id, { name: "Nome cambiato" }, "luca");
    expect(dopo?.name).toBe("Nome cambiato");
    expect(dopo?.createdBy).toBe("mario");
  });
});

describe("MemStorage — ultima modifica del template", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("un template appena creato non risulta modificato", async () => {
    const t = await s.createTemplate(base, "mario");
    expect(t.updatedBy).toBeNull();
    expect(t.updatedAt).toBeNull();
  });

  it("la modifica registra chi l'ha fatta e quando", async () => {
    const t = await s.createTemplate(base, "mario");
    const prima = Date.now();
    const dopo = await s.updateTemplate(t.id, { name: "Nome cambiato" }, "luca");
    expect(dopo?.updatedBy).toBe("luca");
    expect(dopo?.updatedAt).toBeInstanceOf(Date);
    expect(dopo!.updatedAt!.getTime()).toBeGreaterThanOrEqual(prima);
  });

  it("l'ultima modifica è l'ultima davvero: la seconda sovrascrive la prima", async () => {
    const t = await s.createTemplate(base, "mario");
    await s.updateTemplate(t.id, { name: "Primo cambio" }, "luca");
    const dopo = await s.updateTemplate(t.id, { name: "Secondo cambio" }, "sara");
    expect(dopo?.updatedBy).toBe("sara");
  });

  it("una modifica senza sessione lascia null, non undefined", async () => {
    const t = await s.createTemplate(base, "mario");
    const dopo = await s.updateTemplate(t.id, { name: "Nome cambiato" });
    expect(dopo?.updatedBy).toBeNull();
    // La data resta comunque: il template è stato modificato, chiunque sia stato.
    expect(dopo?.updatedAt).toBeInstanceOf(Date);
  });

  it("modificare un template inesistente non crea nulla", async () => {
    expect(await s.updateTemplate(9999, { name: "x" }, "luca")).toBeUndefined();
  });
});

describe("MemStorage — predefinito per tipo template", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("i template di partenza hanno un solo predefinito per tipo", async () => {
    const tutti = await s.getAllTemplates();
    for (const tipo of ["apertura", "chiusura", "altro"]) {
      const predefiniti = tutti.filter((t) => t.tipoTemplate === tipo && t.isDefault);
      expect(predefiniti).toHaveLength(1);
    }
  });

  it("impostare un predefinito toglie il precedente dello stesso tipo", async () => {
    const nuovo = await s.createTemplate({ ...base, tipoTemplate: "chiusura" }, "mario");
    await s.setDefaultTemplate(nuovo.id, "chiusura");
    const predefinito = await s.getDefaultTemplateForTipo("chiusura");
    expect(predefinito?.id).toBe(nuovo.id);
    const tutti = await s.getAllTemplates();
    expect(tutti.filter((t) => t.tipoTemplate === "chiusura" && t.isDefault)).toHaveLength(1);
  });
});
