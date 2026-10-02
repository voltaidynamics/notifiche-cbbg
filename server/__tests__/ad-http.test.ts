import { describe, it, expect } from "vitest";
import {
  HttpVerificatoreAd,
  leggiStatus,
  provaEndpoint,
  urlVerifica,
  type FetchAd,
  type RispostaHttp,
} from "../ad/http";
import type { EndpointAd } from "../config-ad";

const BASE = "http://ws.consorzio.local/RestTabelle/RestTabelle.svc/getuserAD";
const ENDPOINT: EndpointAd = { url: BASE, auth: null, timeoutMs: 5000 };

type Risposta = { status?: number; corpo?: string } | Error | "appeso";

/** Un fetch finto: risponde in base all'URL, registra URL e header di ogni chiamata. */
function fetchFinto(risposta: Risposta | ((url: string) => Risposta)) {
  const chiamate: { url: string; headers: Record<string, string> }[] = [];
  const f: FetchAd = (url, init) => {
    chiamate.push({ url, headers: init.headers });
    const r = typeof risposta === "function" ? risposta(url) : risposta;
    if (r === "appeso") {
      return new Promise<RispostaHttp>((_, rifiuta) =>
        init.signal.addEventListener("abort", () => rifiuta(new Error("This operation was aborted"))),
      );
    }
    if (r instanceof Error) return Promise.reject(r);
    const status = r.status ?? 200;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: async () => r.corpo ?? "",
    });
  };
  return { f, chiamate };
}

describe("leggiStatus", () => {
  it("legge le due risposte documentate", () => {
    expect(leggiStatus('[{"status":true}]')).toBe(true);
    expect(leggiStatus('[{"status":false}]')).toBe(false);
  });

  it("accetta l'oggetto nudo", () => {
    expect(leggiStatus('{"status":true}')).toBe(true);
  });

  it("tutto il resto e' null", () => {
    expect(leggiStatus("")).toBeNull();
    expect(leggiStatus("<html>Errore</html>")).toBeNull();
    expect(leggiStatus("[]")).toBeNull();
    expect(leggiStatus('[{"status":true},{"status":false}]')).toBeNull();
    expect(leggiStatus('[{"status":"true"}]')).toBeNull();
    expect(leggiStatus('[{"stato":true}]')).toBeNull();
    expect(leggiStatus("true")).toBeNull();
    expect(leggiStatus("null")).toBeNull();
  });
});

