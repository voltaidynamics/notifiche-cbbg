import { describe, it, expect } from "vitest";
import { rimappaSlugAnagrafiche } from "../migra-slug";

describe("rimappaSlugAnagrafiche", () => {
  it("sostituisce un solo slug rimosso con anagrafiche", () => {
    expect(rimappaSlugAnagrafiche(["dashboard", "consorziati"]))
      .toEqual(["dashboard", "anagrafiche"]);
  });

  it("collassa più slug rimossi in un solo anagrafiche", () => {
    expect(rimappaSlugAnagrafiche(["tratte", "consorziati", "importa", "notifiche"]))
      .toEqual(["anagrafiche", "notifiche"]);
  });

  it("lascia invariato un elenco senza slug rimossi", () => {
    expect(rimappaSlugAnagrafiche(["dashboard", "notifiche"]))
      .toEqual(["dashboard", "notifiche"]);
  });

  it("non duplica anagrafiche se già presente", () => {
    expect(rimappaSlugAnagrafiche(["anagrafiche", "tratte"]))
      .toEqual(["anagrafiche"]);
  });

  it("gestisce l'elenco vuoto", () => {
    expect(rimappaSlugAnagrafiche([])).toEqual([]);
  });
});
