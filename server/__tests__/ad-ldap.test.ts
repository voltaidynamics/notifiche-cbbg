import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { Client } from "ldapts";
import { urlDa, opzioniTls, upn, LdapVerificatoreAd, provaConnessione } from "../ad/ldap";
import { leggiConfigAd, CHIAVI_AD, type ConfigAd } from "../config-ad";

function config(over: Partial<ConfigAd> = {}): ConfigAd {
  return {
    ...leggiConfigAd({
      [CHIAVI_AD.enabled]: "true",
      [CHIAVI_AD.host]: "dc01.consorzio.local",
      [CHIAVI_AD.dominio]: "consorzio.local",
    }),
    ...over,
  };
}

describe("urlDa", () => {
  it("ldaps usa lo schema ldaps", () => {
    expect(urlDa(config({ tls: "ldaps", port: 636 }))).toBe("ldaps://dc01.consorzio.local:636");
  });

  it("starttls parte in chiaro sulla 389 e alza il TLS dopo", () => {
    expect(urlDa(config({ tls: "starttls", port: 389 }))).toBe("ldap://dc01.consorzio.local:389");
  });

  it("nessuno usa ldap", () => {
    expect(urlDa(config({ tls: "nessuno", port: 389 }))).toBe("ldap://dc01.consorzio.local:389");
  });
});

describe("opzioniTls", () => {
  it("senza CA non passa nessun certificato ma verifica comunque", () => {
    expect(opzioniTls(config())).toEqual({
      rejectUnauthorized: true,
      servername: "dc01.consorzio.local",
    });
  });

  it("con la CA la passa come array", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
    expect(opzioniTls(config({ caPem: pem }))).toEqual({
      ca: [pem],
      rejectUnauthorized: true,
      servername: "dc01.consorzio.local",
    });
  });

  it("rejectUnauthorized false viene rispettato", () => {
    expect(opzioniTls(config({ rejectUnauthorized: false })).rejectUnauthorized).toBe(false);
  });

  it("passa sempre servername, anche con un IP letterale come host", () => {
    // Senza questo campo Node sceglie il nome da verificare come
    // `servername || host || socket._host || "localhost"`: con un IP
    // `socket._host` resta null e la verifica del certificato cade su
    // "localhost", che nessuna CA vera soddisfa.
    expect(opzioniTls(config({ host: "10.0.0.5" })).servername).toBe("10.0.0.5");
  });
});

describe("upn", () => {
  it("aggiunge il suffisso di dominio", () => {
    expect(upn("m.rossi", "consorzio.local")).toBe("m.rossi@consorzio.local");
  });

  it("non lo aggiunge due volte", () => {
    expect(upn("m.rossi@consorzio.local", "consorzio.local")).toBe("m.rossi@consorzio.local");
  });

  it("toglie gli spazi intorno allo username", () => {
    expect(upn("  m.rossi  ", "consorzio.local")).toBe("m.rossi@consorzio.local");
  });
});

