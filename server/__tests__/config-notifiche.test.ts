import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import {
  leggiConfigEmail,
  leggiConfigSms,
  emailConfigurata,
  smsConfigurata,
  caricaConfigNotifiche,
  salvaConfigEmail,
  salvaConfigSms,
  getConfigEmail,
  getConfigSms,
  CHIAVI_EMAIL,
  CHIAVI_SMS,
} from "../config-notifiche";

const ENV_VUOTO = {} as NodeJS.ProcessEnv;

describe("leggiConfigEmail", () => {
  it("usa i valori del database quando ci sono", () => {
    const c = leggiConfigEmail(
      {
        [CHIAVI_EMAIL.service]: "smtp",
        [CHIAVI_EMAIL.user]: "db@example.com",
        [CHIAVI_EMAIL.password]: "pw-db",
        [CHIAVI_EMAIL.smtpHost]: "smtp.example.com",
        [CHIAVI_EMAIL.smtpPort]: "465",
        [CHIAVI_EMAIL.smtpSecure]: "true",
      },
      { EMAIL_USER: "env@example.com", EMAIL_PASSWORD: "pw-env" } as NodeJS.ProcessEnv,
    );
    expect(c).toEqual({
      service: "smtp",
      user: "db@example.com",
      password: "pw-db",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecure: true,
    });
  });

  it("ripiega sulle variabili d'ambiente quando il database e' vuoto", () => {
    const c = leggiConfigEmail({}, {
      EMAIL_SERVICE: "smtp",
      EMAIL_USER: "env@example.com",
      EMAIL_PASSWORD: "pw-env",
      SMTP_HOST: "mail.env.it",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
    } as NodeJS.ProcessEnv);
    expect(c.user).toBe("env@example.com");
    expect(c.password).toBe("pw-env");
    expect(c.smtpHost).toBe("mail.env.it");
    expect(c.smtpPort).toBe(587);
    expect(c.smtpSecure).toBe(false);
  });

  it("il default e' gmail e i campi smtp restano nulli", () => {
    const c = leggiConfigEmail({}, ENV_VUOTO);
    expect(c).toEqual({
      service: "gmail",
      user: "",
      password: "",
      smtpHost: null,
      smtpPort: null,
      smtpSecure: false,
    });
  });

  it("ignora una porta non numerica invece di propagare NaN", () => {
    const c = leggiConfigEmail({ [CHIAVI_EMAIL.smtpPort]: "non-un-numero" }, ENV_VUOTO);
    expect(c.smtpPort).toBeNull();
  });

  it("tratta una stringa vuota nel database come valore assente", () => {
    const c = leggiConfigEmail(
      { [CHIAVI_EMAIL.user]: "", [CHIAVI_EMAIL.password]: "  " },
      { EMAIL_USER: "env@example.com", EMAIL_PASSWORD: "pw-env" } as NodeJS.ProcessEnv,
    );
    expect(c.user).toBe("env@example.com");
    expect(c.password).toBe("pw-env");
  });
});

describe("leggiConfigSms", () => {
  it("usa i valori del database quando ci sono", () => {
    const c = leggiConfigSms(
      {
        [CHIAVI_SMS.clientid]: "cbbg-db",
        [CHIAVI_SMS.password]: "pw-db",
      },
      { SMS_CLIENTID: "cbbg-env" } as NodeJS.ProcessEnv,
    );
    expect(c).toEqual({ clientid: "cbbg-db", password: "pw-db" });
  });

  it("ripiega sulle variabili d'ambiente", () => {
    const c = leggiConfigSms({}, {
      SMS_CLIENTID: "cbbg-env",
      SMS_PASSWORD: "pw-env",
    } as NodeJS.ProcessEnv);
    expect(c).toEqual({ clientid: "cbbg-env", password: "pw-env" });
  });
});

describe("emailConfigurata / smsConfigurata", () => {
  it("richiedono utente e password per l'email", () => {
    expect(emailConfigurata(leggiConfigEmail({}, ENV_VUOTO))).toBe(false);
    expect(emailConfigurata({ ...leggiConfigEmail({}, ENV_VUOTO), user: "a@b.it" })).toBe(false);
    expect(
      emailConfigurata({ ...leggiConfigEmail({}, ENV_VUOTO), user: "a@b.it", password: "pw" }),
    ).toBe(true);
  });

  it("richiedono Client ID e password per gli SMS", () => {
    expect(smsConfigurata({ clientid: "cbbg", password: "" })).toBe(false);
    expect(smsConfigurata({ clientid: "cbbg", password: "segreta" })).toBe(true);
  });
});

