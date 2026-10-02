import type { Express, Request, Response } from "express";
import { db } from "./db";
import { appUsers, APP_ROLES, AUTH_SOURCES, type AuthSource } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { requireAdmin, BCRYPT_ROUNDS } from "./auth";
import { storage } from "./storage";
import { z } from "zod";
import { errorePasswordLocale } from "@shared/password";

const MAX_SUPERADMINS = 2;

export type EsitoCambioSorgente =
  | { ok: true; authSource: AuthSource; passwordHash: "azzera" | "invariato" | "nuova" }
  | { ok: false; errore: string };

/**
 * Le regole di coerenza fra sorgente e password, in un posto solo.
 * Un utente Active Directory non ha una password nell'app: se ne avesse una,
 * sarebbe una seconda credenziale valida che il consorzio non può revocare
 * disabilitando l'account sul dominio.
 */
export function validaCambioSorgente(
  attuale: AuthSource,
  richiesta: AuthSource | undefined,
  password: string | undefined,
): EsitoCambioSorgente {
  const finale: AuthSource = richiesta ?? attuale;
  const haPassword = typeof password === "string" && password.length > 0;

  if (finale === "ad") {
    if (haPassword) {
      return {
        ok: false,
        errore: "Un utente Active Directory non ha una password nell'app",
      };
    }
    return { ok: true, authSource: "ad", passwordHash: attuale === "ad" ? "invariato" : "azzera" };
  }

  if (attuale === "ad" && !haPassword) {
    return {
      ok: false,
      errore: "Per passare a credenziali locali serve una password",
    };
  }

  // Issue #99: la regola vale quando una password si imposta o si cambia.
  // Senza password nuova si tiene quella salvata, anche se è di prima.
  if (haPassword) {
    const errorePassword = errorePasswordLocale(password);
    if (errorePassword) return { ok: false, errore: errorePassword };
  }

  return { ok: true, authSource: "locale", passwordHash: haPassword ? "nuova" : "invariato" };
}

async function countSuperadmins(excludeId?: number): Promise<number> {
  const all = await db.select().from(appUsers).where(eq(appUsers.role, "superadmin"));
  return excludeId ? all.filter((u) => u.id !== excludeId).length : all.length;
}

export const MESSAGGIO_ULTIMO_SUPERADMIN_LOCALE =
  "Deve restare almeno un superadmin locale: è l'unico account che sa ancora accedere " +
  "all'app quando il domain controller di Active Directory non risponde.";

/**
 * Vero se `target`, nel suo stato **attuale** (prima del cambiamento in
 * corso), è l'ultimo superadmin locale attivo — cioè se rimuoverlo (con una
 * conversione ad AD, un cambio di ruolo, una disattivazione o una
 * cancellazione) lascerebbe l'app senza nessun account capace di accedere
 * quando Active Directory non risponde. Produzione ne ha oggi esattamente
 * due, entrambi locali: senza questo guard basta convertirli o disattivarli
 * per finire fuori dall'app, con l'unica via di rientro che passa da psql.
 *
 * `altriSuperadminLocaliAttivi` è il conteggio degli altri utenti (id
 * diverso da `target`) che sono già superadmin locali attivi: se ce n'è
 * anche uno solo, `target` non è l'ultimo baluardo e il cambiamento è
 * consentito.
 */
export function toglierebbeUltimoSuperadminLocale(
  target: { role: string; authSource: AuthSource; isActive: boolean },
  altriSuperadminLocaliAttivi: number,
): boolean {
  const eUltimoBaluardo =
    target.role === "superadmin" && target.authSource === "locale" && target.isActive;
  return eUltimoBaluardo && altriSuperadminLocaliAttivi === 0;
}

