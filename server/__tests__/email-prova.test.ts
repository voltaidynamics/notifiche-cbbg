import { describe, it, expect } from "vitest";
import { inviaEmailProva, richiestaEmailProvaSchema } from "../email-prova";
import type { ConfigEmail } from "../config-notifiche";

const config: ConfigEmail = {
  service: "smtp",
  user: "consorzio@x.it",
  password: "segreta",
  mittente: "",
  smtpHost: "smtp.x.it",
  smtpPort: 465,
  smtpSecure: true,
};

function trasportoFinto(errore?: Error) {
  const inviati: Record<string, unknown>[] = [];
  return {
    inviati,
    async sendMail(msg: Record<string, unknown>) {
      if (errore) throw errore;
      inviati.push(msg);
    },
  };
}

describe("inviaEmailProva", () => {
  it("spedisce al destinatario scelto, dal mittente salvato", async () => {
    const t = trasportoFinto();
    const esito = await inviaEmailProva("pec", "io@x.it", { config, trasporto: t });
    expect(esito).toEqual({ inviata: true, destinatario: "io@x.it", mittente: "consorzio@x.it" });
    expect(t.inviati).toHaveLength(1);
    expect(t.inviati[0]).toMatchObject({ from: "consorzio@x.it", to: "io@x.it" });
    expect(String(t.inviati[0].subject)).toContain("PEC");
  });

  it("con un mittente salvato, il From è lui e non lo username", async () => {
    const t = trasportoFinto();
    const esito = await inviaEmailProva("normale", "io@x.it", {
      config: { ...config, user: "1132a1555b5fd6ae90f1", mittente: "test@x.it" },
      trasporto: t,
    });
    expect(esito).toMatchObject({ inviata: true, mittente: "test@x.it" });
    expect(t.inviati[0]).toMatchObject({ from: "test@x.it" });
  });

  it("senza credenziali salvate non apre nessun trasporto", async () => {
    const t = trasportoFinto();
    const esito = await inviaEmailProva("normale", "io@x.it", {
      config: { ...config, password: "" },
      trasporto: t,
    });
    expect(esito.inviata).toBe(false);
    expect(t.inviati).toHaveLength(0);
  });

  it("riporta il messaggio del server SMTP quando rifiuta", async () => {
    const t = trasportoFinto(new Error("550 relay not permitted"));
    const esito = await inviaEmailProva("normale", "io@x.it", { config, trasporto: t });
    expect(esito).toEqual({ inviata: false, motivo: "550 relay not permitted" });
  });
});

describe("richiestaEmailProvaSchema", () => {
  it("rifiuta un indirizzo malformato e un canale sconosciuto", () => {
    expect(richiestaEmailProvaSchema.safeParse({ canale: "normale", destinatario: "mario@" }).success).toBe(false);
    expect(richiestaEmailProvaSchema.safeParse({ canale: "fax", destinatario: "a@x.it" }).success).toBe(false);
  });

  it("toglie gli spazi attorno all'indirizzo", () => {
    const r = richiestaEmailProvaSchema.parse({ canale: "pec", destinatario: "  a@x.it " });
    expect(r.destinatario).toBe("a@x.it");
  });
});
