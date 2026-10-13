import { describe, it, expect } from "vitest";
import { analizzaMessaggio, normalizzaMessageId } from "../bounce/dsn";
import { leggiMime, gruppiDeliveryStatus } from "../bounce/mime";
import { classificaBounce, descriviBounce, segnaMancatoRecapito } from "@shared/bounce";

const CASELLA = "notifiche@cbbg.it";

// La forma di un bounce Postfix (quello di sfera.net del collaudo del 12/10/2026):
// multipart/report con il DSN e gli header originali in text/rfc822-headers.
const POSTFIX = [
  "From: MAILER-DAEMON@sfera.net (Mail Delivery System)",
  "To: notifiche@cbbg.it",
  "Subject: Undeliverable: Mail di prova — Notifiche Impianti (Email)",
  'Content-Type: multipart/report; report-type=delivery-status;',
  '\tboundary="B1"',
  "",
  "--B1",
  "Content-Type: text/plain; charset=us-ascii",
  "",
  "I'm sorry to have to inform you that your message could not",
  "be delivered to one or more recipients.",
  "",
  "<jsdfklfjsdlsdfnonesistofjkdj@gmail.com>: host gmail-smtp-in.l.google.com said:",
  "    550-5.1.1 The email account that you tried to reach does not exist.",
  "",
  "--B1",
  "Content-Type: message/delivery-status",
  "",
  "Reporting-MTA: dns; smtp.sfera.net",
  "Arrival-Date: Mon, 12 Oct 2026 11:35:10 +0200",
  "",
  "Final-Recipient: rfc822; jsdfklfjsdlsdfnonesistofjkdj@gmail.com",
  "Original-Recipient: rfc822;jsdfklfjsdlsdfnonesistofjkdj@gmail.com",
  "Action: failed",
  "Status: 5.1.1",
  "Remote-MTA: dns; gmail-smtp-in.l.google.com",
  "Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach",
  "    does not exist.",
  "",
  "--B1",
  "Content-Type: text/rfc822-headers",
  "",
  "From: notifiche@cbbg.it",
  "To: jsdfklfjsdlsdfnonesistofjkdj@gmail.com",
  "Subject: Mail di prova",
  "Message-ID: <a1b2c3@cbbg.it>",
  "",
  "--B1--",
  "",
].join("\r\n");

// Exchange Online: corpo HTML, DSN in base64, messaggio originale allegato intero.
const DSN_EXCHANGE = Buffer.from(
  [
    "Final-Recipient: rfc822;mario.rossi@azienda.it",
    "Action: failed",
    "Status: 5.1.10",
    "Diagnostic-Code: smtp;550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup",
    "",
  ].join("\r\n"),
).toString("base64");

const EXCHANGE = [
  "From: postmaster@cbbg.onmicrosoft.com",
  "To: notifiche@cbbg.it",
  "Subject: Non recapitabile: Chiusura roggia R01",
  "X-MS-Exchange-Message-Is-Ndr: ",
  'Content-Type: multipart/report; report-type=delivery-status; boundary="EX"',
  "",
  "--EX",
  'Content-Type: multipart/alternative; boundary="ALT"',
  "",
  "--ALT",
  "Content-Type: text/html; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "<p>Impossibile recapitare a <b>mario.rossi@azienda.it</b></p>=0D",
  "<p>Codice: 550 5.1.10</p>",
  "--ALT--",
  "",
  "--EX",
  "Content-Type: message/delivery-status",
  "Content-Transfer-Encoding: base64",
  "",
  DSN_EXCHANGE,
  "",
  "--EX",
  "Content-Type: message/rfc822",
  "",
  "From: notifiche@cbbg.it",
  "To: mario.rossi@azienda.it",
  "Message-ID: <XYZ.789@cbbg.it>",
  "Subject: Chiusura roggia R01",
  "",
  "Testo della comunicazione, che cita info@cbbg.it.",
  "",
  "--EX--",
  "",
].join("\r\n");

function dsnCon(gruppoDestinatario: string[]): string {
  return [
    "From: MAILER-DAEMON@x.it",
    'Content-Type: multipart/report; report-type=delivery-status; boundary="Z"',
    "",
    "--Z",
    "Content-Type: message/delivery-status",
    "",
    "Reporting-MTA: dns; x.it",
    "",
    ...gruppoDestinatario,
    "",
    "--Z--",
  ].join("\r\n");
}

describe("analizzaMessaggio — DSN standard", () => {
  it("legge il bounce Postfix del collaudo: codice, destinatario, Message-ID originale", () => {
    const a = analizzaMessaggio(POSTFIX, CASELLA);
    expect(a).toEqual({
      bounce: true,
      codice: "5.1.1",
      tipo: "indirizzoInesistente",
      diagnostica: "smtp; 550-5.1.1 The email account that you tried to reach does not exist.",
      destinatario: "jsdfklfjsdlsdfnonesistofjkdj@gmail.com",
      messageIdOriginale: "<a1b2c3@cbbg.it>",
    });
  });

  it("legge Exchange Online: DSN in base64 e messaggio originale allegato", () => {
    const a = analizzaMessaggio(EXCHANGE, CASELLA);
    expect(a).toMatchObject({
      bounce: true,
      codice: "5.1.10",
      tipo: "indirizzoInesistente",
      destinatario: "mario.rossi@azienda.it",
      messageIdOriginale: "<XYZ.789@cbbg.it>",
    });
  });

  it("un avviso di ritardo è temporaneo, anche con un codice di classe 5", () => {
    const a = analizzaMessaggio(
      dsnCon(["Final-Recipient: rfc822; a@b.it", "Action: delayed", "Status: 5.0.0"]),
      CASELLA,
    );
    expect(a).toMatchObject({ bounce: true, tipo: "temporaneo" });
  });

  it("un DSN di consegna riuscita non è un bounce", () => {
    const a = analizzaMessaggio(
      dsnCon(["Final-Recipient: rfc822; a@b.it", "Action: delivered", "Status: 2.0.0"]),
      CASELLA,
    );
    expect(a).toEqual({ bounce: false });
  });

  it("con più destinatari sceglie quello fallito", () => {
    const a = analizzaMessaggio(
      dsnCon([
        "Final-Recipient: rfc822; ok@b.it",
        "Action: delivered",
        "Status: 2.0.0",
        "",
        "Final-Recipient: rfc822; ko@b.it",
        "Action: failed",
        "Status: 5.2.2",
      ]),
      CASELLA,
    );
    expect(a).toMatchObject({ destinatario: "ko@b.it", tipo: "casellaPiena" });
  });
});

