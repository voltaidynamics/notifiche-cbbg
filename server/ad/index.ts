/**
 * Il punto in cui il flusso di autenticazione incontra il mondo vero.
 * Tutto ciò che sta sotto è puro e testabile; qui si legano database, bcrypt e
 * l'endpoint di verifica del consorzio.
 */
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { appUsers, type AuthSource } from "@shared/schema";
import { storage } from "../storage";
import { endpointAd } from "../config-ad";
import { HttpVerificatoreAd } from "./http";
import type { DipendenzeAutenticazione, UtenteAutenticabile } from "../auth";

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

/**
 * Le dipendenze del login, rilette a ogni tentativo: l'URL dell'endpoint
 * dipende da `ws.base`, che si cambia da un'altra scheda. Una query in più per
 * login, sotto un limitatore di 10 al minuto, non costa niente.
 */
export async function dipendenzeAutenticazione(): Promise<DipendenzeAutenticazione> {
  const endpoint = endpointAd(await storage.getAllSettings());
  return {
    trovaUtente,
    confrontaPassword: (password, hash) => bcrypt.compare(password, hash),
    verificatoreAd: endpoint ? new HttpVerificatoreAd(endpoint) : null,
    registraRichiestaAccesso: (username) => storage.registraRichiestaAccesso(username),
  };
}
