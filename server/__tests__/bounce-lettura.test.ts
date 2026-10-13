import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import { CHIAVI_BOUNCE, leggiUltimoEsito } from "../config-bounce";
import { leggiCasellaBounce, provaCasellaBounce, LIMITE_PER_GIRO } from "../bounce/lettura";
import { ottieniToken, elencaMessaggi } from "../bounce/graph";
import { toRecipientDetail } from "@shared/storico-notifiche";
import { graphFinto, mimeBounce, mimeRisposta, tokenCon, type MessaggioFinto } from "./bounce-graph-finto";

const CRED = {
  tenantId: "2419bd20-0322-49cb-8adf-36e21d6741e0",
  clientId: "11111111-2222-3333-4444-555555555555",
  clientSecret: "abc~SegretoVeroDelConsorzio",
  casella: "notifiche@cbbg.it",
};

const ADESSO = new Date("2026-10-13T10:00:00Z");

async function configurata(archivio: MemStorage, enabled = true) {
  await archivio.setSetting(CHIAVI_BOUNCE.enabled, String(enabled));
  await archivio.setSetting(CHIAVI_BOUNCE.tenantId, CRED.tenantId);
  await archivio.setSetting(CHIAVI_BOUNCE.clientId, CRED.clientId);
  await archivio.setSetting(CHIAVI_BOUNCE.clientSecret, CRED.clientSecret);
  await archivio.setSetting(CHIAVI_BOUNCE.casella, CRED.casella);
}

/** Una comunicazione spedita a `email`, con il Message-ID che Nodemailer avrebbe restituito. */
async function spedita(archivio: MemStorage, email: string, messageId: string, sentAt: Date) {
  const n = await archivio.createNotification({
    subject: "Chiusura roggia R01",
    message: "testo",
    tipo: "chiusura",
    classificazione: "ordinaria",
    status: "sent",
  } as any);
  const r = await archivio.createNotificationRecipient({
    notificationId: n.id,
    keykey: "C001",
    conduttoreDescrizione: "Rossi Mario",
    email,
    emailStatus: "pending",
  });
  await archivio.registraEsitoEmail(r.id, { status: "sent", messageId, sentAt });
  return { notifica: n, destinatario: r };
}

function msg(id: string, ricevuto: string, mime: string, over: Partial<MessaggioFinto> = {}): MessaggioFinto {
  return {
    id,
    internetMessageId: `<${id}@mail.it>`,
    subject: "Undelivered Mail Returned to Sender",
    from: "mailer-daemon@x.it",
    receivedDateTime: ricevuto,
    mime,
    ...over,
  };
}

let archivio: MemStorage;
beforeEach(() => {
  archivio = new MemStorage();
});

