/**
 * Un Microsoft Graph finto per i test dei bounce (issue #126): risponde a
 * token, elenco e MIME come il vero, e registra le chiamate.
 */
import type { FetchGraph, RispostaGraph } from "../bounce/graph";

export type MessaggioFinto = {
  id: string;
  internetMessageId: string | null;
  subject: string;
  from: string;
  receivedDateTime: string;
  mime: string;
};

export function tokenCon(roles: string[]): string {
  const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${parte({ alg: "none" })}.${parte({ roles })}.firma`;
}

function risposta(status: number, corpo: unknown): RispostaGraph {
  const testo = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return { ok: status >= 200 && status < 300, status, text: async () => testo };
}

export function graphFinto(opzioni: {
  messaggi?: MessaggioFinto[];
  token?: { status: number; corpo: unknown };
  elenco?: { status: number; corpo: unknown };
  /** Messaggi per pagina, per provare `@odata.nextLink`. */
  pagina?: number;
  /** Id il cui MIME risponde con errore. */
  mimeRotto?: string[];
}) {
  const chiamate: { url: string; method: string; body?: string }[] = [];
  const messaggi = opzioni.messaggi ?? [];
  const pagina = opzioni.pagina ?? 50;

  const fetchGraph: FetchGraph = async (url, init) => {
    chiamate.push({ url, method: init.method ?? "GET", body: init.body });
    if (url.includes("login.microsoftonline.com")) {
      return opzioni.token
        ? risposta(opzioni.token.status, opzioni.token.corpo)
        : risposta(200, { access_token: tokenCon(["Mail.Read"]), expires_in: 3599 });
    }
    if (url.includes("/mailFolders/inbox/messages")) {
      if (opzioni.elenco) return risposta(opzioni.elenco.status, opzioni.elenco.corpo);
      const u = new URL(url);
      const filtro = u.searchParams.get("$filter") ?? "";
      const dal = Date.parse(filtro.replace("receivedDateTime ge ", ""));
      const salta = Number(u.searchParams.get("$skip") ?? "0");
      const filtrati = messaggi
        .filter((m) => Date.parse(m.receivedDateTime) >= dal)
        .sort((a, b) => Date.parse(a.receivedDateTime) - Date.parse(b.receivedDateTime));
      const fetta = filtrati.slice(salta, salta + pagina);
      const altri = salta + pagina < filtrati.length;
      u.searchParams.set("$skip", String(salta + pagina));
      return risposta(200, {
        value: fetta.map((m) => ({
          id: m.id,
          internetMessageId: m.internetMessageId,
          subject: m.subject,
          from: { emailAddress: { address: m.from } },
          receivedDateTime: m.receivedDateTime,
        })),
        ...(altri ? { "@odata.nextLink": u.toString() } : {}),
      });
    }
    const id = decodeURIComponent(/\/messages\/([^/]+)\/\$value$/.exec(url)?.[1] ?? "");
    if (opzioni.mimeRotto?.includes(id)) return risposta(503, { error: { code: "ServiceUnavailable", message: "giù" } });
    const m = messaggi.find((x) => x.id === id);
    return m ? risposta(200, m.mime) : risposta(404, { error: { code: "ErrorItemNotFound", message: "no" } });
  };

  return { fetchGraph, chiamate };
}

/** Un bounce Postfix minimo, con lo status e il Message-ID dell'originale. */
export function mimeBounce(opz: { a: string; status?: string; action?: string; messageId?: string }): string {
  return [
    "From: MAILER-DAEMON@x.it",
    "Subject: Undelivered Mail Returned to Sender",
    'Content-Type: multipart/report; report-type=delivery-status; boundary="Q"',
    "",
    "--Q",
    "Content-Type: message/delivery-status",
    "",
    "Reporting-MTA: dns; x.it",
    "",
    `Final-Recipient: rfc822; ${opz.a}`,
    `Action: ${opz.action ?? "failed"}`,
    `Status: ${opz.status ?? "5.1.1"}`,
    `Diagnostic-Code: smtp; 550 ${opz.status ?? "5.1.1"} user unknown`,
    "",
    ...(opz.messageId
      ? ["--Q", "Content-Type: text/rfc822-headers", "", `Message-ID: ${opz.messageId}`, ""]
      : []),
    "--Q--",
  ].join("\r\n");
}

export function mimeRisposta(da: string): string {
  return [`From: ${da}`, "Subject: Re: Chiusura roggia", "", "Ricevuto, grazie."].join("\r\n");
}
