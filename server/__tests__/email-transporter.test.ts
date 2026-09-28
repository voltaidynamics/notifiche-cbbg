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