describe("analizzaMessaggio — ripiego euristico", () => {
  it("un testo libero da MAILER-DAEMON: codice dopo il codice SMTP, destinatario che non è la casella", () => {
    const grezzo = [
      "From: MAILER-DAEMON@x.com",
      "Subject: failure notice",
      "",
      "Sorry, we were unable to deliver your message from notifiche@cbbg.it",
      "to anna@x.it: 452 4.2.2 mailbox full",
      "Message-ID: <orig-1@cbbg.it>",
    ].join("\r\n");
    expect(analizzaMessaggio(grezzo, CASELLA)).toEqual({
      bounce: true,
      codice: "4.2.2",
      tipo: "temporaneo",
      diagnostica: "to anna@x.it: 452 4.2.2 mailbox full",
      destinatario: "anna@x.it",
      messageIdOriginale: "<orig-1@cbbg.it>",
    });
  });

  it("senza codice resta un bounce, di motivo sconosciuto", () => {
    const grezzo = ["From: postmaster@x.it", "Subject: Returned mail", "", "Non consegnato a b@c.it"].join("\n");
    expect(analizzaMessaggio(grezzo, CASELLA)).toMatchObject({ bounce: true, codice: null, tipo: "sconosciuto" });
  });

  it("una risposta automatica di ferie non è un bounce, anche se cita un numero come 5.4.3", () => {
    const grezzo = [
      "From: Mario Rossi <mario@x.it>",
      "Subject: Risposta automatica: Chiusura roggia R01",
      "Auto-Submitted: auto-replied",
      "In-Reply-To: <a1b2c3@cbbg.it>",
      "",
      "Sono in ferie fino al 5.4.3, rispondo al rientro.",
    ].join("\r\n");
    expect(analizzaMessaggio(grezzo, CASELLA)).toEqual({ bounce: false });
  });

  it("una risposta di un conduttore non è un bounce", () => {
    const grezzo = ["From: anna@x.it", "Subject: Re: Chiusura roggia", "", "Grazie"].join("\r\n");
    expect(analizzaMessaggio(grezzo, CASELLA)).toEqual({ bounce: false });
  });
});

describe("normalizzaMessageId", () => {
  it("riporta tutto alla forma con le parentesi angolari", () => {
    expect(normalizzaMessageId("<a@b>")).toBe("<a@b>");
    expect(normalizzaMessageId("  a@b ")).toBe("<a@b>");
    expect(normalizzaMessageId("<a@b> (commento)")).toBe("<a@b>");
    expect(normalizzaMessageId("")).toBeNull();
    expect(normalizzaMessageId("niente")).toBeNull();
  });
});

describe("mime", () => {
  it("riunisce gli header su più righe e legge i gruppi del DSN", () => {
    const p = leggiMime("Subject: una\r\n riga\r\n\r\ncorpo");
    expect(p.intestazioni.get("subject")).toEqual(["una riga"]);
    expect(p.testo).toBe("corpo");
    expect(gruppiDeliveryStatus("A: 1\n\nB: 2\nC: 3\n").map((g) => Array.from(g.keys()))).toEqual([
      ["a"],
      ["b", "c"],
    ]);
  });

  it("una chiusura del multipart mancante non perde l'ultima parte", () => {
    const p = leggiMime('Content-Type: multipart/mixed; boundary="Q"\n\n--Q\n\nuno\n--Q\n\ndue\n');
    expect(p.parti.map((x) => x.testo.trim())).toEqual(["uno", "due"]);
  });
});

describe("classificaBounce", () => {
  it("segue le classi del codice", () => {
    expect(classificaBounce("5.1.1")).toBe("indirizzoInesistente");
    expect(classificaBounce("5.1.10")).toBe("indirizzoInesistente");
    expect(classificaBounce("5.2.2")).toBe("casellaPiena");
    expect(classificaBounce("5.7.1")).toBe("policy");
    expect(classificaBounce("5.4.1")).toBe("rifiutato");
    expect(classificaBounce("4.2.2")).toBe("temporaneo");
    expect(classificaBounce(null)).toBe("sconosciuto");
  });

  it("solo il temporaneo non segna la mail come non recapitata", () => {
    expect(segnaMancatoRecapito("temporaneo")).toBe(false);
    expect(segnaMancatoRecapito("sconosciuto")).toBe(true);
    expect(descriviBounce("5.1.1", "indirizzoInesistente")).toBe("5.1.1 — Indirizzo inesistente");
    expect(descriviBounce(null, "sconosciuto")).toBe("Motivo non indicato");
  });
});
