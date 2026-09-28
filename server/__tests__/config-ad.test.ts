import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import {
  leggiConfigAd,
  adConfigurato,
  caricaConfigAd,
  salvaConfigAd,
  getConfigAd,
  CHIAVI_AD,
} from "../config-ad";

describe("leggiConfigAd", () => {
  it("il default e' AD spento, LDAPS sulla 636, certificato verificato", () => {
    expect(leggiConfigAd({})).toEqual({
      enabled: false,
      host: "",
      port: 636,
      dominio: "",
      tls: "ldaps",
      caPem: "",
      rejectUnauthorized: true,
      timeoutMs: 5000,
    });
  });

  it("legge i valori dal database", () => {
    const c = leggiConfigAd({
      [CHIAVI_AD.enabled]: "true",
      [CHIAVI_AD.host]: "dc01.consorzio.local",
      [CHIAVI_AD.port]: "636",
      [CHIAVI_AD.dominio]: "consorzio.local",
      [CHIAVI_AD.tls]: "starttls",
      [CHIAVI_AD.caPem]: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
      [CHIAVI_AD.rejectUnauthorized]: "false",
      [CHIAVI_AD.timeoutMs]: "8000",
    });
    expect(c.enabled).toBe(true);
    expect(c.host).toBe("dc01.consorzio.local");
    expect(c.tls).toBe("starttls");
    expect(c.rejectUnauthorized).toBe(false);
    expect(c.timeoutMs).toBe(8000);
  });

  it("una modalita' TLS sconosciuta ripiega su ldaps, non sul chiaro", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.tls]: "boh" }).tls).toBe("ldaps");
  });

  it("una porta non numerica ripiega sul default", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.port]: "abc" }).port).toBe(636);
  });

  it("un valore sconosciuto di rejectUnauthorized ripiega sul default true, non false", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.rejectUnauthorized]: "no" }).rejectUnauthorized).toBe(true);
  });

  it("l'esplicito false per rejectUnauthorized continua a funzionare", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.rejectUnauthorized]: "false" }).rejectUnauthorized).toBe(false);
  });

  it("un valore sconosciuto di enabled ripiega sul default, non su false", () => {
    expect(leggiConfigAd({ [CHIAVI_AD.enabled]: "vero" }).enabled).toBe(false);
  });
});

describe("adConfigurato", () => {
  it("falso se spento, anche con tutto il resto pieno", () => {
    const c = leggiConfigAd({
      [CHIAVI_AD.host]: "dc01",
      [CHIAVI_AD.dominio]: "consorzio.local",
    });
    expect(adConfigurato(c)).toBe(false);
  });

  it("falso se manca host o dominio", () => {
    expect(adConfigurato(leggiConfigAd({
      [CHIAVI_AD.enabled]: "true",
      [CHIAVI_AD.dominio]: "consorzio.local",
    }))).toBe(false);
    expect(adConfigurato(leggiConfigAd({
      [CHIAVI_AD.enabled]: "true",
      [CHIAVI_AD.host]: "dc01",
    }))).toBe(false);
  });

  it("vero quando c'e' tutto", () => {
    expect(adConfigurato(leggiConfigAd({
      [CHIAVI_AD.enabled]: "true",
      [CHIAVI_AD.host]: "dc01",
      [CHIAVI_AD.dominio]: "consorzio.local",
    }))).toBe(true);
  });
});

describe("salvaConfigAd", () => {
  let archivio: MemStorage;
  beforeEach(async () => {
    archivio = new MemStorage();
    await caricaConfigAd(archivio);
  });

  it("scrive nel database e aggiorna la copia in memoria", async () => {
    await salvaConfigAd(archivio, {
      enabled: true,
      host: "dc01.consorzio.local",
      dominio: "consorzio.local",
    });
    expect(getConfigAd().host).toBe("dc01.consorzio.local");
    const settings = await archivio.getAllSettings();
    expect(settings[CHIAVI_AD.host]).toBe("dc01.consorzio.local");
    expect(settings[CHIAVI_AD.enabled]).toBe("true");
  });

  it("un campo assente dalla patch resta com'era", async () => {
    await salvaConfigAd(archivio, { host: "dc01", dominio: "consorzio.local" });
    await salvaConfigAd(archivio, { enabled: true });
    expect(getConfigAd().host).toBe("dc01");
    expect(getConfigAd().enabled).toBe(true);
  });

  it("normalizza la patch come leggiConfigAd, non la salva cosi' com'e'", async () => {
    // Un host tutto spazi deve valere "non configurato" subito, non solo dopo
    // un riavvio: senza normalizzare in scrittura, la copia in memoria
    // resterebbe con host non vuoto finche' il processo non viene riavviato
    // e caricaConfigAd rilegge (e taglia) lo stesso valore da zero.
    await salvaConfigAd(archivio, {
      enabled: true,
      host: "  dc01.consorzio.local  ",
      dominio: "  consorzio.local  ",
    });
    expect(getConfigAd().host).toBe("dc01.consorzio.local");
    expect(getConfigAd().dominio).toBe("consorzio.local");
    const settings = await archivio.getAllSettings();
    expect(settings[CHIAVI_AD.host]).toBe("dc01.consorzio.local");
  });

  it("un host tutto spazi vale come non configurato subito dopo il salvataggio", async () => {
    await salvaConfigAd(archivio, {
      enabled: true,
      host: "   ",
      dominio: "consorzio.local",
    });
    expect(adConfigurato(getConfigAd())).toBe(false);
  });

  it("caricaConfigAd rilegge quello che e' stato salvato", async () => {
    await salvaConfigAd(archivio, { host: "dc02", dominio: "x.local", timeoutMs: 9000 });
    const altro = new MemStorage();
    await caricaConfigAd(altro);
    expect(getConfigAd().host).toBe("");
    await caricaConfigAd(archivio);
    expect(getConfigAd().host).toBe("dc02");
    expect(getConfigAd().timeoutMs).toBe(9000);
  });
});
