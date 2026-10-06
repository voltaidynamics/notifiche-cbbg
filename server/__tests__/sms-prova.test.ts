import { describe, it, expect } from "vitest";
import { inviaSmsProva, richiestaSmsProvaSchema } from "../sms-prova";
import type { ConfigSms } from "../config-notifiche";

const config: ConfigSms = { clientid: "cid", password: "segreta" };

function inviaFinto(esito: { success: boolean; error?: string }) {
  const chiamate: { to: string; testo: string; config: ConfigSms }[] = [];
  return {
    chiamate,
    invia: async (to: string, testo: string, c: ConfigSms) => {
      chiamate.push({ to, testo, config: c });
      return esito;
    },
  };
}

describe("inviaSmsProva", () => {
  it("spedisce al numero scelto con le credenziali salvate", async () => {
    const f = inviaFinto({ success: true });
    const esito = await inviaSmsProva("3331234567", { config, invia: f.invia });
    expect(esito).toEqual({ inviato: true, numero: "3331234567" });
    expect(f.chiamate).toHaveLength(1);
    expect(f.chiamate[0].to).toBe("3331234567");
    expect(f.chiamate[0].config).toEqual(config);
  });

  it("senza credenziali salvate non chiama la piattaforma", async () => {
    const f = inviaFinto({ success: true });
    const esito = await inviaSmsProva("3331234567", { config: { ...config, password: "" }, invia: f.invia });
    expect(esito.inviato).toBe(false);
    expect(f.chiamate).toHaveLength(0);
  });

  it("riporta il rifiuto della piattaforma", async () => {
    const f = inviaFinto({ success: false, error: "Credito esaurito" });
    const esito = await inviaSmsProva("3331234567", { config, invia: f.invia });
    expect(esito).toEqual({ inviato: false, motivo: "Credito esaurito" });
  });
});

describe("richiestaSmsProvaSchema", () => {
  it("accetta un numero con spazi e prefisso, e lo ripulisce", () => {
    expect(richiestaSmsProvaSchema.parse({ numero: "+39 333 123.45-67" }).numero).toBe("+393331234567");
  });

  it("rifiuta lettere e numeri troppo corti", () => {
    expect(richiestaSmsProvaSchema.safeParse({ numero: "333abc4567" }).success).toBe(false);
    expect(richiestaSmsProvaSchema.safeParse({ numero: "123" }).success).toBe(false);
    expect(richiestaSmsProvaSchema.safeParse({ numero: "" }).success).toBe(false);
  });
});