describe("urlVerifica", () => {
  it("toglie le barre finali della base", () => {
    expect(urlVerifica(`${BASE}//`, "m.rossi", "pw")).toBe(`${BASE}/m.rossi/pw`);
  });

  it("codifica i caratteri riservati: sempre due segmenti, decodificabili identici", () => {
    const username = "m rossi/è";
    const password = "a/b%c?d#e+f g è&=:";
    const url = urlVerifica(BASE, username, password);
    const coda = url.slice(BASE.length + 1);
    const segmenti = coda.split("/");
    expect(segmenti).toHaveLength(2);
    expect(decodeURIComponent(segmenti[0])).toBe(username);
    expect(decodeURIComponent(segmenti[1])).toBe(password);
    expect(coda).not.toMatch(/[?#]/);
  });
});

describe("HttpVerificatoreAd", () => {
  it("true e' ok, false e' credenziali non valide", async () => {
    expect(await new HttpVerificatoreAd(ENDPOINT, fetchFinto({ corpo: '[{"status":true}]' }).f).verifica("m.rossi", "pw"))
      .toEqual({ esito: "ok" });
    expect(await new HttpVerificatoreAd(ENDPOINT, fetchFinto({ corpo: '[{"status":false}]' }).f).verifica("m.rossi", "pw"))
      .toEqual({ esito: "credenzialiNonValide" });
  });

  it("chiama l'URL giusto", async () => {
    const { f, chiamate } = fetchFinto({ corpo: '[{"status":true}]' });
    await new HttpVerificatoreAd(ENDPOINT, f).verifica("m.rossi", "segreto");
    expect(chiamate[0].url).toBe(`${BASE}/m.rossi/segreto`);
  });

  it("toglie gli spazi esterni dallo username, non dalla password", async () => {
    const { f, chiamate } = fetchFinto({ corpo: '[{"status":true}]' });
    await new HttpVerificatoreAd(ENDPOINT, f).verifica("  m.rossi ", " pw ");
    expect(chiamate[0].url).toBe(`${BASE}/m.rossi/%20pw%20`);
  });

  it("manda Authorization solo se c'e'", async () => {
    const con = fetchFinto({ corpo: '[{"status":true}]' });
    await new HttpVerificatoreAd({ ...ENDPOINT, auth: "Basic abc" }, con.f).verifica("m.rossi", "pw");
    expect(con.chiamate[0].headers.Authorization).toBe("Basic abc");

    const senza = fetchFinto({ corpo: '[{"status":true}]' });
    await new HttpVerificatoreAd(ENDPOINT, senza.f).verifica("m.rossi", "pw");
    expect(senza.chiamate[0].headers).not.toHaveProperty("Authorization");
  });

  it("password vuota o di soli spazi: nessuna chiamata", async () => {
    const { f, chiamate } = fetchFinto({ corpo: '[{"status":true}]' });
    const v = new HttpVerificatoreAd(ENDPOINT, f);
    expect(await v.verifica("m.rossi", "")).toEqual({ esito: "credenzialiNonValide" });
    expect(await v.verifica("m.rossi", "   ")).toEqual({ esito: "credenzialiNonValide" });
    expect(await v.verifica("  ", "pw")).toEqual({ esito: "credenzialiNonValide" });
    expect(chiamate).toHaveLength(0);
  });

  it.each([
    [".", "pw"],
    ["..", "pw"],
    ["m.rossi", "."],
    ["m.rossi", ".."],
  ])("username %j o password %j fatti di soli punti: nessuna chiamata", async (username, password) => {
    // fetch collassa i segmenti «.» e «..» (anche codificati come %2e): con
    // username «..» si chiamerebbe un altro endpoint del web service, con le
    // nostre credenziali ws.auth.
    const { f, chiamate } = fetchFinto({ corpo: '[{"status":true}]' });
    expect(await new HttpVerificatoreAd(ENDPOINT, f).verifica(username, password))
      .toEqual({ esito: "credenzialiNonValide" });
    expect(chiamate).toHaveLength(0);
  });

  it.each<[string, Risposta]>([
    ["HTTP 500", { status: 500, corpo: '[{"status":true}]' }],
    ["HTTP 404", { status: 404 }],
    ["pagina HTML con 200", { corpo: "<html>Request Error</html>" }],
    ["array vuoto", { corpo: "[]" }],
    ["status stringa", { corpo: '[{"status":"true"}]' }],
    ["errore di rete", new Error("fetch failed")],
  ])("%s e' non raggiungibile", async (_nome, risposta) => {
    const e = await new HttpVerificatoreAd(ENDPOINT, fetchFinto(risposta).f).verifica("m.rossi", "pw");
    expect(e.esito).toBe("nonRaggiungibile");
  });

  it("timeout e' non raggiungibile, e lo dice", async () => {
    const e = await new HttpVerificatoreAd({ ...ENDPOINT, timeoutMs: 20 }, fetchFinto("appeso").f)
      .verifica("m.rossi", "pw");
    expect(e).toEqual({ esito: "nonRaggiungibile", dettaglio: expect.stringContaining("timeout dopo 20 ms") });
  });

  describe("la password non esce mai", () => {
    const PASSWORD = "Segreta/123%";
    const forme = [PASSWORD, encodeURIComponent(PASSWORD), "Segreta"];

    it.each<[string, Risposta, number]>([
      ["errore di rete che cita l'URL", new Error(`fetch failed: ${urlVerifica(BASE, "m.rossi", PASSWORD)}`), 5000],
      ["errore di rete che cita la password in chiaro", new Error(`bad request ${PASSWORD}`), 5000],
      ["HTTP 500", { status: 500 }, 5000],
      ["risposta non riconosciuta", { corpo: "boh" }, 5000],
      ["timeout", "appeso", 20],
    ])("%s", async (_nome, risposta, timeoutMs) => {
      const e = await new HttpVerificatoreAd({ ...ENDPOINT, timeoutMs }, fetchFinto(risposta).f)
        .verifica("m.rossi", PASSWORD);
      expect(e.esito).toBe("nonRaggiungibile");
      const testo = JSON.stringify(e);
      for (const f of forme) expect(testo).not.toContain(f);
      // Ma dice dove ha chiamato, mascherato:
      expect(testo).toContain(`${BASE}/m.rossi/***`);
    });
  });
});

describe("provaEndpoint", () => {
  const vero = '[{"status":true}]';
  const falso = '[{"status":false}]';

  it("senza endpoint fallisce e dice cosa manca", async () => {
    const r = await provaEndpoint(null);
    expect(r.riuscita).toBe(false);
    expect(r.messaggio).toMatch(/URL/);
  });

  it("riesce quando l'endpoint rifiuta credenziali inventate", async () => {
    const { f, chiamate } = fetchFinto({ corpo: falso });
    const r = await provaEndpoint(ENDPOINT, undefined, f);
    expect(r.riuscita).toBe(true);
    expect(r.verifica).toBeUndefined();
    expect(chiamate).toHaveLength(1);
    expect(chiamate[0].url).toContain("/verifica-app-");
  });

  it("FALLISCE se l'endpoint accetta credenziali inventate", async () => {
    const r = await provaEndpoint(ENDPOINT, undefined, fetchFinto({ corpo: vero }).f);
    expect(r.riuscita).toBe(false);
    expect(r.messaggio).toMatch(/inventate/);
  });

  it("fallisce se l'endpoint non risponde come deve", async () => {
    const r = await provaEndpoint(ENDPOINT, undefined, fetchFinto({ status: 500 }).f);
    expect(r.riuscita).toBe(false);
    expect(r.messaggio).toContain("HTTP 500");
  });

  it("con le credenziali, dopo il primo controllo prova anche quelle", async () => {
    const { f, chiamate } = fetchFinto((url) => ({ corpo: url.includes("/m.rossi/") ? vero : falso }));
    const r = await provaEndpoint(ENDPOINT, { username: "m.rossi", password: "pw" }, f);
    expect(r.riuscita).toBe(true);
    expect(r.verifica).toEqual({ esito: "ok" });
    expect(chiamate).toHaveLength(2);
  });

  it("con le credenziali ma primo controllo fallito, non le prova", async () => {
    const { f, chiamate } = fetchFinto({ corpo: vero });
    const r = await provaEndpoint(ENDPOINT, { username: "m.rossi", password: "pw" }, f);
    expect(r.riuscita).toBe(false);
    expect(chiamate).toHaveLength(1);
  });

  it("la password di prova non torna nell'esito", async () => {
    const PASSWORD = "Segreta/123%";
    const { f } = fetchFinto((url) =>
      url.includes("/m.rossi/") ? new Error(`fetch failed: ${url}`) : { corpo: falso },
    );
    const r = await provaEndpoint(ENDPOINT, { username: "m.rossi", password: PASSWORD }, f);
    expect(r.verifica?.esito).toBe("nonRaggiungibile");
    const testo = JSON.stringify(r);
    expect(testo).not.toContain(PASSWORD);
    expect(testo).not.toContain(encodeURIComponent(PASSWORD));
  });
});
