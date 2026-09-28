import { describe, it, expect } from "vitest";
import { puoAccedere, SLUG_GESTIONE_UTENTI, SLUG_GESTIONE_CODICI } from "@shared/permessi-pagina";
import { APP_ROLES } from "@shared/schema";

describe("puoAccedere", () => {
  it("superadmin e admin entrano ovunque, «Gestione Utenti» compresa", () => {
    expect(puoAccedere("superadmin", SLUG_GESTIONE_UTENTI)).toBe(true);
    expect(puoAccedere("admin", SLUG_GESTIONE_UTENTI)).toBe(true);
    expect(puoAccedere("superadmin", "impostazioni")).toBe(true);
    expect(puoAccedere("admin", "impostazioni")).toBe(true);
  });

  it("«Gestione Utenti» e «Gestione Codici» sono chiuse a user e osservatore", () => {
    expect(puoAccedere("user", SLUG_GESTIONE_UTENTI)).toBe(false);
    expect(puoAccedere("osservatore", SLUG_GESTIONE_UTENTI)).toBe(false);
    expect(puoAccedere("user", SLUG_GESTIONE_CODICI)).toBe(false);
    expect(puoAccedere("osservatore", SLUG_GESTIONE_CODICI)).toBe(false);
    expect(puoAccedere("admin", SLUG_GESTIONE_CODICI)).toBe(true);
    expect(puoAccedere("superadmin", SLUG_GESTIONE_CODICI)).toBe(true);
  });

  it("tutte le altre pagine sono aperte a chiunque sia entrato (issue #45)", () => {
    // Tolti i gruppi non esiste più un elenco di pagine concedibili: chi ha un
    // account vede l'applicazione, e a limitare restano i ruoli sulle rotte.
    for (const ruolo of APP_ROLES) {
      for (const slug of ["dashboard", "notifiche", "anagrafiche", "template", "impostazioni"]) {
        expect(puoAccedere(ruolo, slug)).toBe(true);
      }
    }
  });

  it("un ruolo sconosciuto non diventa amministratore", () => {
    // Se un giorno comparisse un ruolo nuovo in `app_users.role`, il default è
    // il meno potente: dentro l'app, fuori dalla gestione utenti.
    expect(puoAccedere("qualcosa-di-nuovo", SLUG_GESTIONE_UTENTI)).toBe(false);
    expect(puoAccedere("qualcosa-di-nuovo", "dashboard")).toBe(true);
  });
});