describe("persistenza della configurazione", () => {
  let s: MemStorage;
  beforeEach(async () => {
    s = new MemStorage();
    await caricaConfigNotifiche(s, ENV_VUOTO);
  });

  it("salva l'email sul database e la rende subito attiva", async () => {
    await salvaConfigEmail(s, {
      service: "smtp",
      user: "a@b.it",
      password: "segreta",
      smtpHost: "mail.b.it",
      smtpPort: 2525,
      smtpSecure: true,
    });

    expect(getConfigEmail().user).toBe("a@b.it");
    expect(getConfigEmail().smtpPort).toBe(2525);

    // e sopravvive a un riavvio: rileggendo dal database si ritrova tutto
    const settings = await s.getAllSettings();
    expect(settings[CHIAVI_EMAIL.user]).toBe("a@b.it");
    expect(settings[CHIAVI_EMAIL.password]).toBe("segreta");
    expect(settings[CHIAVI_EMAIL.smtpPort]).toBe("2525");
    expect(leggiConfigEmail(settings, ENV_VUOTO).user).toBe("a@b.it");
  });

  it("una password vuota non cancella quella gia' salvata", async () => {
    await salvaConfigEmail(s, { user: "a@b.it", password: "segreta" });
    await salvaConfigEmail(s, { user: "nuovo@b.it", password: "" });

    expect(getConfigEmail().user).toBe("nuovo@b.it");
    expect(getConfigEmail().password).toBe("segreta");
  });

  it("una password SMS vuota non cancella quella gia' salvata", async () => {
    await salvaConfigSms(s, { clientid: "cbbg1", password: "pw" });
    await salvaConfigSms(s, { clientid: "cbbg2", password: "" });

    expect(getConfigSms().clientid).toBe("cbbg2");
    expect(getConfigSms().password).toBe("pw");
  });

  it("caricaConfigNotifiche rilegge dal database quello che vi era stato salvato", async () => {
    await salvaConfigSms(s, { clientid: "cbbg9", password: "pw9" });

    // simula un riavvio del processo: stato in memoria azzerato dall'ambiente vuoto
    const altro = new MemStorage();
    await caricaConfigNotifiche(altro, ENV_VUOTO);
    expect(getConfigSms().clientid).toBe("");

    await caricaConfigNotifiche(s, ENV_VUOTO);
    expect(getConfigSms().clientid).toBe("cbbg9");
    expect(getConfigSms().password).toBe("pw9");
  });

  it("il database ha la precedenza sulle variabili d'ambiente", async () => {
    await salvaConfigEmail(s, { user: "db@b.it", password: "pw-db" });
    await caricaConfigNotifiche(s, {
      EMAIL_USER: "env@b.it",
      EMAIL_PASSWORD: "pw-env",
    } as NodeJS.ProcessEnv);
    expect(getConfigEmail().user).toBe("db@b.it");
  });
});

// ---- Il secondo account di posta: la PEC (issue #23) ------------------------

import {
  leggiConfigEmailPec,
  salvaConfigEmailPec,
  getConfigEmailPec,
  getConfigCanale,
  CHIAVI_EMAIL_PEC,
} from "../config-notifiche";
import { canaleDi, contaPerCanale, haIndirizzo } from "@shared/canale-email";

describe("leggiConfigEmailPec", () => {
  it("parte da SMTP e TLS acceso: una PEC si consegna al server del gestore", () => {
    const c = leggiConfigEmailPec({}, ENV_VUOTO);
    expect(c.service).toBe("smtp");
    expect(c.smtpSecure).toBe(true);
  });

  it("legge le proprie chiavi, non quelle della posta ordinaria", () => {
    const c = leggiConfigEmailPec(
      {
        [CHIAVI_EMAIL_PEC.user]: "consorzio@pec.it",
        [CHIAVI_EMAIL_PEC.password]: "segreta",
        [CHIAVI_EMAIL_PEC.smtpHost]: "smtps.pec.aruba.it",
        [CHIAVI_EMAIL_PEC.smtpPort]: "465",
        [CHIAVI_EMAIL.user]: "ordinaria@gmail.com",
      },
      ENV_VUOTO,
    );
    expect(c.user).toBe("consorzio@pec.it");
    expect(c.smtpHost).toBe("smtps.pec.aruba.it");
    expect(c.smtpPort).toBe(465);
  });

  it("ripiega sulle variabili d'ambiente su un'installazione nuova", () => {
    const c = leggiConfigEmailPec({}, {
      EMAIL_PEC_USER: "pec@env.it",
      EMAIL_PEC_PASSWORD: "pw",
      SMTP_PEC_HOST: "smtps.env.it",
    } as NodeJS.ProcessEnv);
    expect(c.user).toBe("pec@env.it");
    expect(c.smtpHost).toBe("smtps.env.it");
    expect(emailConfigurata(c)).toBe(true);
  });
});

