import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { MemStorage } from "../storage";
import {
  CHIAVI_BOUNCE,
  ErroreConfigBounce,
  giorniAllaScadenza,
  patchConfigBounceSchema,
  salvaConfigBounce,
  vistaConfigBounce,
} from "../config-bounce";
import { componiRiepilogo, inviaRiepilogoBounce } from "../bounce/riepilogo";
import { rotteBounce } from "../bounce/rotte";
import type { ConfigEmail } from "../config-notifiche";
import type { RigaBounce } from "@shared/bounce";

const GUID_TENANT = "2419bd20-0322-49cb-8adf-36e21d6741e0";
const GUID_CLIENT = "11111111-2222-3333-4444-555555555555";

const COMPLETA = {
  enabled: true,
  tenantId: GUID_TENANT,
  clientId: GUID_CLIENT,
  clientSecret: "abc~valore",
  casella: "Notifiche@CBBG.it",
};

describe("patchConfigBounceSchema", () => {
  it("accetta un tenant come GUID o come dominio", () => {
    expect(patchConfigBounceSchema.safeParse({ tenantId: GUID_TENANT }).success).toBe(true);
    expect(patchConfigBounceSchema.safeParse({ tenantId: "cbbg.onmicrosoft.com" }).success).toBe(true);
    expect(patchConfigBounceSchema.safeParse({ tenantId: "cbbg" }).success).toBe(false);
  });

  it("rifiuta il «Secret ID» incollato al posto del «Value»", () => {
    const r = patchConfigBounceSchema.safeParse({ clientSecret: GUID_CLIENT });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("Secret ID");
  });

  it("rifiuta campi sconosciuti e date non valide", () => {
    expect(patchConfigBounceSchema.safeParse({ password: "x" }).success).toBe(false);
    expect(patchConfigBounceSchema.safeParse({ secretScadenza: "13/10/2028" }).success).toBe(false);
    expect(patchConfigBounceSchema.safeParse({ secretScadenza: "2028-10-13" }).success).toBe(true);
    expect(patchConfigBounceSchema.safeParse({ secretScadenza: "" }).success).toBe(true);
  });
});

describe("salvaConfigBounce", () => {
  it("salva, normalizza la casella e non restituisce mai il secret", async () => {
    const a = new MemStorage();
    const vista = await salvaConfigBounce(a, COMPLETA);
    expect(vista).toMatchObject({ enabled: true, casella: "notifiche@cbbg.it", secretImpostato: true });
    expect(JSON.stringify(vista)).not.toContain("abc~valore");
    expect((await a.getAllSettings())[CHIAVI_BOUNCE.clientSecret]).toBe("abc~valore");
  });

  it("un secret vuoto tiene quello salvato", async () => {
    const a = new MemStorage();
    await salvaConfigBounce(a, COMPLETA);
    await salvaConfigBounce(a, { clientSecret: "", casella: "altra@cbbg.it" });
    expect((await a.getAllSettings())[CHIAVI_BOUNCE.clientSecret]).toBe("abc~valore");
  });

  it("non si accende con le credenziali incomplete, e non scrive niente", async () => {
    const a = new MemStorage();
    await expect(salvaConfigBounce(a, { enabled: true, casella: "n@x.it" })).rejects.toThrow(ErroreConfigBounce);
    expect(await a.getAllSettings()).toEqual({});
  });

  it("il riepilogo acceso vuole almeno un destinatario, e rifiuta un refuso", async () => {
    const a = new MemStorage();
    await expect(salvaConfigBounce(a, { riepilogo: true })).rejects.toThrow(/almeno un destinatario/);
    await expect(salvaConfigBounce(a, { riepilogo: true, destinatari: "a@x.it, sbagliato" })).rejects.toThrow(/sbagliato/);
    const v = await salvaConfigBounce(a, { riepilogo: true, destinatari: "A@x.it; b@x.it" });
    expect(v.destinatari).toEqual(["a@x.it", "b@x.it"]);
  });
});

