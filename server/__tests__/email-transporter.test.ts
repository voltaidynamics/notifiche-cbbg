import { describe, it, expect } from "vitest";
import { createTransporter } from "../email";
import type { ConfigEmail } from "../config-notifiche";

const base: ConfigEmail = {
  service: "gmail",
  user: "mittente@consorzio.it",
  password: "segreta",
  smtpHost: null,
  smtpPort: null,
  smtpSecure: false,
  autenticazione: true,
};

describe("createTransporter", () => {
  it("usa il servizio Nodemailer quando non è SMTP esplicito", () => {
    const t = createTransporter(base);
    expect((t.options as any).service).toBe("gmail");
  });

  it("usa host, porta e secure quando il servizio è smtp", () => {
    const t = createTransporter({
      ...base,
      service: "smtp",
      smtpHost: "mail.consorzio.it",
      smtpPort: 2525,
      smtpSecure: true,
    });
    expect((t.options as any).host).toBe("mail.consorzio.it");
    expect((t.options as any).port).toBe(2525);
    expect((t.options as any).secure).toBe(true);
  });

  it("senza autenticazione non passa `auth` a Nodemailer", () => {
    // Con `auth` presente, e la password vuota, Nodemailer muore su «Missing
    // credentials» appena il server annuncia AUTH.
    const t = createTransporter({
      ...base,
      service: "smtp",
      user: "",
      password: "",
      smtpHost: "192.168.0.48",
      smtpPort: 25,
      autenticazione: false,
    });
    expect((t.options as any).host).toBe("192.168.0.48");
    expect((t.options as any).auth).toBeUndefined();
  });

  it("con l'autenticazione accesa, o su Gmail, `auth` c'è", () => {
    const smtp = createTransporter({ ...base, service: "smtp", smtpHost: "mail.consorzio.it" });
    expect((smtp.options as any).auth).toEqual({ user: "mittente@consorzio.it", pass: "segreta" });
    const gmail = createTransporter({ ...base, autenticazione: false });
    expect((gmail.options as any).auth).toEqual({ user: "mittente@consorzio.it", pass: "segreta" });
  });

  it("ripiega sulla porta 587 quando la porta non è configurata", () => {
    const t = createTransporter({ ...base, service: "smtp", smtpHost: "mail.consorzio.it" });
    expect((t.options as any).port).toBe(587);
  });

  it("senza host, 'smtp' ricade sul trasporto per servizio", () => {
    // Senza questo ripiego una configurazione a metà produrrebbe un transporter
    // senza host né servizio, che fallisce solo al primo invio.
    const t = createTransporter({ ...base, service: "smtp", smtpHost: null });
    expect((t.options as any).service).toBe("smtp");
  });
});
