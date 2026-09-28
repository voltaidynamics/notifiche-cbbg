// L'invio SMS attraverso le API di Register.it (sfera.net).
//
// Nessuna chiamata vera: `fetch` è finto. Ogni SMS costa, e le credenziali
// sono del cliente.

import { describe, it, expect, vi, afterEach } from "vitest";
import { sendSMS, numeroE164, testConnessioneSms, isSMSConfigured } from "../sms";
import type { ConfigSms } from "../config-notifiche";

afterEach(() => { vi.unstubAllGlobals(); });

const CONFIG: ConfigSms = { clientid: "cbbg", password: "segreta" };
const VUOTA: ConfigSms = { clientid: "", password: "" };

const rispostaOk = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe("numeroE164", () => {
  it("lascia passare un numero già internazionale, togliendo gli spazi", () => {
    expect(numeroE164("+39 331 1234567")).toBe("+393311234567");
  });

  it("antepone il prefisso italiano a un numero locale", () => {
    expect(numeroE164("331 123-4567")).toBe("+393311234567");
  });

  it("traduce il doppio zero internazionale nel +", () => {
    expect(numeroE164("0039 331 1234567")).toBe("+393311234567");
  });

  // Lo zero iniziale di un fisso fa parte del numero: toglierlo comporrebbe un
  // numero diverso. Lo "0" con cui il WS dice «non ho il numero» è già scartato
  // in lettura da `numeroDestinatario()`.
  it("non toglie lo zero iniziale di un numero fisso", () => {
    expect(numeroE164("035 123456")).toBe("+39035123456");
  });
});

describe("sendSMS", () => {
  it("manda i parametri che l'API si aspetta, refuso «recipent» compreso", async () => {
    const fetchFinto = rispostaOk({ total_sent: 1 });
    vi.stubGlobal("fetch", fetchFinto);

    const esito = await sendSMS("3311234567", "Roggia chiusa dal 20/08.", CONFIG);

    expect(esito.success).toBe(true);
    const [url, opzioni] = fetchFinto.mock.calls[0];
    expect(url).toBe("http://sms.sfera.net/api/sendsms");
    const corpo = new URLSearchParams(opzioni.body as string);
    expect(corpo.get("clientid")).toBe("cbbg");
    expect(corpo.get("password")).toBe("segreta");
    expect(corpo.get("smstext")).toBe("Roggia chiusa dal 20/08.");
    expect(corpo.get("recipent")).toBe("+393311234567");
  });

  // Un 200 con zero messaggi accettati è un fallimento: dire «inviato» qui
  // riempirebbe lo Storico di consegne mai avvenute.
  it("considera fallito un 200 che non conferma nessun invio", async () => {
    vi.stubGlobal("fetch", rispostaOk({ total_sent: 0, message: "credito esaurito" }));
    const esito = await sendSMS("3311234567", "testo", CONFIG);
    expect(esito.success).toBe(false);
    expect(esito.error).toContain("credito esaurito");
  });

  it("riporta un errore HTTP della piattaforma", async () => {
    vi.stubGlobal("fetch", rispostaOk({}, 503));
    const esito = await sendSMS("3311234567", "testo", CONFIG);
    expect(esito.success).toBe(false);
    expect(esito.error).toContain("503");
  });

  it("non chiama la piattaforma se le credenziali mancano", async () => {
    const fetchFinto = rispostaOk({ total_sent: 1 });
    vi.stubGlobal("fetch", fetchFinto);
    const esito = await sendSMS("3311234567", "testo", VUOTA);
    expect(esito.success).toBe(false);
    expect(fetchFinto).not.toHaveBeenCalled();
  });

  it("non esplode se la rete cade", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const esito = await sendSMS("3311234567", "testo", CONFIG);
    expect(esito.success).toBe(false);
    expect(esito.error).toContain("ECONNREFUSED");
  });
});

describe("testConnessioneSms", () => {
  // Il credito residuo non spende un SMS: il test di prima ne mandava uno vero
  // al numero mittente.
  it("interroga il credito e non l'invio", async () => {
    const fetchFinto = rispostaOk({ credit: 120 });
    vi.stubGlobal("fetch", fetchFinto);

    const esito = await testConnessioneSms(CONFIG);

    expect(esito.success).toBe(true);
    expect(fetchFinto.mock.calls[0][0]).toBe("http://sms.sfera.net/api/credit");
  });

  it("dice cosa non va quando le credenziali sono rifiutate", async () => {
    vi.stubGlobal("fetch", rispostaOk({}, 401));
    const esito = await testConnessioneSms(CONFIG);
    expect(esito.success).toBe(false);
    expect(esito.error).toContain("401");
  });

  it("si ferma prima di chiamare se la configurazione è vuota", async () => {
    const fetchFinto = rispostaOk({});
    vi.stubGlobal("fetch", fetchFinto);
    const esito = await testConnessioneSms(VUOTA);
    expect(esito.success).toBe(false);
    expect(fetchFinto).not.toHaveBeenCalled();
  });
});

describe("isSMSConfigured", () => {
  it("vuole entrambe le credenziali", () => {
    expect(isSMSConfigured(CONFIG)).toBe(true);
    expect(isSMSConfigured({ clientid: "cbbg", password: "" })).toBe(false);
    expect(isSMSConfigured(VUOTA)).toBe(false);
  });
});