describe("LdapVerificatoreAd", () => {
  it("rifiuta la password vuota senza toccare la rete", async () => {
    // Host inesistente di proposito: se aprisse una connessione, il test
    // fallirebbe per timeout invece di tornare subito.
    const v = new LdapVerificatoreAd(() => config({ host: "10.255.255.1", timeoutMs: 30000 }));
    const inizio = Date.now();
    expect(await v.verifica("m.rossi", "   ")).toEqual({ esito: "credenzialiNonValide" });
    expect(Date.now() - inizio).toBeLessThan(500);
  });

  it("con AD non configurato non tenta nemmeno la connessione", async () => {
    const v = new LdapVerificatoreAd(() => config({ enabled: false, timeoutMs: 30000 }));
    const inizio = Date.now();
    const e = await v.verifica("m.rossi", "pw");
    expect(e.esito).toBe("nonRaggiungibile");
    expect(Date.now() - inizio).toBeLessThan(500);
  });

  it("rilegge la configurazione a ogni tentativo", async () => {
    // Se catturasse la config alla costruzione, salvare le impostazioni
    // dall'interfaccia non avrebbe effetto fino al riavvio: e' esattamente il
    // bug che rese inerti le credenziali SMS salvate (vedi server/sms.ts).
    let attuale = config({ enabled: false });
    const v = new LdapVerificatoreAd(() => attuale);
    expect(await v.verifica("x", "pw")).toEqual({
      esito: "nonRaggiungibile",
      dettaglio: "Active Directory non è configurata",
    });

    // Porta 1 su localhost: rifiuta la connessione all'istante, niente attesa.
    attuale = config({ enabled: true, host: "127.0.0.1", port: 1, timeoutMs: 1000 });
    const acceso = await v.verifica("x", "pw");
    expect(acceso.esito).toBe("nonRaggiungibile");
    if (acceso.esito === "nonRaggiungibile") {
      // Non e' piu' il messaggio di "non configurata": la config nuova e' stata
      // letta davvero. Con la config catturata alla costruzione, questo fallisce.
      expect(acceso.dettaglio).not.toBe("Active Directory non è configurata");
    }
  });

  describe("socket aperto per modalità TLS", () => {
    // Uno stub che non emette mai 'connect'/'secureConnect' né 'error': il
    // tentativo si ferma per timeout, mai per una vera connessione di rete.
    // Serve solo a osservare quale fabbrica ldapts chiama, non a completare un
    // bind. Un EventEmitter reale basta: ldapts chiama solo on/once/removeAllListeners
    // (che eredita) più end()/destroy() sul socket per chiuderlo.
    function socketFinto() {
      const s = new EventEmitter() as unknown as EventEmitter & {
        connecting: boolean;
        readyState: string;
        end: () => void;
        destroy: () => void;
      };
      s.connecting = true;
      s.readyState = "opening";
      s.end = () => {};
      s.destroy = () => {};
      return s;
    }

    function fabbricheSpia() {
      return {
        createConnection: vi.fn(() => socketFinto() as never),
        createSecureConnection: vi.fn(() => socketFinto() as never),
      };
    }

    it("ldaps apre un socket sicuro, mai uno in chiaro", async () => {
      const fabbriche = fabbricheSpia();
      const v = new LdapVerificatoreAd(
        () => config({ tls: "ldaps", host: "10.255.255.1", port: 636, timeoutMs: 50 }),
        fabbriche,
      );
      await v.verifica("m.rossi", "pw");
      expect(fabbriche.createSecureConnection).toHaveBeenCalledTimes(1);
      expect(fabbriche.createConnection).not.toHaveBeenCalled();
    });

    it("starttls apre un socket in chiaro, mai uno sicuro", async () => {
      const fabbriche = fabbricheSpia();
      const v = new LdapVerificatoreAd(
        () => config({ tls: "starttls", host: "10.255.255.1", port: 389, timeoutMs: 50 }),
        fabbriche,
      );
      await v.verifica("m.rossi", "pw");
      expect(fabbriche.createConnection).toHaveBeenCalledTimes(1);
      expect(fabbriche.createSecureConnection).not.toHaveBeenCalled();
    });

    it("nessuno apre un socket in chiaro, mai uno sicuro", async () => {
      const fabbriche = fabbricheSpia();
      const v = new LdapVerificatoreAd(
        () => config({ tls: "nessuno", host: "10.255.255.1", port: 389, timeoutMs: 50 }),
        fabbriche,
      );
      await v.verifica("m.rossi", "pw");
      expect(fabbriche.createConnection).toHaveBeenCalledTimes(1);
      expect(fabbriche.createSecureConnection).not.toHaveBeenCalled();
    });
  });
});

function erroreLdap(code: number, message: string): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = code;
  return err;
}

describe("provaConnessione", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("un rifiuto di autenticazione anonima (48) è comunque raggiungibile", async () => {
    // Il server ha risposto con un codice LDAP: canale e TLS funzionano,
    // anche se la risposta è un rifiuto. Solo 49 era distinto prima del fix.
    vi.spyOn(Client.prototype, "bind").mockRejectedValueOnce(
      erroreLdap(48, "inappropriateAuthentication"),
    );
    const r = await provaConnessione(config());
    expect(r.raggiungibile).toBe(true);
  });

  it("unwillingToPerform (53) è comunque raggiungibile", async () => {
    vi.spyOn(Client.prototype, "bind").mockRejectedValueOnce(
      erroreLdap(53, "unwillingToPerform"),
    );
    const r = await provaConnessione(config());
    expect(r.raggiungibile).toBe(true);
  });

  it("con credenziali, non dipende dal flag enabled", async () => {
    // Flusso reale: l'amministratore compila host/dominio/credenziali e le
    // prova PRIMA di accendere l'interruttore. host e dominio sono già validi
    // (config() li imposta), solo enabled è false.
    vi.spyOn(Client.prototype, "bind").mockResolvedValue(undefined);
    const r = await provaConnessione(config({ enabled: false }), {
      username: "m.rossi",
      password: "pw",
    });
    expect(r.raggiungibile).toBe(true);
    expect(r.bind).not.toEqual({
      esito: "nonRaggiungibile",
      dettaglio: "Active Directory non è configurata",
    });
  });
});
