import { describe, it, expect } from "vitest";
import {
  messaggioErrore,
  MESSAGGIO_RETE,
  MESSAGGIO_SESSIONE,
  MESSAGGIO_PERMESSI,
  MESSAGGIO_NON_RAGGIUNGIBILE,
  MESSAGGIO_SERVER,
  MESSAGGIO_RISPOSTA_INATTESA,
  MESSAGGIO_GENERICO,
  MESSAGGIO_RICHIESTA,
  MESSAGGIO_NON_TROVATO,
} from "../../client/src/lib/messaggio-errore";

// La forma che `throwIfResNotOk` in client/src/lib/queryClient.ts dà agli errori.
const errHttp = (stato: number, corpo: string) => new Error(`${stato}: ${corpo}`);

describe("messaggioErrore (issue #100)", () => {
  it("estrae message dal JSON e toglie il codice di stato", () => {
    expect(messaggioErrore(errHttp(400, '{"message":"Il titolo è obbligatorio"}')))
      .toBe("Il titolo è obbligatorio");
  });

  it("tiene il messaggio del server anche sui 5xx e sui 403", () => {
    expect(messaggioErrore(errHttp(503, '{"message":"Active Directory non risponde"}')))
      .toBe("Active Directory non risponde");
    expect(messaggioErrore(errHttp(403, '{"message":"Accesso in sola lettura"}')))
      .toBe("Accesso in sola lettura");
  });

  it("legge anche i campi errore ed error", () => {
    expect(messaggioErrore(errHttp(400, '{"ok":false,"errore":"File vuoto"}'))).toBe("File vuoto");
    expect(messaggioErrore(errHttp(400, '{"error":"Codice spento"}'))).toBe("Codice spento");
  });

  it("un corpo di testo semplice resta com'è, senza il codice", () => {
    expect(messaggioErrore(errHttp(400, "Selezione troppo ampia"))).toBe("Selezione troppo ampia");
  });

  it("ripiega per stato quando il corpo è vuoto, HTML o la frase inglese di default", () => {
    expect(messaggioErrore(errHttp(500, ""))).toBe(MESSAGGIO_SERVER);
    expect(messaggioErrore(errHttp(500, "Internal Server Error"))).toBe(MESSAGGIO_SERVER);
    expect(messaggioErrore(errHttp(502, "<html><body>502 Bad Gateway</body></html>")))
      .toBe(MESSAGGIO_NON_RAGGIUNGIBILE);
    expect(messaggioErrore(errHttp(504, "Gateway Timeout"))).toBe(MESSAGGIO_NON_RAGGIUNGIBILE);
    expect(messaggioErrore(errHttp(503, ""))).toBe(MESSAGGIO_NON_RAGGIUNGIBILE);
    expect(messaggioErrore(errHttp(403, "Forbidden"))).toBe(MESSAGGIO_PERMESSI);
    expect(messaggioErrore(errHttp(404, "{}"))).toBe(MESSAGGIO_NON_TROVATO);
    expect(messaggioErrore(errHttp(400, "Bad Request"))).toBe(MESSAGGIO_RICHIESTA);
  });

  it("un 401 senza testo o col messaggio del guard globale vuol dire sessione scaduta", () => {
    expect(messaggioErrore(errHttp(401, "Unauthorized"))).toBe(MESSAGGIO_SESSIONE);
    expect(messaggioErrore(errHttp(401, '{"message":"Non autenticato"}'))).toBe(MESSAGGIO_SESSIONE);
    // un 401 con un messaggio suo (es. il login) resta quello
    expect(messaggioErrore(errHttp(401, '{"message":"Credenziali non valide"}')))
      .toBe("Credenziali non valide");
  });

  it("gli errori di rete di fetch diventano un messaggio comprensibile", () => {
    expect(messaggioErrore(new TypeError("Failed to fetch"))).toBe(MESSAGGIO_RETE);
    expect(messaggioErrore(new TypeError("NetworkError when attempting to fetch resource.")))
      .toBe(MESSAGGIO_RETE);
    expect(messaggioErrore(new TypeError("Load failed"))).toBe(MESSAGGIO_RETE);
  });

  it("un JSON illeggibile (pagina HTML al posto della risposta) non mostra l'errore di parsing", () => {
    expect(messaggioErrore(new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON")))
      .toBe(MESSAGGIO_RISPOSTA_INATTESA);
  });

  it("i messaggi già leggibili passano invariati", () => {
    expect(messaggioErrore("Scegli Tipo e Classificazione prima di inviare."))
      .toBe("Scegli Tipo e Classificazione prima di inviare.");
    expect(messaggioErrore(new Error("Errore nel recupero utente"))).toBe("Errore nel recupero utente");
  });

  it("vuoto, null o HTML senza stato danno il messaggio generico", () => {
    expect(messaggioErrore(undefined)).toBe(MESSAGGIO_GENERICO);
    expect(messaggioErrore("")).toBe(MESSAGGIO_GENERICO);
    expect(messaggioErrore("<html></html>")).toBe(MESSAGGIO_GENERICO);
  });
});