describe("leggiCasellaBounce", () => {
  it("con l'interruttore spento non fa niente", async () => {
    await configurata(archivio, false);
    const g = graphFinto({});
    expect(await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO })).toBeNull();
    expect(g.chiamate).toHaveLength(0);
  });

  it("abbina il bounce per Message-ID e segna la mail come non recapitata nello Storico", async () => {
    await configurata(archivio);
    const { destinatario } = await spedita(archivio, "anna@x.it", "<m1@cbbg.it>", new Date("2026-10-13T09:00:00Z"));
    const g = graphFinto({
      messaggi: [msg("b1", "2026-10-13T09:05:00Z", mimeBounce({ a: "anna@x.it", messageId: "<m1@cbbg.it>" }))],
    });

    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    expect(esito).toMatchObject({ riuscita: true, esaminati: 1, bounce: 1, abbinati: 1 });

    const [r] = await archivio.getRecipientsByNotificationId(destinatario.notificationId);
    expect(r).toMatchObject({ emailStatus: "bounced", emailBounceCodice: "5.1.1", emailBounceTipo: "indirizzoInesistente" });
    expect(toRecipientDetail(r)).toMatchObject({
      esitoEmail: "nonRecapitato",
      motivoMancatoRecapito: "5.1.1 — Indirizzo inesistente",
    });
    const [riga] = await archivio.elencoBounce(10);
    expect(riga).toMatchObject({ abbinamento: "messageId", codiceConduttore: "C001", oggettoComunicazione: "Chiusura roggia R01" });
  });

  it("senza Message-ID ripiega sull'ultima mail spedita a quell'indirizzo nei 7 giorni prima", async () => {
    await configurata(archivio);
    await spedita(archivio, "Anna@X.it", "<vecchia@cbbg.it>", new Date("2026-09-01T09:00:00Z"));
    const { destinatario } = await spedita(archivio, "anna@x.it", "<nuova@cbbg.it>", new Date("2026-10-12T09:00:00Z"));
    const g = graphFinto({ messaggi: [msg("b1", "2026-10-13T09:05:00Z", mimeBounce({ a: "anna@x.it" }))] });

    await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    const [riga] = await archivio.elencoBounce(10);
    expect(riga).toMatchObject({ abbinamento: "indirizzo", notificationId: destinatario.notificationId });
  });

  it("un bounce senza comunicazione resta registrato, non abbinato", async () => {
    await configurata(archivio);
    // Spedita a quell'indirizzo, ma un mese prima: fuori dalla finestra.
    await spedita(archivio, "anna@x.it", "<vecchia@cbbg.it>", new Date("2026-09-01T09:00:00Z"));
    const g = graphFinto({ messaggi: [msg("b1", "2026-10-13T09:05:00Z", mimeBounce({ a: "anna@x.it" }))] });

    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    expect(esito).toMatchObject({ bounce: 1, abbinati: 0 });
    expect((await archivio.elencoBounce(10))[0]).toMatchObject({ abbinamento: null, notificationId: null, destinatario: "anna@x.it" });
  });

  it("un ritardo temporaneo si registra ma non cambia l'esito della mail", async () => {
    await configurata(archivio);
    const { destinatario } = await spedita(archivio, "anna@x.it", "<m1@cbbg.it>", new Date("2026-10-13T09:00:00Z"));
    const g = graphFinto({
      messaggi: [
        msg("b1", "2026-10-13T09:05:00Z", mimeBounce({ a: "anna@x.it", action: "delayed", status: "4.4.7", messageId: "<m1@cbbg.it>" })),
      ],
    });
    await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    const [r] = await archivio.getRecipientsByNotificationId(destinatario.notificationId);
    expect(r.emailStatus).toBe("sent");
    expect((await archivio.elencoBounce(10))[0].tipo).toBe("temporaneo");
  });

  it("le risposte dei conduttori si esaminano una volta, e non finiscono fra i bounce", async () => {
    await configurata(archivio);
    const g = graphFinto({
      messaggi: [msg("r1", "2026-10-13T09:05:00Z", mimeRisposta("anna@x.it"), { subject: "Re: Chiusura", from: "anna@x.it" })],
    });
    const deps = { archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO };
    expect(await leggiCasellaBounce(deps)).toMatchObject({ esaminati: 1, bounce: 0 });
    expect(await archivio.elencoBounce(10)).toEqual([]);

    // Il secondo giro rilegge l'elenco (la finestra parte dall'ultimo visto,
    // incluso) ma non riscarica il MIME.
    const mimePrima = g.chiamate.filter((c) => c.url.endsWith("/$value")).length;
    expect(await leggiCasellaBounce(deps)).toMatchObject({ esaminati: 0 });
    expect(g.chiamate.filter((c) => c.url.endsWith("/$value")).length).toBe(mimePrima);
  });

  it("al primo giro guarda indietro di 7 giorni, poi riparte dall'ultimo messaggio visto", async () => {
    await configurata(archivio);
    const g = graphFinto({
      messaggi: [
        msg("vecchio", "2026-09-01T00:00:00Z", mimeRisposta("a@b.it")),
        msg("b1", "2026-10-12T08:00:00Z", mimeBounce({ a: "x@y.it" })),
      ],
    });
    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    expect(esito).toMatchObject({ esaminati: 1 });
    expect(g.chiamate.find((c) => c.url.includes("inbox/messages"))!.url).toContain(
      encodeURIComponent("receivedDateTime ge 2026-10-06T10:00:00Z"),
    );
    expect((await archivio.getAllSettings())[CHIAVI_BOUNCE.letturaDal]).toBe("2026-10-12T08:00:00.000Z");
  });

  it("segue le pagine di Graph", async () => {
    await configurata(archivio);
    const messaggi = Array.from({ length: 5 }, (_, i) =>
      msg(`b${i}`, `2026-10-13T0${i}:00:00Z`, mimeBounce({ a: `u${i}@x.it` })),
    );
    const g = graphFinto({ messaggi, pagina: 2 });
    expect(await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO })).toMatchObject({
      esaminati: 5,
      bounce: 5,
    });
  });

  it("un errore a metà giro salva quello che ha letto e riparte da lì", async () => {
    await configurata(archivio);
    const messaggi = [
      msg("b1", "2026-10-13T01:00:00Z", mimeBounce({ a: "a@x.it" })),
      msg("b2", "2026-10-13T02:00:00Z", mimeBounce({ a: "b@x.it" })),
    ];
    const rotto = graphFinto({ messaggi, mimeRotto: ["b2"] });
    const esito = await leggiCasellaBounce({ archivio, fetchGraph: rotto.fetchGraph, adesso: () => ADESSO });
    expect(esito).toMatchObject({ riuscita: false, esaminati: 1 });
    expect(esito!.messaggio).toContain("HTTP 503");
    expect(leggiUltimoEsito(await archivio.getAllSettings())).toMatchObject({ riuscita: false });
    expect((await archivio.getAllSettings())[CHIAVI_BOUNCE.letturaDal]).toBe("2026-10-13T01:00:00.000Z");

    const sano = graphFinto({ messaggi });
    expect(await leggiCasellaBounce({ archivio, fetchGraph: sano.fetchGraph, adesso: () => ADESSO })).toMatchObject({
      riuscita: true,
      esaminati: 1,
    });
    expect(await archivio.elencoBounce(10)).toHaveLength(2);
  });

  it("un secret sbagliato diventa un esito leggibile, che non cita il secret", async () => {
    await configurata(archivio);
    const g = graphFinto({
      token: {
        status: 401,
        corpo: {
          error: "invalid_client",
          error_description: `AADSTS7000215: Invalid client secret provided (${CRED.clientSecret}).\r\nTrace ID: 1`,
        },
      },
    });
    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    expect(esito!.riuscita).toBe(false);
    expect(esito!.messaggio).toContain("serve la colonna «Value»");
    expect(esito!.messaggio).not.toContain(CRED.clientSecret);
    expect(esito!.messaggio).not.toContain("Trace ID");
  });

  it("un Client ID sconosciuto: niente Trace ID e Correlation ID in coda alla stessa riga", async () => {
    await configurata(archivio);
    const g = graphFinto({
      token: {
        status: 400,
        corpo: {
          error: "unauthorized_client",
          error_description:
            "AADSTS700016: Application with identifier 'x' was not found in the directory 'y'. " +
            "Trace ID: 6a67 Correlation ID: e1d0 Timestamp: 2026-10-13 10:17:01Z",
        },
      },
    });
    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    expect(esito!.messaggio).toBe(
      "Autenticazione rifiutata: Client ID non trovato in questo tenant: controlla Client ID e Tenant ID " +
        "(AADSTS700016: Application with identifier 'x' was not found in the directory 'y'.)",
    );
  });

  it("con la configurazione incompleta fallisce senza chiamare Microsoft", async () => {
    await archivio.setSetting(CHIAVI_BOUNCE.casella, CRED.casella);
    const g = graphFinto({});
    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph }, { ancheSpenta: true });
    expect(esito).toMatchObject({ riuscita: false });
    expect(esito!.messaggio).toContain("Configurazione incompleta");
    expect(g.chiamate).toHaveLength(0);
  });

  it("si ferma al limite del giro, dal più vecchio", async () => {
    await configurata(archivio);
    const messaggi = Array.from({ length: LIMITE_PER_GIRO + 3 }, (_, i) =>
      msg(`r${i}`, new Date(Date.parse("2026-10-12T00:00:00Z") + i * 60_000).toISOString(), mimeRisposta("a@b.it")),
    );
    const g = graphFinto({ messaggi });
    const esito = await leggiCasellaBounce({ archivio, fetchGraph: g.fetchGraph, adesso: () => ADESSO });
    expect(esito).toMatchObject({ esaminati: LIMITE_PER_GIRO });
    expect(esito!.messaggio).toContain("prossimo giro");
  });
});

