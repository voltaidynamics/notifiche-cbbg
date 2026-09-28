import { describe, it, expect } from "vitest";
import { autentica, rispostaLogin, type UtenteAutenticabile, type DipendenzeAutenticazione } from "../auth";
import { FakeVerificatoreAd } from "../ad/verificatore";

function utente(over: Partial<UtenteAutenticabile> = {}): UtenteAutenticabile {
  return {
    id: 1,
    username: "m.rossi",
    passwordHash: "hash-buono",
    role: "user",
    isActive: true,
    authSource: "locale",
    ...over,
  };
}

function deps(over: Partial<DipendenzeAutenticazione> = {}): DipendenzeAutenticazione & {
  richieste: string[];
} {
  const richieste: string[] = [];
  return {
    trovaUtente: async () => undefined,
    confrontaPassword: async (pw, hash) => hash === `hash-${pw}`,
    verificatoreAd: null,
    registraRichiestaAccesso: async (u) => {
      richieste.push(u);
    },
    richieste,
    ...over,
  } as DipendenzeAutenticazione & { richieste: string[] };
}

describe("autentica — utente locale", () => {
  it("entra con la password giusta", async () => {
    const d = deps({ trovaUtente: async () => utente({ passwordHash: "hash-buono" }) });
    const r = await autentica("m.rossi", "buono", d);
    expect(r.esito).toBe("ok");
    if (r.esito === "ok") expect(r.utente.username).toBe("m.rossi");
  });

  it("non entra con la password sbagliata", async () => {
    const d = deps({ trovaUtente: async () => utente({ passwordHash: "hash-buono" }) });
    expect((await autentica("m.rossi", "sbagliata", d)).esito).toBe("credenzialiNonValide");
  });

  it("NON consulta AD nemmeno quando bcrypt fallisce", async () => {
    // È il buco strutturale che auth_source esiste per chiudere: se una riga
    // locale ripiegasse su AD, un account disabilitato sul dominio continuerebbe
    // a entrare — o peggio, il contrario.
    const fake = new FakeVerificatoreAd({ esito: "ok" });
    const d = deps({
      trovaUtente: async () => utente({ passwordHash: "hash-buono" }),
      verificatoreAd: fake,
    });
    expect((await autentica("m.rossi", "sbagliata", d)).esito).toBe("credenzialiNonValide");
    expect(fake.chiamate).toHaveLength(0);
  });

  it("una riga locale senza hash non entra mai", async () => {
    // Non basta verificare l'esito: un `confrontaPassword` finto che confronta
    // con `null` torna `false` comunque, e la prova passerebbe pure senza il
    // guard che impedisce a bcrypt di ricevere un hash nullo (dove
    // `compare(pw, null)` lancerebbe davvero). Si conta la chiamata, come già
    // fa il gemello lato AD poco sopra.
    let confronti = 0;
    const d = deps({
      trovaUtente: async () => utente({ passwordHash: null }),
      confrontaPassword: async () => {
        confronti++;
        return false;
      },
    });
    expect((await autentica("m.rossi", "qualunque", d)).esito).toBe("credenzialiNonValide");
    expect(confronti).toBe(0);
  });

  it("isActive falso nega prima di tutto", async () => {
    const d = deps({ trovaUtente: async () => utente({ isActive: false }) });
    expect((await autentica("m.rossi", "buono", d)).esito).toBe("accountDisabilitatoApp");
  });
});

describe("autentica — utente AD", () => {
  function depsAd(esito: Parameters<FakeVerificatoreAd["imposta"]>[1]) {
    const fake = new FakeVerificatoreAd();
    fake.imposta("m.rossi", esito);
    return {
      d: deps({
        trovaUtente: async () => utente({ authSource: "ad", passwordHash: null }),
        verificatoreAd: fake,
      }),
      fake,
    };
  }

  it("entra quando il bind riesce", async () => {
    const { d } = depsAd({ esito: "ok" });
    const r = await autentica("m.rossi", "pw", d);
    expect(r.esito).toBe("ok");
    if (r.esito === "ok") expect(r.utente.role).toBe("user");
  });

  it("NON guarda l'hash", async () => {
    const fake = new FakeVerificatoreAd();
    fake.imposta("m.rossi", { esito: "credenzialiNonValide" });
    let confronti = 0;
    const d = deps({
      trovaUtente: async () => utente({ authSource: "ad", passwordHash: null }),
      verificatoreAd: fake,
      confrontaPassword: async () => {
        confronti++;
        return true;
      },
    });
    expect((await autentica("m.rossi", "pw", d)).esito).toBe("credenzialiNonValide");
    expect(confronti).toBe(0);
  });

  it("password scaduta arriva fino in fondo", async () => {
    const { d } = depsAd({ esito: "passwordScaduta" });
    expect((await autentica("m.rossi", "pw", d)).esito).toBe("passwordScaduta");
  });

  it("account disabilitato su AD e' distinto da quello disabilitato nell'app", async () => {
    const { d } = depsAd({ esito: "accountDisabilitato" });
    expect((await autentica("m.rossi", "pw", d)).esito).toBe("accountDisabilitatoAd");
  });

  it("account bloccato arriva fino in fondo", async () => {
    const { d } = depsAd({ esito: "accountBloccato" });
    expect((await autentica("m.rossi", "pw", d)).esito).toBe("accountBloccato");
  });

  it("DC irraggiungibile non diventa 'credenziali non valide'", async () => {
    const { d } = depsAd({ esito: "nonRaggiungibile", dettaglio: "ECONNREFUSED" });
    expect((await autentica("m.rossi", "pw", d)).esito).toBe("adNonRaggiungibile");
  });

  it("con AD spento un utente ad non entra e non riceve un 401 fuorviante", async () => {
    const d = deps({ trovaUtente: async () => utente({ authSource: "ad", passwordHash: null }) });
    expect((await autentica("m.rossi", "pw", d)).esito).toBe("adNonRaggiungibile");
  });
});

