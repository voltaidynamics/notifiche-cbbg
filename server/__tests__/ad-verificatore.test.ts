import { describe, it, expect } from "vitest";
import {
  passwordVuota,
  esitoDaErroreLdap,
  FakeVerificatoreAd,
} from "../ad/verificatore";

/** Come li manda davvero un domain controller: errore 49 con un codice `data`. */
function erroreBind(data: string) {
  return Object.assign(
    new Error(
      `80090308: LdapErr: DSID-0C0903A9, comment: AcceptSecurityContext error, data ${data}, v3839`,
    ),
    { code: 49 },
  );
}

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

describe("esitoDaErroreLdap", () => {
  it("532 e 773 sono password scaduta", () => {
    expect(esitoDaErroreLdap(erroreBind("532")).esito).toBe("passwordScaduta");
    expect(esitoDaErroreLdap(erroreBind("773")).esito).toBe("passwordScaduta");
  });

  it("533 e 701 sono account disabilitato", () => {
    expect(esitoDaErroreLdap(erroreBind("533")).esito).toBe("accountDisabilitato");
    expect(esitoDaErroreLdap(erroreBind("701")).esito).toBe("accountDisabilitato");
  });

  it("775 e' account bloccato", () => {
    expect(esitoDaErroreLdap(erroreBind("775")).esito).toBe("accountBloccato");
  });

  it("52e e' credenziali non valide", () => {
    expect(esitoDaErroreLdap(erroreBind("52e")).esito).toBe("credenzialiNonValide");
  });

  it("525 resta indistinguibile da una password sbagliata", () => {
    // Distinguerlo direbbe a chi prova se uno username di dominio esiste.
    expect(esitoDaErroreLdap(erroreBind("525")).esito).toBe("credenzialiNonValide");
  });

  it("un 49 senza codice data e' credenziali non valide", () => {
    const err = Object.assign(new Error("Invalid Credentials"), { code: 49 });
    expect(esitoDaErroreLdap(err).esito).toBe("credenzialiNonValide");
  });

  it("un errore di rete e' nonRaggiungibile, non credenziali sbagliate", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:636"), {
      code: "ECONNREFUSED",
    });
    const e = esitoDaErroreLdap(err);
    expect(e.esito).toBe("nonRaggiungibile");
    if (e.esito === "nonRaggiungibile") expect(e.dettaglio).toContain("ECONNREFUSED");
  });

  it("un timeout e' nonRaggiungibile", () => {
    expect(esitoDaErroreLdap(new Error("Operation timed out")).esito).toBe("nonRaggiungibile");
  });

  it("il codice 49 come stringa deve essere riconosciuto come bind fallito", () => {
    // Alcuni LDAP client mandano il codice di errore come stringa anziché numero.
    // Senza normalizzazione, una password scaduta resterebbe indistinguibile da un
    // errore di rete, il che è precisamente quello che questo controllo esiste a prevenire.
    const err = Object.assign(
      new Error(
        `80090308: LdapErr: DSID-0C0903A9, comment: AcceptSecurityContext error, data 532, v3839`,
      ),
      { code: "49" },
    );
    expect(esitoDaErroreLdap(err).esito).toBe("passwordScaduta");
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
