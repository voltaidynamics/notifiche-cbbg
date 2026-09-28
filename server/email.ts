/**
 * Costruzione del transporter Nodemailer a partire dalla configurazione corrente.
 *
 * Stava dentro server/routes.ts come funzione privata; da quando anche l'avviso
 * del caricamento notturno spedisce email (issue #6) serve a due chiamanti, e
 * duplicarla significherebbe poter mandare un messaggio via SMTP e l'altro via
 * gmail partendo dalla stessa configurazione.
 */
import nodemailer from "nodemailer";
import { getConfigEmail, type ConfigEmail } from "./config-notifiche";

export function createTransporter(config: ConfigEmail = getConfigEmail()) {
  if (config.service === "smtp" && config.smtpHost) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort ?? 587,
      secure: config.smtpSecure,
      auth: { user: config.user, pass: config.password },
    });
  }
  return nodemailer.createTransport({
    service: config.service || "gmail",
    auth: { user: config.user, pass: config.password },
  });
}