describe("autentica — utente sconosciuto", () => {
  it("bind riuscito significa 'esisti ma non sei abilitato', e registra la richiesta", async () => {
    const fake = new FakeVerificatoreAd();
    fake.imposta("g.bianchi", { esito: "ok" });
    const d = deps({ verificatoreAd: fake });
    const r = await autentica("g.bianchi", "pw", d);
    expect(r.esito).toBe("nonAbilitato");
    expect(d.richieste).toEqual(["g.bianchi"]);
  });

  it("bind fallito e' un 401 generico e NON registra niente", async () => {
    const fake = new FakeVerificatoreAd({ esito: "credenzialiNonValide" });
    const d = deps({ verificatoreAd: fake });
    expect((await autentica("g.bianchi", "pw", d)).esito).toBe("credenzialiNonValide");
    expect(d.richieste).toEqual([]);
  });

  it("a chi non e' abilitato non si dice che la sua password di dominio e' scaduta", async () => {
    const fake = new FakeVerificatoreAd();
    fake.imposta("g.bianchi", { esito: "passwordScaduta" });
    const d = deps({ verificatoreAd: fake });
    expect((await autentica("g.bianchi", "pw", d)).esito).toBe("credenzialiNonValide");
    expect(d.richieste).toEqual([]);
  });

  it("il DC giu' resta distinguibile anche per uno sconosciuto", async () => {
    const fake = new FakeVerificatoreAd({ esito: "nonRaggiungibile", dettaglio: "timeout" });
    const d = deps({ verificatoreAd: fake });
    expect((await autentica("g.bianchi", "pw", d)).esito).toBe("adNonRaggiungibile");
    expect(d.richieste).toEqual([]);
  });

  it("con AD spento uno sconosciuto e' un 401 secco", async () => {
    expect((await autentica("g.bianchi", "pw", deps())).esito).toBe("credenzialiNonValide");
  });

  it("un errore nella registrazione della richiesta non trasforma il 403 in un 500", async () => {
    // La scrittura di `registraRichiestaAccesso` è solo bookkeeping: se il
    // database ha un intoppo proprio lì, la risposta corretta resta comunque
    // "esisti su AD ma non sei abilitato", non un errore generico che
    // nasconde l'unica informazione utile all'operatore.
    const fake = new FakeVerificatoreAd();
    fake.imposta("g.bianchi", { esito: "ok" });
    const d = deps({
      verificatoreAd: fake,
      registraRichiestaAccesso: async () => {
        throw new Error("database non raggiungibile");
      },
    });
    const r = await autentica("g.bianchi", "pw", d);
    expect(r.esito).toBe("nonAbilitato");
    if (r.esito === "nonAbilitato") expect(r.username).toBe("g.bianchi");
  });
});

describe("autentica — password vuota", () => {
  it("non arriva mai al verificatore", async () => {
    const fake = new FakeVerificatoreAd({ esito: "ok" });
    const d = deps({ verificatoreAd: fake });
    expect((await autentica("g.bianchi", "   ", d)).esito).toBe("credenzialiNonValide");
    expect(fake.chiamate).toHaveLength(0);
  });

  it("uno username vuoto non arriva al verificatore", async () => {
    const fake = new FakeVerificatoreAd({ esito: "ok" });
    const d = deps({ verificatoreAd: fake });
    expect((await autentica("  ", "pw", d)).esito).toBe("credenzialiNonValide");
    expect(fake.chiamate).toHaveLength(0);
  });
});

describe("rispostaLogin", () => {
  it("le credenziali sbagliate sono 401", () => {
    expect(rispostaLogin({ esito: "credenzialiNonValide" }).status).toBe(401);
  });

  it("non abilitato e' 403 e porta il suo codice", () => {
    const r = rispostaLogin({ esito: "nonAbilitato", username: "g.bianchi" });
    expect(r.status).toBe(403);
    expect(r.corpo.codice).toBe("nonAbilitato");
    expect(r.corpo.message).toContain("amministratore");
  });

  it("AD irraggiungibile e' 503, non 401", () => {
    const r = rispostaLogin({ esito: "adNonRaggiungibile", dettaglio: "x" });
    expect(r.status).toBe(503);
    expect(r.corpo.codice).toBe("adNonRaggiungibile");
  });

  it("il dettaglio tecnico non finisce nel messaggio all'utente", () => {
    const r = rispostaLogin({ esito: "adNonRaggiungibile", dettaglio: "connect ECONNREFUSED 10.0.0.5:636" });
    expect(r.corpo.message).not.toContain("10.0.0.5");
  });

  it("password scaduta e' 403 col suo codice", () => {
    const r = rispostaLogin({ esito: "passwordScaduta" });
    expect(r.status).toBe(403);
    expect(r.corpo.codice).toBe("passwordScaduta");
  });
});