describe("graph", () => {
  it("il token si chiede in client credentials, con lo scope di Graph", async () => {
    const g = graphFinto({});
    await ottieniToken(CRED, g.fetchGraph);
    const [c] = g.chiamate;
    expect(c.url).toBe(`https://login.microsoftonline.com/${CRED.tenantId}/oauth2/v2.0/token`);
    expect(new URLSearchParams(c.body).get("grant_type")).toBe("client_credentials");
    expect(new URLSearchParams(c.body).get("scope")).toBe("https://graph.microsoft.com/.default");
  });

  it("un 403 di Graph spiega le cause tipiche", async () => {
    const g = graphFinto({ elenco: { status: 403, corpo: { error: { code: "ErrorAccessDenied", message: "Access is denied." } } } });
    await expect(elencaMessaggi("t", CRED.casella, ADESSO, 10, g.fetchGraph)).rejects.toThrow(/Application Access Policy/);
  });
});

describe("provaCasellaBounce", () => {
  it("riesce con token e casella leggibile, senza scaricare messaggi", async () => {
    const g = graphFinto({ messaggi: [msg("b1", "2026-10-13T09:00:00Z", mimeBounce({ a: "a@x.it" }))] });
    const esito = await provaCasellaBounce(CRED, g.fetchGraph, ADESSO);
    expect(esito).toEqual({
      riuscita: true,
      messaggio: "Accesso riuscito: la casella notifiche@cbbg.it è leggibile (1 messaggio negli ultimi 30 giorni).",
    });
    expect(g.chiamate.some((c) => c.url.endsWith("/$value"))).toBe(false);
  });

  it("fallisce se il token non porta Mail.Read: consenso amministratore mancante", async () => {
    const g = graphFinto({ token: { status: 200, corpo: { access_token: tokenCon([]) } } });
    const esito = await provaCasellaBounce(CRED, g.fetchGraph, ADESSO);
    expect(esito.riuscita).toBe(false);
    expect(esito.messaggio).toContain("consenso amministratore");
  });

  it("senza configurazione lo dice", async () => {
    expect((await provaCasellaBounce(null)).riuscita).toBe(false);
  });
});
