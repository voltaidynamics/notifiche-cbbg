import { describe, it, expect } from "vitest";
import {
  REQUISITI_PASSWORD,
  requisitiMancanti,
  errorePasswordLocale,
  passwordLocaleSchema,
} from "@shared/password";
import { insertAppUserSchema } from "@shared/schema";

const VALIDA = "Canale-Irriguo1";

describe("requisiti della password locale (issue #99)", () => {
  it("sono cinque: lunghezza, maiuscola, minuscola, numero, speciale", () => {
    expect(REQUISITI_PASSWORD.map((r) => r.id)).toEqual([
      "lunghezza",
      "maiuscola",
      "minuscola",
      "numero",
      "speciale",
    ]);
  });

  it("una password che li rispetta tutti non ha mancanze", () => {
    expect(requisitiMancanti(VALIDA)).toEqual([]);
    expect(errorePasswordLocale(VALIDA)).toBeNull();
    expect(passwordLocaleSchema.safeParse(VALIDA).success).toBe(true);
  });

  it("12 caratteri bastano, 11 no", () => {
    expect(requisitiMancanti("Abcdefgh1-xy").map((r) => r.id)).toEqual([]);
    expect(requisitiMancanti("Abcdefgh1-x").map((r) => r.id)).toEqual(["lunghezza"]);
  });

  it.each([
    ["canale-irriguo1", "maiuscola"],
    ["CANALE-IRRIGUO1", "minuscola"],
    ["Canale-Irriguo!", "numero"],
    ["CanaleIrriguo12", "speciale"],
  ])("%s manca di %s", (password, manca) => {
    expect(requisitiMancanti(password).map((r) => r.id)).toEqual([manca]);
  });

  it("lo spazio e le lettere accentate contano come carattere speciale", () => {
    expect(requisitiMancanti("Canale Irriguo1")).toEqual([]);
    expect(requisitiMancanti("CanaleIrriguò12")).toEqual([]);
  });

  it("il messaggio elenca tutto quello che manca, in italiano", () => {
    expect(errorePasswordLocale("abc")).toBe(
      "La password deve contenere almeno 12 caratteri, una lettera maiuscola, un numero e un carattere speciale.",
    );
    expect(errorePasswordLocale("canale-irriguo1")).toBe(
      "La password deve contenere una lettera maiuscola.",
    );
  });

  it("lo schema zod rifiuta con lo stesso messaggio", () => {
    const r = passwordLocaleSchema.safeParse("abc");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.errors[0].message).toBe(errorePasswordLocale("abc"));
  });

  it("insertAppUserSchema applica la regola, e resta facoltativa per AD", () => {
    expect(insertAppUserSchema.safeParse({ username: "mrossi", password: "password1" }).success).toBe(false);
    expect(insertAppUserSchema.safeParse({ username: "mrossi", password: VALIDA }).success).toBe(true);
    expect(insertAppUserSchema.safeParse({ username: "mrossi", authSource: "ad" }).success).toBe(true);
  });
});
