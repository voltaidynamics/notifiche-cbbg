import { describe, it, expect } from "vitest";
import {
  puoAccedere,
  SLUG_GESTIONE_UTENTI,
  SLUG_GESTIONE_CODICI,
  SLUG_IMPOSTAZIONI,
  SLUG_INVIA_NOTIFICA,
  SLUG_STORICO,
} from "@shared/permessi-pagina";

describe("puoAccedere", () => {
  it("superadmin e admin entrano ovunque", () => {
    for (const ruolo of ["superadmin", "admin"]) {
      for (const slug of [
        "dashboard", SLUG_INVIA_NOTIFICA, SLUG_STORICO, "anagrafiche", "template",
        SLUG_IMPOSTAZIONI, SLUG_GESTIONE_UTENTI, SLUG_GESTIONE_CODICI,
      ]) {
        expect(puoAccedere(ruolo, slug)).toBe(true);
      }
    }
  });

  it("«Gestione Utenti», «Gestione Codici» e «Impostazioni» sono chiuse a user e osservatore", () => {
    // Impostazioni dalla issue #73: ogni rotta che legge o salva le impostazioni
    // è requireAdmin, quindi a un utente la pagina mostrava solo campi vuoti,
    // modificabili, e un 403 al salvataggio.
    for (const ruolo of ["user", "osservatore"]) {
      expect(puoAccedere(ruolo, SLUG_GESTIONE_UTENTI)).toBe(false);
      expect(puoAccedere(ruolo, SLUG_GESTIONE_CODICI)).toBe(false);
      expect(puoAccedere(ruolo, SLUG_IMPOSTAZIONI)).toBe(false);
    }
  });

  it("l'utente spedisce e scrive template", () => {
    for (const slug of ["dashboard", SLUG_INVIA_NOTIFICA, SLUG_STORICO, "anagrafiche", "template"]) {
      expect(puoAccedere("user", slug)).toBe(true);
    }
  });

  it("l'osservatore vede solo Dashboard, Storico e Anagrafiche (issue #73)", () => {
    for (const slug of ["dashboard", SLUG_STORICO, "anagrafiche"]) {
      expect(puoAccedere("osservatore", slug)).toBe(true);
    }
    expect(puoAccedere("osservatore", SLUG_INVIA_NOTIFICA)).toBe(false);
    expect(puoAccedere("osservatore", "template")).toBe(false);
  });

  it("all'osservatore una pagina nuova resta chiusa finché qualcuno non la apre", () => {
    expect(puoAccedere("osservatore", "pagina-di-domani")).toBe(false);
  });

  it("un ruolo sconosciuto non diventa amministratore", () => {
    // Se un giorno comparisse un ruolo nuovo in `app_users.role`, il default è
    // l'utente: dentro l'app, fuori dalle pagine amministrative.
    expect(puoAccedere("qualcosa-di-nuovo", SLUG_GESTIONE_UTENTI)).toBe(false);
    expect(puoAccedere("qualcosa-di-nuovo", SLUG_IMPOSTAZIONI)).toBe(false);
    expect(puoAccedere("qualcosa-di-nuovo", "dashboard")).toBe(true);
  });
});