describe("giorniAllaScadenza", () => {
  const oggi = new Date("2026-10-13T22:30:00Z");
  it("conta i giorni di calendario, negativi se già passata", () => {
    expect(giorniAllaScadenza("2026-10-14", oggi)).toBe(1);
    expect(giorniAllaScadenza("2026-10-13", oggi)).toBe(0);
    expect(giorniAllaScadenza("2026-10-10", oggi)).toBe(-3);
    expect(giorniAllaScadenza("", oggi)).toBeNull();
  });

  it("la vista la calcola", () => {
    expect(vistaConfigBounce({ [CHIAVI_BOUNCE.secretScadenza]: "2026-11-12" }, oggi).giorniAllaScadenza).toBe(30);
  });
});

function riga(over: Partial<RigaBounce> = {}): RigaBounce {
  return {
    id: 1,
    ricevutoAt: "2026-10-13T09:05:00.000Z",
    destinatario: "anna@x.it",
    codice: "5.1.1",
    tipo: "indirizzoInesistente",
    diagnostica: null,
    abbinamento: "messageId",
    notificationId: 42,
    oggettoComunicazione: "Chiusura <R01>",
    codiceConduttore: "C001",
    descrizioneConduttore: "Rossi Mario",
    ...over,
  };
}

describe("componiRiepilogo", () => {
  const base = { esito: null, giorniScadenza: null, casella: "notifiche@cbbg.it" };

  it("niente da dire, niente messaggio: nemmeno per i soli ritardi temporanei", () => {
    expect(componiRiepilogo({ ...base, righe: [] })).toBeNull();
    expect(componiRiepilogo({ ...base, righe: [riga({ tipo: "temporaneo", codice: "4.4.7" })] })).toBeNull();
  });

  it("elenca i bounce con comunicazione e conduttore, con l'HTML protetto", () => {
    const m = componiRiepilogo({ ...base, righe: [riga(), riga({ id: 2, notificationId: null, codiceConduttore: null })] })!;
    expect(m.oggetto).toBe("Notifiche Impianti — 2 mail non recapitate");
    expect(m.html).toContain("N00042 — Chiusura &lt;R01&gt;");
    expect(m.html).toContain("non abbinata");
    expect(m.html).toContain("5.1.1 — Indirizzo inesistente");
  });

  it("una lettura guasta si segnala anche senza bounce", () => {
    const m = componiRiepilogo({
      ...base,
      righe: [],
      esito: { quando: "2026-10-13T06:50:00Z", riuscita: false, messaggio: "secret scaduto", esaminati: 0, bounce: 0, abbinati: 0 },
    })!;
    expect(m.oggetto).toContain("non funziona");
    expect(m.html).toContain("secret scaduto");
  });

  it("avvisa del secret in scadenza da 30 giorni prima, e di quello scaduto", () => {
    expect(componiRiepilogo({ ...base, righe: [], giorniScadenza: 31 })).toBeNull();
    expect(componiRiepilogo({ ...base, righe: [], giorniScadenza: 30 })!.html).toContain("scade fra 30 giorni");
    expect(componiRiepilogo({ ...base, righe: [], giorniScadenza: -2 })!.html).toContain("scaduto da 2 giorni");
  });
});

const CONFIG_EMAIL: ConfigEmail = {
  service: "smtp",
  user: "notifiche@cbbg.it",
  password: "x",
  mittente: "",
  smtpHost: "smtp.office365.com",
  smtpPort: 587,
  smtpSecure: false,
  autenticazione: true,
};

function trasportoFinto() {
  const inviati: Record<string, unknown>[] = [];
  return { inviati, sendMail: async (m: Record<string, unknown>) => void inviati.push(m) };
}

async function conBounce(a: MemStorage, tipo = "indirizzoInesistente") {
  await a.registraMessaggioBounce({
    chiave: `<k-${Math.random()}@x>`,
    ricevutoAt: new Date("2026-10-13T09:00:00Z"),
    eBounce: true,
    codice: tipo === "temporaneo" ? "4.4.7" : "5.1.1",
    tipo,
    destinatario: "anna@x.it",
  });
}

