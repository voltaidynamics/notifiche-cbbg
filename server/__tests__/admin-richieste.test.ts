// Issue #116: lo username di dominio non si tocca, e una richiesta evasa sparisce.

import { describe, it, expect } from "vitest";
import { erroreCambioUsername, erroreUsernameRichiesta, richiesteInAttesa } from "../adminRoutes";

const richiesta = (id: number, username: string) => ({
  id,
  username,
  primoTentativo: new Date("2026-10-06T08:00:00Z"),
  ultimoTentativo: new Date("2026-10-06T08:00:00Z"),
  tentativi: 1,
});

describe("erroreCambioUsername", () => {
  it("un utente locale può cambiare username", () => {
    expect(erroreCambioUsername({ username: "mrossi", authSource: "locale" }, "m.rossi")).toBeNull();
  });

  // Lo username di un utente AD è quello di dominio: cambiato, il bind
  // fallirebbe per sempre e la persona resterebbe fuori.
  it("un utente Active Directory no", () => {
    expect(erroreCambioUsername({ username: "m.rossi", authSource: "ad" }, "mario.rossi")).toMatch(/Active Directory/);
  });

  it("rimandare lo stesso username, o non mandarlo, non è un cambio", () => {
    expect(erroreCambioUsername({ username: "m.rossi", authSource: "ad" }, "m.rossi")).toBeNull();
    expect(erroreCambioUsername({ username: "m.rossi", authSource: "ad" }, undefined)).toBeNull();
  });
});

describe("erroreUsernameRichiesta", () => {
  it("senza richiesta non c'è niente da controllare", () => {
    expect(erroreUsernameRichiesta(undefined, [], "chiunque")).toBeNull();
  });

  it("lo username deve essere esattamente quello arrivato da AD", () => {
    const elenco = [richiesta(7, "m.rossi")];
    expect(erroreUsernameRichiesta(7, elenco, "m.rossi")).toBeNull();
    expect(erroreUsernameRichiesta(7, elenco, "M.Rossi")).toMatch(/Active Directory/);
  });

  it("una richiesta che non c'è più è un errore, non un via libera", () => {
    expect(erroreUsernameRichiesta(7, [], "m.rossi")).toMatch(/non esiste più/);
  });
});

describe("richiesteInAttesa", () => {
  // Una richiesta il cui username è già fra gli utenti è evasa, da qualunque
  // strada sia arrivato l'utente: non deve restare nell'elenco.
  it("toglie chi è già fra gli utenti", () => {
    const elenco = [richiesta(1, "m.rossi"), richiesta(2, "l.bianchi")];
    expect(richiesteInAttesa(elenco, ["m.rossi", "dani"]).map((r) => r.id)).toEqual([2]);
  });
});
