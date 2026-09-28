/**
 * Il punto in cui il flusso di autenticazione incontra il mondo vero.
 * Tutto ciò che sta sotto è puro e testabile; qui si legano database, bcrypt e
 * il domain controller.
 */
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appUsers, type AuthSource } from "@shared/schema";
import { storage } from "../storage";
import { getConfigAd, adConfigurato } from "../config-ad";
import { LdapVerificatoreAd } from "./ldap";
import type { VerificatoreAd } from "./verificatore";
import type { DipendenzeAutenticazione, UtenteAutenticabile } from "../auth";

// Costruito una volta sola, ma legge la configurazione a ogni tentativo:
// salvarla da Impostazioni deve avere effetto senza riavviare pm2.
const verificatore = new LdapVerificatoreAd(getConfigAd);

export function verificatoreCorrente(): VerificatoreAd | null {
  return adConfigurato(getConfigAd()) ? verificatore : null;
}

async function trovaUtente(username: string): Promise<UtenteAutenticabile | undefined> {
  const [u] = await db.select().from(appUsers).where(eq(appUsers.username, username)).limit(1);
  if (!u) return undefined;
  return {
    id: u.id,
    username: u.username,
    passwordHash: u.passwordHash,
    role: u.role,
    isActive: u.isActive,
    authSource: u.authSource as AuthSource,
  };
}

export function dipendenzeAutenticazione(): DipendenzeAutenticazione {
  return {
    trovaUtente,
    confrontaPassword: (password, hash) => bcrypt.compare(password, hash),
    verificatoreAd: verificatoreCorrente(),
    registraRichiestaAccesso: (username) => storage.registraRichiestaAccesso(username),
  };
}