/** Quanti superadmin locali attivi esistono, escluso `excludeId`. */
async function contaSuperadminLocaliAttivi(excludeId: number): Promise<number> {
  const rows = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.role, "superadmin"),
        eq(appUsers.authSource, "locale"),
        eq(appUsers.isActive, true),
      ),
    );
  return rows.filter((u) => u.id !== excludeId).length;
}

function canManageTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === "superadmin") return true;
  if (actorRole === "admin" && targetRole !== "superadmin") return true;
  return false;
}

export function registerAdminRoutes(app: Express): void {

  // ---- Users ----

  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const users = await db
        .select({
          id: appUsers.id,
          username: appUsers.username,
          role: appUsers.role,
          authSource: appUsers.authSource,
          isActive: appUsers.isActive,
          lastLoginAt: appUsers.lastLoginAt,
          createdAt: appUsers.createdAt,
          createdBy: appUsers.createdBy,
        })
        .from(appUsers);
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero degli utenti" });
    }
  });

  const createUserSchema = z.object({
    username: z.string().min(3),
    password: z.string().optional(),
    role: z.enum(APP_ROLES).default("user"),
    authSource: z.enum(AUTH_SOURCES).default("locale"),
    isActive: z.boolean().default(true),
  }).superRefine((d, ctx) => {
    if (d.authSource === "locale" && !d.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "La password è obbligatoria per un utente locale" });
    }
    if (d.authSource === "ad" && d.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Un utente Active Directory non ha una password nell'app" });
    }
  });

  app.post("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = createUserSchema.parse(req.body);
      const actor = req.user!;

      // Fuori dallo schema zod perché il 400 porti il messaggio della regola
      // (cosa manca) e non il generico «Dati non validi».
      if (data.authSource === "locale") {
        const errorePassword = errorePasswordLocale(data.password!);
        if (errorePassword) return res.status(400).json({ message: errorePassword });
      }

      if (!canManageTarget(actor.role, data.role)) {
        return res.status(403).json({ message: "Non puoi creare utenti con questo ruolo" });
      }

      if (data.role === "superadmin") {
        const count = await countSuperadmins();
        if (count >= MAX_SUPERADMINS) {
          return res.status(400).json({ message: `Massimo ${MAX_SUPERADMINS} superadmin consentiti` });
        }
      }

      const existing = await db.select().from(appUsers).where(eq(appUsers.username, data.username)).limit(1);
      if (existing.length > 0) {
        return res.status(400).json({ message: "Username già in uso" });
      }

      const passwordHash = data.authSource === "ad" ? null : await bcrypt.hash(data.password!, BCRYPT_ROUNDS);
      const [newUser] = await db
        .insert(appUsers)
        .values({
          username: data.username,
          passwordHash,
          role: data.role,
          authSource: data.authSource,
          isActive: data.isActive,
          createdBy: actor.id,
        })
        .returning();

      // Se questa persona era in coda, l'abbiamo appena evasa. La riga in
      // app_users è già scritta: un errore qui è solo pulizia mancata, non va
      // segnalato come fallimento della creazione o l'operatore riproverebbe
      // su un utente che invece esiste già.
      try {
        await storage.deleteRichiestaAccessoPerUsername(data.username);
      } catch (cleanupError) {
        console.error(`Errore nella pulizia della richiesta di accesso per "${data.username}" dopo la creazione dell'utente:`, cleanupError);
      }

      const { passwordHash: _ph, ...safe } = newUser;
      res.status(201).json(safe);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nella creazione dell'utente" });
    }
  });

  const updateUserSchema = z.object({
    username: z.string().min(3).optional(),
    password: z.string().optional(),
    role: z.enum(APP_ROLES).optional(),
    authSource: z.enum(AUTH_SOURCES).optional(),
    isActive: z.boolean().optional(),
  });

  app.put("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const actor = req.user!;
      const data = updateUserSchema.parse(req.body);

      const [target] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
      if (!target) return res.status(404).json({ message: "Utente non trovato" });

      if (!canManageTarget(actor.role, target.role)) {
        return res.status(403).json({ message: "Non puoi modificare questo utente" });
      }

      if (data.role && !canManageTarget(actor.role, data.role)) {
        return res.status(403).json({ message: "Non puoi assegnare questo ruolo" });
      }

      if (actor.id === id && data.role && data.role !== actor.role) {
        return res.status(400).json({ message: "Non puoi cambiare il tuo ruolo" });
      }

      if (data.role === "superadmin" && target.role !== "superadmin") {
        const count = await countSuperadmins();
        if (count >= MAX_SUPERADMINS) {
          return res.status(400).json({ message: `Massimo ${MAX_SUPERADMINS} superadmin consentiti` });
        }
      }

      const esito = validaCambioSorgente(
        target.authSource as AuthSource,
        data.authSource,
        data.password,
      );
      if (!esito.ok) return res.status(400).json({ message: esito.errore });

      // Le tre modifiche che possono togliere a `target` la sua protezione di
      // "ultimo superadmin locale attivo": passare ad AD, cambiare ruolo, o
      // disattivarlo. Controllarlo solo qui, e non nel `esito`/`updates` più
      // sotto, tiene la regola in un posto solo e facile da ritrovare.
      const potrebbeTogliereProtezione =
        data.authSource === "ad" ||
        (data.role !== undefined && data.role !== "superadmin") ||
        data.isActive === false;
      if (potrebbeTogliereProtezione) {
        const altri = await contaSuperadminLocaliAttivi(id);
        if (
          toglierebbeUltimoSuperadminLocale(
            { role: target.role, authSource: target.authSource as AuthSource, isActive: target.isActive },
            altri,
          )
        ) {
          return res.status(400).json({ message: MESSAGGIO_ULTIMO_SUPERADMIN_LOCALE });
        }
      }

      const updates: Partial<typeof appUsers.$inferInsert> = {};
      if (data.username !== undefined) updates.username = data.username;
      if (data.role !== undefined) updates.role = data.role;
      if (data.isActive !== undefined) updates.isActive = data.isActive;
      updates.authSource = esito.authSource;
      if (esito.passwordHash === "azzera") updates.passwordHash = null;
      if (esito.passwordHash === "nuova") updates.passwordHash = await bcrypt.hash(data.password!, BCRYPT_ROUNDS);

      const [updated] = await db.update(appUsers).set(updates).where(eq(appUsers.id, id)).returning();
      const { passwordHash: _ph, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nell'aggiornamento dell'utente" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const actor = req.user!;

      if (actor.id === id) {
        return res.status(400).json({ message: "Non puoi eliminare il tuo account" });
      }

      const [target] = await db.select().from(appUsers).where(eq(appUsers.id, id)).limit(1);
      if (!target) return res.status(404).json({ message: "Utente non trovato" });

      if (!canManageTarget(actor.role, target.role)) {
        return res.status(403).json({ message: "Non puoi eliminare questo utente" });
      }

      const altri = await contaSuperadminLocaliAttivi(id);
      if (
        toglierebbeUltimoSuperadminLocale(
          { role: target.role, authSource: target.authSource as AuthSource, isActive: target.isActive },
          altri,
        )
      ) {
        return res.status(400).json({ message: MESSAGGIO_ULTIMO_SUPERADMIN_LOCALE });
      }

      await db.delete(appUsers).where(eq(appUsers.id, id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione dell'utente" });
    }
  });

  // ---- Richieste di accesso (utenti AD non ancora abilitati) ----

  app.get("/api/admin/richieste-accesso", requireAdmin, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getRichiesteAccesso());
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle richieste di accesso" });
    }
  });

  app.delete("/api/admin/richieste-accesso/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Id non valido" });
      const eliminata = await storage.deleteRichiestaAccesso(id);
      if (!eliminata) return res.status(404).json({ message: "Richiesta non trovata" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Errore nella cancellazione" });
    }
  });
}
