import { describe, it, expect } from "vitest";
import {
  passwordVuota,
  FakeVerificatoreAd,
} from "../ad/verificatore";

describe("passwordVuota", () => {
  it("vera per stringa vuota e per soli spazi", () => {
    expect(passwordVuota("")).toBe(true);
    expect(passwordVuota("   ")).toBe(true);
    expect(passwordVuota("\t\n")).toBe(true);
  });

  it("falsa per una password vera", () => {
    expect(passwordVuota("segreto")).toBe(false);
  });
});

describe("FakeVerificatoreAd", () => {
  it("restituisce l'esito impostato e registra la chiamata", async () => {
    const fake = new FakeVerificatoreAd();
    fake.imposta("m.rossi", { esito: "ok" });
    expect(await fake.verifica("m.rossi", "pw")).toEqual({ esito: "ok" });
    expect(fake.chiamate).toEqual([{ username: "m.rossi", password: "pw" }]);
  });

  it("il predefinito e' credenziali non valide", async () => {
    const fake = new FakeVerificatoreAd();
    expect(await fake.verifica("ignoto", "pw")).toEqual({ esito: "credenzialiNonValide" });
  });
});
