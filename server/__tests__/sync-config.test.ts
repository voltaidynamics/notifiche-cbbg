import { describe, it, expect } from "vitest";
import { leggiConfigWs, entitaConfigurata, urlEntita, chiaveSetting, WS_ENTITIES } from "../sync/config";

describe("WS_ENTITIES", () => {
  it("sono le dieci entita' degli endpoint reali, le ultime due per la seconda gerarchia", () => {
    expect(WS_ENTITIES).toEqual([
      "conduttori", "madriImpianti", "madriOrari", "tratteImpianti",
      "tratteOrari", "legamiLiveImpianti", "legamiLiveOrari", "legamiStagione",
      "roggeMadri", "roggeFiglie",
    ]);
  });
});

describe("urlEntita", () => {
  it("deriva dalla base quando l'entita' non ha una URL propria", () => {
    const c = leggiConfigWs({ "ws.base": "http://192.168.0.100" });
    expect(urlEntita(c, "conduttori"))
      .toBe("http://192.168.0.100/RestTabelle/RestTabelle.svc/getconduttoriconemailetelefono/-");
    expect(urlEntita(c, "tratteOrari"))
      .toBe("http://192.168.0.100/RestTabelle/RestTabelle.svc/getroggeorari/S");
  });

  it("toglie la barra finale della base invece di raddoppiarla", () => {
    const c = leggiConfigWs({ "ws.base": "http://192.168.0.100/" });
    expect(urlEntita(c, "madriOrari"))
      .toBe("http://192.168.0.100/RestTabelle/RestTabelle.svc/getroggemadri/orarigruppiconsegna");
  });

  it("la URL propria vince sulla base", () => {
    const c = leggiConfigWs({
      "ws.base": "http://192.168.0.100",
      [chiaveSetting("legamiLiveOrari", "url")]: "http://192.168.0.106/altro",
    });
    expect(urlEntita(c, "legamiLiveOrari")).toBe("http://192.168.0.106/altro");
    expect(urlEntita(c, "conduttori")).toBe("http://192.168.0.100/RestTabelle/RestTabelle.svc/getconduttoriconemailetelefono/-");
  });

  it("senza base e senza URL propria non c'e' indirizzo", () => {
    expect(urlEntita(leggiConfigWs({}), "conduttori")).toBeNull();
  });

  it("in modalita' file la base non c'entra", () => {
    const c = leggiConfigWs({
      "ws.base": "http://192.168.0.100",
      [chiaveSetting("conduttori", "mode")]: "file",
      [chiaveSetting("conduttori", "path")]: "/tmp/x.json",
    });
    expect(entitaConfigurata(c, "conduttori")).toBe(true);
  });
});

describe("entitaConfigurata", () => {
  it("la sola base basta a configurare ogni entita' HTTP", () => {
    const c = leggiConfigWs({ "ws.base": "http://192.168.0.100" });
    for (const e of WS_ENTITIES) expect(entitaConfigurata(c, e)).toBe(true);
  });

  it("senza niente, nessuna entita' e' configurata", () => {
    const c = leggiConfigWs({});
    for (const e of WS_ENTITIES) expect(entitaConfigurata(c, e)).toBe(false);
  });
});