describe("i due canali restano separati", () => {
  let s: MemStorage;
  beforeEach(async () => {
    s = new MemStorage();
    await caricaConfigNotifiche(s, ENV_VUOTO);
  });

  it("salvare la PEC non tocca la casella ordinaria, e viceversa", async () => {
    await salvaConfigEmail(s, { user: "ordinaria@gmail.com", password: "pw1" });
    await salvaConfigEmailPec(s, { user: "consorzio@pec.it", password: "pw2" });

    expect(getConfigEmail().user).toBe("ordinaria@gmail.com");
    expect(getConfigEmail().password).toBe("pw1");
    expect(getConfigEmailPec().user).toBe("consorzio@pec.it");
    expect(getConfigEmailPec().password).toBe("pw2");
  });

  it("una password PEC vuota non cancella quella gia' salvata", async () => {
    await salvaConfigEmailPec(s, { user: "a@pec.it", password: "segreta" });
    await salvaConfigEmailPec(s, { user: "b@pec.it", password: "" });

    expect(getConfigEmailPec().user).toBe("b@pec.it");
    expect(getConfigEmailPec().password).toBe("segreta");
  });

  it("getConfigCanale sceglie l'account giusto", async () => {
    await salvaConfigEmail(s, { user: "ordinaria@gmail.com", password: "pw1" });
    await salvaConfigEmailPec(s, { user: "consorzio@pec.it", password: "pw2" });

    expect(getConfigCanale("normale").user).toBe("ordinaria@gmail.com");
    expect(getConfigCanale("pec").user).toBe("consorzio@pec.it");
  });
});

describe("canaleDi", () => {
  it("riconosce la PEC comunque sia scritta", () => {
    expect(canaleDi("pec")).toBe("pec");
    expect(canaleDi(" PEC ")).toBe("pec");
  });

  // Un valore inatteso vale posta ordinaria: spedire per errore da una PEC costa
  // un messaggio certificato a vuoto, e il contrario si vede subito.
  it("tratta tutto il resto come posta ordinaria", () => {
    expect(canaleDi("normale")).toBe("normale");
    expect(canaleDi("")).toBe("normale");
    expect(canaleDi(null)).toBe("normale");
    expect(canaleDi(undefined)).toBe("normale");
  });
});

// ---- Il conteggio per canale, uno solo per pagina e server -------------------
//
// «Invia notifica» mostra «N via PEC» prima dell'invio e il server rifiuta con
// «N destinatari su M vanno raggiunti via PEC»: se i due numeri divergono,
// l'operatore si vede rifiutare un invio che la pagina dava per tutto ordinario.

describe("contaPerCanale", () => {
  it("divide i destinatari fra le due caselle", () => {
    expect(
      contaPerCanale([
        { email: "a@example.com", tipoEmail: "normale" },
        { email: "b@pec.it", tipoEmail: "pec" },
        { email: "c@pec.it", tipoEmail: "PEC" },
      ]),
    ).toEqual({ normale: 1, pec: 2 });
  });

  // Chi non ha indirizzo non parte da nessuna delle due caselle: contarlo fra
  // gli ordinari pretenderebbe credenziali per una mail che non verrà spedita.
  it("non conta chi non ha indirizzo, su nessun canale", () => {
    expect(
      contaPerCanale([
        { email: null, tipoEmail: "normale" },
        { email: "   ", tipoEmail: "pec" },
        { email: undefined, tipoEmail: null },
      ]),
    ).toEqual({ normale: 0, pec: 0 });
  });

  it("su una selezione vuota non pretende nessun canale", () => {
    expect(contaPerCanale([])).toEqual({ normale: 0, pec: 0 });
  });
});

describe("haIndirizzo", () => {
  it("uno spazio non è un indirizzo", () => {
    expect(haIndirizzo("  ")).toBe(false);
    expect(haIndirizzo(null)).toBe(false);
    expect(haIndirizzo(undefined)).toBe(false);
    expect(haIndirizzo("a@example.com")).toBe(true);
  });
});

// ---- Il booleano non deve declassare un canale su un valore che non capisce --

describe("smtpSecure con valori malformati", () => {
  it("un valore non riconosciuto NON spegne il TLS della PEC", () => {
    // Il caso che conta: il default della PEC e' acceso, e un "no" finito in
    // app_settings spegnerebbe in silenzio la cifratura verso il gestore.
    const c = leggiConfigEmailPec({ [CHIAVI_EMAIL_PEC.smtpSecure]: "no" }, ENV_VUOTO);
    expect(c.smtpSecure).toBe(true);
  });

  it("ma lo spegnimento esplicito della PEC continua a funzionare", () => {
    const c = leggiConfigEmailPec({ [CHIAVI_EMAIL_PEC.smtpSecure]: "false" }, ENV_VUOTO);
    expect(c.smtpSecure).toBe(false);
  });

  it("l'accensione esplicita della posta ordinaria continua a funzionare", () => {
    const c = leggiConfigEmail({ [CHIAVI_EMAIL.smtpSecure]: "true" }, ENV_VUOTO);
    expect(c.smtpSecure).toBe(true);
  });

  it("un valore non riconosciuto sulla posta ordinaria resta sul default spento", () => {
    const c = leggiConfigEmail({ [CHIAVI_EMAIL.smtpSecure]: "vero" }, ENV_VUOTO);
    expect(c.smtpSecure).toBe(false);
  });
});

describe("i getter restituiscono una copia, non l'oggetto vivo", () => {
  it("mutare cio' che torna da getConfigEmail non tocca la configurazione attiva", async () => {
    const archivio = new MemStorage();
    await caricaConfigNotifiche(archivio, ENV_VUOTO);
    const copia = getConfigEmail();
    copia.user = "intruso@example.com";
    expect(getConfigEmail().user).not.toBe("intruso@example.com");
  });
});
