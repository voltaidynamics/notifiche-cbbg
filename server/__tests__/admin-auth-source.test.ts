import { describe, it, expect } from "vitest";
import { validaCambioSorgente, toglierebbeUltimoSuperadminLocale } from "../adminRoutes";
import { errorePasswordLocale } from "@shared/password";

describe("validaCambioSorgente", () => {
  it("nessun cambio, nessuna password: tutto invariato", () => {
    const r = validaCambioSorgente("locale", undefined, undefined);
    expect(r).toEqual({ ok: true, authSource: "locale", passwordHash: "invariato" });
  });

  it("utente locale che cambia password", () => {
    const r = validaCambioSorgente("locale", undefined, "Nuova-password1");
    expect(r).toEqual({ ok: true, authSource: "locale", passwordHash: "nuova" });
  });

  it("un utente AD non puo' ricevere una password", () => {
    // Consentirlo ricrea la doppia credenziale che il consorzio non puo'
    // revocare dal dominio: e' il buco che auth_source esiste per chiudere.
    const r = validaCambioSorgente("ad", undefined, "qualunque");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain("Active Directory");
  });

  it("nemmeno passando a AD nella stessa richiesta", () => {
    expect(validaCambioSorgente("locale", "ad", "qualunque").ok).toBe(false);
  });

  it("locale -> ad azzera l'hash", () => {
    expect(validaCambioSorgente("locale", "ad", undefined)).toEqual({
      ok: true,
      authSource: "ad",
      passwordHash: "azzera",
    });
  });

  it("ad -> locale senza password e' un errore", () => {
    const r = validaCambioSorgente("ad", "locale", undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toContain("password");
  });

  it("ad -> locale con password va bene", () => {
    expect(validaCambioSorgente("ad", "locale", "Nuova-password1")).toEqual({
      ok: true,
      authSource: "locale",
      passwordHash: "nuova",
    });
  });

  // Issue #99: la nuova password di un utente locale deve rispettare i
  // requisiti, sia cambiandola sia passando da AD a locale. Il messaggio è
  // quello della regola condivisa, che elenca cosa manca.
  it("una nuova password locale debole viene rifiutata con l'elenco di cosa manca", () => {
    const r = validaCambioSorgente("locale", undefined, "nuovapassword");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errore).toBe(errorePasswordLocale("nuovapassword"));
  });

  it("anche passando da AD a locale", () => {
    expect(validaCambioSorgente("ad", "locale", "corta").ok).toBe(false);
  });

  it("password vuota in modifica: si tiene quella salvata, nessun requisito da verificare", () => {
    expect(validaCambioSorgente("locale", undefined, "")).toEqual({
      ok: true,
      authSource: "locale",
      passwordHash: "invariato",
    });
  });

  // Le due prove seguenti fissano la forma esplicita ("ridichiaro la stessa
  // sorgente") come equivalente a quella implicita (`richiesta` assente): se
  // domani qualcuno toccasse `richiesta ?? attuale`, questi due casi devono
  // continuare a restare "invariato".
  it("ad -> ad esplicito: invariato, come lasciare richiesta assente", () => {
    expect(validaCambioSorgente("ad", "ad", undefined)).toEqual({
      ok: true,
      authSource: "ad",
      passwordHash: "invariato",
    });
  });

  it("locale -> locale esplicito: invariato, come lasciare richiesta assente", () => {
    expect(validaCambioSorgente("locale", "locale", undefined)).toEqual({
      ok: true,
      authSource: "locale",
      passwordHash: "invariato",
    });
  });
});

describe("toglierebbeUltimoSuperadminLocale", () => {
  const ultimoSuperadminLocale = { role: "superadmin", authSource: "locale" as const, isActive: true };

  it("l'ultimo superadmin locale non puo' essere convertito, disattivato o eliminato: nessun altro protegge", () => {
    expect(toglierebbeUltimoSuperadminLocale(ultimoSuperadminLocale, 0)).toBe(true);
  });

  it("un secondo superadmin locale attivo rende il cambiamento consentito", () => {
    expect(toglierebbeUltimoSuperadminLocale(ultimoSuperadminLocale, 1)).toBe(false);
  });

  it("un admin locale (non superadmin) non conta come 'ultimo baluardo': il cambiamento e' irrilevante", () => {
    expect(toglierebbeUltimoSuperadminLocale({ role: "admin", authSource: "locale", isActive: true }, 0)).toBe(
      false,
    );
  });

  it("un superadmin locale gia' inattivo non protegge nulla: non conta come baluardo", () => {
    expect(
      toglierebbeUltimoSuperadminLocale({ role: "superadmin", authSource: "locale", isActive: false }, 0),
    ).toBe(false);
  });

  it("un superadmin AD non e' mai il baluardo locale, anche senza altri superadmin", () => {
    expect(toglierebbeUltimoSuperadminLocale({ role: "superadmin", authSource: "ad", isActive: true }, 0)).toBe(
      false,
    );
  });
});