describe("inviaRiepilogoBounce", () => {
  it("spento non manda niente e non segna niente", async () => {
    const a = new MemStorage();
    await conBounce(a);
    const t = trasportoFinto();
    expect(await inviaRiepilogoBounce({ archivio: a, config: CONFIG_EMAIL, trasporto: t })).toEqual({
      inviato: false,
      motivo: "Riepilogo spento",
    });
    expect(await a.bounceDaNotificare()).toHaveLength(1);
  });

  it("acceso manda una volta sola: il giorno dopo gli stessi bounce non ripartono", async () => {
    const a = new MemStorage();
    await salvaConfigBounce(a, { riepilogo: true, destinatari: "admin@cbbg.it" });
    await conBounce(a);
    const t = trasportoFinto();
    const deps = { archivio: a, config: CONFIG_EMAIL, trasporto: t };
    expect(await inviaRiepilogoBounce(deps)).toMatchObject({ inviato: true, bounce: 1 });
    expect(t.inviati[0]).toMatchObject({ from: "notifiche@cbbg.it", to: "admin@cbbg.it" });
    expect(await inviaRiepilogoBounce(deps)).toMatchObject({ inviato: false, motivo: "Niente da segnalare" });
    expect(t.inviati).toHaveLength(1);
  });

  it("i soli ritardi temporanei non mandano niente, ma non riemergono", async () => {
    const a = new MemStorage();
    await salvaConfigBounce(a, { riepilogo: true, destinatari: "admin@cbbg.it" });
    await conBounce(a, "temporaneo");
    const t = trasportoFinto();
    await inviaRiepilogoBounce({ archivio: a, config: CONFIG_EMAIL, trasporto: t });
    expect(t.inviati).toHaveLength(0);
    expect(await a.bounceDaNotificare()).toHaveLength(0);
  });

  it("se la mail non parte, i bounce restano da notificare", async () => {
    const a = new MemStorage();
    await salvaConfigBounce(a, { riepilogo: true, destinatari: "admin@cbbg.it" });
    await conBounce(a);
    const rotto = { sendMail: async () => { throw new Error("SMTP giù"); } };
    expect(await inviaRiepilogoBounce({ archivio: a, config: CONFIG_EMAIL, trasporto: rotto })).toMatchObject({
      inviato: false,
    });
    expect(await a.bounceDaNotificare()).toHaveLength(1);
  });
});

function resFinta() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}
const req = (body: unknown = {}) => ({ body }) as Request;

describe("rotteBounce", () => {
  it("leggi non espone mai il secret, e porta il mittente della scheda Email", async () => {
    const a = new MemStorage();
    await salvaConfigBounce(a, COMPLETA);
    const { res, json } = resFinta();
    await rotteBounce({ archivio: a, mittenteEmail: () => "notifiche@cbbg.it" }).leggi(req(), res);
    const corpo = json.mock.calls[0][0];
    expect(corpo).toMatchObject({ secretImpostato: true, mittenteEmail: "notifiche@cbbg.it" });
    expect(JSON.stringify(corpo)).not.toContain("abc~valore");
  });

  it("salva risponde 400 col motivo, sia per lo schema sia per le regole", async () => {
    const a = new MemStorage();
    const r = rotteBounce({ archivio: a, mittenteEmail: () => "" });
    const uno = resFinta();
    await r.salva(req({ clientSecret: GUID_CLIENT }), uno.res);
    expect(uno.status).toHaveBeenCalledWith(400);
    expect(uno.json.mock.calls[0][0].message).toContain("Secret ID");

    const due = resFinta();
    await r.salva(req({ enabled: true }), due.res);
    expect(due.status).toHaveBeenCalledWith(400);
    expect(due.json.mock.calls[0][0].message).toContain("servono Tenant ID");
  });

  it("il riepilogo di prova senza destinatari risponde 400", async () => {
    const { res, status } = resFinta();
    await rotteBounce({ archivio: new MemStorage(), mittenteEmail: () => "" }).riepilogoProva(req(), res);
    expect(status).toHaveBeenCalledWith(400);
  });
});
