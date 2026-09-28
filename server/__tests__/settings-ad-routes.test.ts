import { describe, it, expect, vi } from "vitest";
import { patchConfigAd, rotteAd, type DipendenzeRotteAd } from "../routes";
import { MemStorage } from "../storage";
import { leggiConfigAd, CHIAVI_AD, type ConfigAd } from "../config-ad";
import type { Request, Response } from "express";

describe("patchConfigAd", () => {
  it("accetta i campi validi", () => {
    const r = patchConfigAd({
      enabled: true,
      host: "dc01.consorzio.local",
      port: 636,
      dominio: "consorzio.local",
      tls: "ldaps",
      caPem: "-----BEGIN CERTIFICATE-----",
      rejectUnauthorized: true,
      timeoutMs: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("una patch parziale va bene", () => {
    const r = patchConfigAd({ host: "dc02" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ host: "dc02" });
  });

  it("rifiuta una modalita' TLS sconosciuta", () => {
    expect(patchConfigAd({ tls: "chiaro" }).success).toBe(false);
  });

  it("rifiuta una porta fuori intervallo", () => {
    expect(patchConfigAd({ port: 0 }).success).toBe(false);
    expect(patchConfigAd({ port: 70000 }).success).toBe(false);
  });

  it("rifiuta un timeout assurdo", () => {
    expect(patchConfigAd({ timeoutMs: 10 }).success).toBe(false);
    expect(patchConfigAd({ timeoutMs: 600000 }).success).toBe(false);
  });
});

// ---- Gli handler delle tre rotte -------------------------------------------
// Sono le uniche rotte sotto `requireRole("superadmin")`, sulla pagina di
// impostazioni piu' pericolosa dell'app: senza questi test una regressione qui
// non la vedrebbe nessuno.

function reqFinta(body: unknown = {}): Request {
  return { body } as unknown as Request;
}

function resFinta() {
  // `res.json(...)` e `res.status(n).json(...)` finiscono sullo stesso mock:
  // lo status si asserisce su `status`, il corpo su `json`, sempre.
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

function configDiProva(over: Partial<ConfigAd> = {}): ConfigAd {
  return {
    ...leggiConfigAd({
      [CHIAVI_AD.enabled]: "true",
      [CHIAVI_AD.host]: "dc01.consorzio.local",
      [CHIAVI_AD.dominio]: "consorzio.local",
    }),
    ...over,
  };
}

function deps(over: Partial<DipendenzeRotteAd> = {}): DipendenzeRotteAd & {
  chiamate: { config: ConfigAd; credenziali?: { username: string; password: string } }[];
} {
  const chiamate: { config: ConfigAd; credenziali?: { username: string; password: string } }[] = [];
  return {
    archivio: new MemStorage(),
    leggiConfig: () => configDiProva(),
    prova: async (config, credenziali) => {
      chiamate.push({ config, credenziali });
      return { raggiungibile: true, messaggio: "ok" };
    },
    chiamate,
    ...over,
  } as DipendenzeRotteAd & { chiamate: typeof chiamate };
}

describe("rotteAd.leggi", () => {
  it("restituisce la configurazione corrente", () => {
    const d = deps();
    const { res, json } = resFinta();
    rotteAd(d).leggi(reqFinta(), res);
    expect(json).toHaveBeenCalledWith(configDiProva());
  });
});

describe("rotteAd.salva", () => {
  it("salva una patch valida e risponde con la configurazione aggiornata", async () => {
    const archivio = new MemStorage();
    const d = deps({ archivio });
    const { res, json, status } = resFinta();
    await rotteAd(d).salva(reqFinta({ host: "dc02.consorzio.local" }), res);
    expect(status).not.toHaveBeenCalled();
    const settings = await archivio.getAllSettings();
    expect(settings[CHIAVI_AD.host]).toBe("dc02.consorzio.local");
    expect(json).toHaveBeenCalled();
  });

  it("rifiuta una patch non valida con 400 e NON tocca l'archivio", async () => {
    const archivio = new MemStorage();
    const d = deps({ archivio });
    const { res, status, json } = resFinta();
    await rotteAd(d).salva(reqFinta({ tls: "chiaro" }), res);
    expect(status).toHaveBeenCalledWith(400);
    // Quello che conta: il rifiuto arriva PRIMA di qualunque scrittura.
    expect(await archivio.getAllSettings()).toEqual({});
    expect(json.mock.calls[0][0]).toMatchObject({ message: "Dati non validi" });
  });

  it("rifiuta un campo sconosciuto: lo schema e' strict", async () => {
    const d = deps();
    const { res, status } = resFinta();
    await rotteAd(d).salva(reqFinta({ hostt: "dc02" }), res);
    expect(status).toHaveBeenCalledWith(400);
  });

  it("un archivio che esplode diventa 500, senza far trapelare l'errore interno", async () => {
    const archivio = {
      getAllSettings: async () => ({}),
      setSetting: async () => {
        throw new Error("connessione al database persa su 10.0.0.5:5432");
      },
    };
    const d = deps({ archivio });
    const { res, status, json } = resFinta();
    await rotteAd(d).salva(reqFinta({ host: "dc02" }), res);
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("10.0.0.5");
  });
});

describe("rotteAd.prova", () => {
  it("senza credenziali prova solo la raggiungibilita'", async () => {
    const d = deps();
    const { res } = resFinta();
    await rotteAd(d).prova(reqFinta({}), res);
    expect(d.chiamate).toHaveLength(1);
    expect(d.chiamate[0].credenziali).toBeUndefined();
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

  it("la password di prova non torna MAI nella risposta", async () => {
    const d = deps({
      // Un esito che porta con se' del testo libero: e' li' che una password
      // potrebbe scivolare dentro per sbaglio.
      prova: async () => ({
        raggiungibile: true,
        messaggio: "Domain controller raggiungibile",
        bind: { esito: "credenzialiNonValide" as const },
      }),
    });
    const { res, json } = resFinta();
    await rotteAd(d).prova(reqFinta({ username: "m.rossi", password: "segretissima" }), res);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain("segretissima");
  });

  it("una prova che esplode diventa 500 con raggiungibile falso", async () => {
    const d = deps({
      prova: async () => {
        throw new Error("boom");
      },
    });
    const { res, status } = resFinta();
    await rotteAd(d).prova(reqFinta({}), res);
    expect(status).toHaveBeenCalledWith(500);
  });
});
