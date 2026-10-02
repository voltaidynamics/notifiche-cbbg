import { describe, it, expect, vi } from "vitest";
import { patchConfigAd, rotteAd, type DipendenzeRotteAd } from "../routes";
import { MemStorage } from "../storage";
import { CHIAVI_AD, PERCORSO_GETUSERAD, type EndpointAd } from "../config-ad";
import type { Request, Response } from "express";

describe("patchConfigAd", () => {
  it("accetta i campi validi", () => {
    expect(patchConfigAd({ enabled: true, url: "https://ws/getuserAD", timeoutMs: 5000 }).success).toBe(true);
  });

  it("una patch parziale va bene, e l'URL vuoto e' lecito", () => {
    const r = patchConfigAd({ url: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ url: "" });
  });

  it("rifiuta un URL che non e' http o https", () => {
    expect(patchConfigAd({ url: "ftp://ws/getuserAD" }).success).toBe(false);
    expect(patchConfigAd({ url: "ws/getuserAD" }).success).toBe(false);
  });

  it("rifiuta un timeout assurdo", () => {
    expect(patchConfigAd({ timeoutMs: 10 }).success).toBe(false);
    expect(patchConfigAd({ timeoutMs: 600000 }).success).toBe(false);
  });

  it("rifiuta i campi LDAP di prima: lo schema e' strict", () => {
    expect(patchConfigAd({ host: "dc01" }).success).toBe(false);
  });
});

// Le uniche rotte sotto `requireRole("superadmin")`, sulla pagina di impostazioni
// piu' pericolosa dell'app: senza questi test una regressione qui non la vedrebbe
// nessuno.

function reqFinta(body: unknown = {}): Request {
  return { body } as unknown as Request;
}

function resFinta() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

type Chiamata = { endpoint: EndpointAd | null; credenziali?: { username: string; password: string } };

function deps(over: Partial<DipendenzeRotteAd> = {}): DipendenzeRotteAd & { chiamate: Chiamata[] } {
  const chiamate: Chiamata[] = [];
  return {
    archivio: new MemStorage(),
    prova: async (endpoint, credenziali) => {
      chiamate.push({ endpoint, credenziali });
      return { riuscita: true, messaggio: "ok" };
    },
    chiamate,
    ...over,
  } as DipendenzeRotteAd & { chiamate: Chiamata[] };
}

describe("rotteAd.leggi", () => {
  it("restituisce la vista, con l'URL derivato da ws.base", async () => {
    const archivio = new MemStorage();
    await archivio.setSetting("ws.base", "http://ws");
    const { res, json } = resFinta();
    await rotteAd(deps({ archivio })).leggi(reqFinta(), res);
    expect(json).toHaveBeenCalledWith({
      enabled: false,
      url: "",
      timeoutMs: 5000,
      urlEffettivo: `http://ws${PERCORSO_GETUSERAD}`,
      urlDerivato: true,
    });
  });
});

describe("rotteAd.salva", () => {
  it("salva una patch valida e risponde con la vista aggiornata", async () => {
    const archivio = new MemStorage();
    const { res, json, status } = resFinta();
    await rotteAd(deps({ archivio })).salva(reqFinta({ url: "https://ws/getuserAD" }), res);
    expect(status).not.toHaveBeenCalled();
    expect((await archivio.getAllSettings())[CHIAVI_AD.url]).toBe("https://ws/getuserAD");
    expect(json.mock.calls[0][0]).toMatchObject({ urlEffettivo: "https://ws/getuserAD" });
  });

  it("rifiuta una patch non valida con 400 e NON tocca l'archivio", async () => {
    const archivio = new MemStorage();
    const { res, status, json } = resFinta();
    await rotteAd(deps({ archivio })).salva(reqFinta({ url: "ftp://x" }), res);
    expect(status).toHaveBeenCalledWith(400);
    expect(await archivio.getAllSettings()).toEqual({});
    expect(json.mock.calls[0][0]).toMatchObject({ message: "Dati non validi" });
  });

  it("un archivio che esplode diventa 500, senza far trapelare l'errore interno", async () => {
    const archivio = {
      getAllSettings: async () => ({}),
      setSetting: async () => {
        throw new Error("connessione al database persa su 10.0.0.5:5432");
      },
    };
    const { res, status, json } = resFinta();
    await rotteAd(deps({ archivio })).salva(reqFinta({ url: "https://ws/getuserAD" }), res);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("10.0.0.5");
  });
});

describe("rotteAd.prova", () => {
  it("prova la configurazione salvata anche con l'interruttore spento", async () => {
    const archivio = new MemStorage();
    await archivio.setSetting("ws.base", "http://ws");
    await archivio.setSetting("ws.auth", "Basic abc");
    const d = deps({ archivio });
    const { res } = resFinta();
    await rotteAd(d).prova(reqFinta({}), res);
    expect(d.chiamate[0].endpoint).toEqual({
      url: `http://ws${PERCORSO_GETUSERAD}`,
      auth: "Basic abc",
      timeoutMs: 5000,
    });
    expect(d.chiamate[0].credenziali).toBeUndefined();
  });

  it("senza URL passa null, e decide provaEndpoint cosa dire", async () => {
    const d = deps();
    const { res } = resFinta();
    await rotteAd(d).prova(reqFinta({}), res);
    expect(d.chiamate[0].endpoint).toBeNull();
  });

  it("con le credenziali le passa una volta sola", async () => {
    const d = deps();
    const { res } = resFinta();
    await rotteAd(d).prova(reqFinta({ username: "m.rossi", password: "segreto" }), res);
    expect(d.chiamate[0].credenziali).toEqual({ username: "m.rossi", password: "segreto" });
  });

  it("uno username di soli spazi vale come assenza di credenziali", async () => {
    const d = deps();
    const { res } = resFinta();
    await rotteAd(d).prova(reqFinta({ username: "   ", password: "segreto" }), res);
    expect(d.chiamate[0].credenziali).toBeUndefined();
  });

  it("una prova che esplode diventa 500, senza il messaggio dell'errore", async () => {
    const d = deps({
      prova: async () => {
        throw new Error("fetch failed http://ws/getuserAD/m.rossi/segretissima");
      },
    });
    const { res, status, json } = resFinta();
    await rotteAd(d).prova(reqFinta({ username: "m.rossi", password: "segretissima" }), res);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("segretissima");
  });
});
