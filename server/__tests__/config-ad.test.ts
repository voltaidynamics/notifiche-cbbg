import { describe, it, expect } from "vitest";
import {
  CHIAVI_AD,
  PERCORSO_GETUSERAD,
  endpointAd,
  leggiConfigAd,
  salvaConfigAd,
  vistaConfigAd,
} from "../config-ad";
import { MemStorage } from "../storage";

const BASE_WS = "http://ws.consorzio.local";

describe("leggiConfigAd", () => {
  it("default: spenta, senza URL, 5 secondi", () => {
    expect(leggiConfigAd({})).toEqual({ enabled: false, url: "", timeoutMs: 5000 });
  });

  it("accesa solo con 'true'", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.enabled]: "true" }).enabled).toBe(true);
    expect(leggiConfigAd({ [CHIAVI_AD.enabled]: "vero" }).enabled).toBe(false);
  });

  it("URL senza spazi esterni e senza barre finali", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.url]: "  http://x/getuserAD//  " }).url).toBe("http://x/getuserAD");
  });

  it("un timeout fuori intervallo o illeggibile ripiega sul default", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.timeoutMs]: "8000" }).timeoutMs).toBe(8000);
    expect(leggiConfigAd({ [CHIAVI_AD.timeoutMs]: "10" }).timeoutMs).toBe(5000);
    expect(leggiConfigAd({ [CHIAVI_AD.timeoutMs]: "600000" }).timeoutMs).toBe(5000);
    expect(leggiConfigAd({ [CHIAVI_AD.timeoutMs]: "boh" }).timeoutMs).toBe(5000);
  });
});

describe("vistaConfigAd", () => {
  it("URL esplicito vince su ws.base", () => {
    const v = vistaConfigAd({ [CHIAVI_AD.url]: "https://altro/getuserAD", "ws.base": BASE_WS });
    expect(v.urlEffettivo).toBe("https://altro/getuserAD");
    expect(v.urlDerivato).toBe(false);
  });

  it("URL vuoto: deriva da ws.base", () => {
    const v = vistaConfigAd({ "ws.base": `${BASE_WS}/` });
    expect(v.url).toBe("");
    expect(v.urlEffettivo).toBe(`${BASE_WS}${PERCORSO_GETUSERAD}`);
    expect(v.urlDerivato).toBe(true);
  });

  it("niente URL e niente ws.base: nessun URL effettivo", () => {
    expect(vistaConfigAd({})).toMatchObject({ urlEffettivo: "", urlDerivato: false });
  });
});

describe("endpointAd", () => {
  const accesa = { [CHIAVI_AD.enabled]: "true", "ws.base": BASE_WS };

  it("spenta: null, a meno di ancheSpenta", () => {
    expect(endpointAd({ "ws.base": BASE_WS })).toBeNull();
    expect(endpointAd({ "ws.base": BASE_WS }, { ancheSpenta: true })?.url).toBe(`${BASE_WS}${PERCORSO_GETUSERAD}`);
  });

  it("senza URL effettivo: null anche se accesa", () => {
    expect(endpointAd({ [CHIAVI_AD.enabled]: "true" })).toBeNull();
    expect(endpointAd({}, { ancheSpenta: true })).toBeNull();
  });

  it("porta ws.auth come Authorization, null se vuota", () => {
    expect(endpointAd({ ...accesa, "ws.auth": "Basic abc" })?.auth).toBe("Basic abc");
    expect(endpointAd({ ...accesa, "ws.auth": "  " })?.auth).toBeNull();
  });

  it("porta il timeout", () => {
    expect(endpointAd({ ...accesa, [CHIAVI_AD.timeoutMs]: "9000" })?.timeoutMs).toBe(9000);
  });
});

describe("salvaConfigAd", () => {
  it("una patch parziale conserva il resto", async () => {
    const archivio = new MemStorage();
    await salvaConfigAd(archivio, { url: "https://x/getuserAD", timeoutMs: 7000 });
    const v = await salvaConfigAd(archivio, { enabled: true });
    expect(v).toMatchObject({ enabled: true, url: "https://x/getuserAD", timeoutMs: 7000 });
  });

  it("l'URL derivato NON si scrive: se ws.base cambia, lo segue", async () => {
    const archivio = new MemStorage();
    await archivio.setSetting("ws.base", BASE_WS);
    const v = await salvaConfigAd(archivio, { enabled: true, url: "" });
    expect(v.urlEffettivo).toBe(`${BASE_WS}${PERCORSO_GETUSERAD}`);
    expect((await archivio.getAllSettings())[CHIAVI_AD.url]).toBe("");

    await archivio.setSetting("ws.base", "http://nuovo");
    expect(vistaConfigAd(await archivio.getAllSettings()).urlEffettivo).toBe(`http://nuovo${PERCORSO_GETUSERAD}`);
  });

  it("normalizza quello che scrive", async () => {
    const archivio = new MemStorage();
    await salvaConfigAd(archivio, { url: "  https://x/getuserAD/ " });
    expect((await archivio.getAllSettings())[CHIAVI_AD.url]).toBe("https://x/getuserAD");
  });
});
