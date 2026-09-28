import { createRequire } from "module";
const require = createRequire(import.meta.url);
import passport from "passport";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
const createMemStore = require("memorystore") as (s: typeof session) => { new(opts: { checkPeriod: number }): session.Store };
import bcrypt from "bcrypt";
import { db } from "./db";
import { appUsers } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";
import type { AuthSource } from "@shared/schema";
import { passwordVuota, type VerificatoreAd } from "./ad/verificatore";

export const BCRYPT_ROUNDS = 12;

export type SessionUser = {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
};

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.id, id))
      .limit(1);

    if (!user || !user.isActive) return done(null, false);

    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
    };
    done(null, sessionUser);
  } catch (err) {
    done(err);
  }
});

// ---- Session setup ----

export function setupSession(app: Express): void {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-in-production";

  let store: session.Store;

  if (process.env.DATABASE_URL) {
    const PgSession = connectPgSimple(session);
    store = new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
      createTableIfMissing: true,
    });
  } else {
    const MemStore = createMemStore(session);
    store = new MemStore({ checkPeriod: 86400000 });
  }

  app.use(
    session({
      secret,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: {
        httpOnly: true,
        secure: process.env.SESSION_SECURE === "true",
        sameSite: "strict",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
}

// ---- Middleware ----

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ message: "Non autenticato" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ message: "Non autenticato" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Accesso non autorizzato" });
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole("superadmin", "admin");

// ---- Helpers ----

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// ---- Autenticazione ----

/** Quello che serve per decidere se una persona entra. Nient'altro. */
export type UtenteAutenticabile = {
  id: number;
  username: string;
  passwordHash: string | null;
  role: string;
  isActive: boolean;
  authSource: AuthSource;
};

export type RisultatoLogin =
  | { esito: "ok"; utente: SessionUser }
  | { esito: "credenzialiNonValide" }
  | { esito: "nonAbilitato"; username: string }
  | { esito: "accountDisabilitatoApp" }
  | { esito: "accountDisabilitatoAd" }
  | { esito: "passwordScaduta" }
  | { esito: "accountBloccato" }
  | { esito: "adNonRaggiungibile"; dettaglio: string };

/**
 * Le dipendenze arrivano da fuori perché la macchina di sviluppo non vedrà mai
 * il domain controller del consorzio: l'intero flusso deve essere provabile
 * contro un verificatore finto.
 */
export type DipendenzeAutenticazione = {
  trovaUtente(username: string): Promise<UtenteAutenticabile | undefined>;
  confrontaPassword(password: string, hash: string): Promise<boolean>;
  /** `null` quando Active Directory non è configurata o è spenta. */
  verificatoreAd: VerificatoreAd | null;
  registraRichiestaAccesso(username: string): Promise<void>;
};

function sessioneDa(u: UtenteAutenticabile): SessionUser {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    isActive: u.isActive,
  };
}

export async function autentica(
  username: string,
  password: string,
  deps: DipendenzeAutenticazione,
): Promise<RisultatoLogin> {
  const nome = username.trim();
  // Prima di tutto: un simple bind con password vuota riesce, e non deve mai
  // arrivare al verificatore.
  if (nome === "" || passwordVuota(password)) return { esito: "credenzialiNonValide" };

  const utente = await deps.trovaUtente(nome);

  if (utente) {
    if (!utente.isActive) return { esito: "accountDisabilitatoApp" };

    if (utente.authSource === "locale") {
      // Nessun ripiego su AD: la sorgente è decisa in anticipo dalla colonna.
      if (!utente.passwordHash) return { esito: "credenzialiNonValide" };
      const ok = await deps.confrontaPassword(password, utente.passwordHash);
      return ok ? { esito: "ok", utente: sessioneDa(utente) } : { esito: "credenzialiNonValide" };
    }

    if (!deps.verificatoreAd) {
      return {
        esito: "adNonRaggiungibile",
        dettaglio: "Active Directory non è configurata",
      };
    }
    const esito = await deps.verificatoreAd.verifica(nome, password);
    switch (esito.esito) {
      case "ok": return { esito: "ok", utente: sessioneDa(utente) };
      case "credenzialiNonValide": return { esito: "credenzialiNonValide" };
      case "passwordScaduta": return { esito: "passwordScaduta" };
      case "accountDisabilitato": return { esito: "accountDisabilitatoAd" };
      case "accountBloccato": return { esito: "accountBloccato" };
      case "nonRaggiungibile":
        return { esito: "adNonRaggiungibile", dettaglio: esito.dettaglio };
      default: {
        // `EsitoAd` è un'unione chiusa (server/ad/verificatore.ts). Se un
        // domani si aggiunge un settimo caso, questo `never` fa fallire la
        // build invece di far collassare silenziosamente il caso nuovo su
        // un 401 generico: è la stessa disciplina del mirror lato client in
        // scheda-ad.tsx.
        const esaustivo: never = esito;
        return esaustivo;
      }
    }
  }

  // Nessuna riga in app_users. Si prova comunque il bind: se riesce, la persona
  // esiste su AD ma non è autorizzata, e questo è l'unico momento in cui
  // veniamo a sapere il suo username esatto di dominio.
  if (!deps.verificatoreAd) return { esito: "credenzialiNonValide" };
  const esito = await deps.verificatoreAd.verifica(nome, password);
  if (esito.esito === "ok") {
    // Una scrittura di sola bookkeeping: se fallisce, la risposta giusta
    // resta comunque "non abilitato" (403), non un 500 che nasconderebbe
    // all'utente l'unica informazione utile — che esiste su AD ma non è
    // autorizzato. Stesso trattamento già dato a questa stessa scrittura in
    // adminRoutes.ts dopo la creazione di un utente.
    try {
      await deps.registraRichiestaAccesso(nome);
    } catch (err) {
      console.error(`Errore nella registrazione della richiesta di accesso per "${nome}":`, err);
    }
    return { esito: "nonAbilitato", username: nome };
  }
  if (esito.esito === "nonRaggiungibile") {
    return { esito: "adNonRaggiungibile", dettaglio: esito.dettaglio };
  }
  // Chi non è abilitato non ha bisogno di sapere che la sua password di dominio
  // è scaduta: non entrerebbe comunque.
  return { esito: "credenzialiNonValide" };
}

const MESSAGGI: Record<Exclude<RisultatoLogin["esito"], "ok">, { status: number; message: string }> = {
  credenzialiNonValide: { status: 401, message: "Credenziali non valide" },
  accountDisabilitatoApp: { status: 401, message: "Account disabilitato" },
  nonAbilitato: {
    status: 403,
    message: "Utente non abilitato. Contatta un amministratore per richiedere l'accesso.",
  },
  accountDisabilitatoAd: {
    status: 403,
    message: "Account di dominio disabilitato. Contatta i sistemisti.",
  },
  passwordScaduta: {
    status: 403,
    message: "La tua password di dominio è scaduta. Cambiala dal tuo PC e riprova.",
  },
  accountBloccato: {
    status: 403,
    message: "Account di dominio bloccato per troppi tentativi. Contatta i sistemisti.",
  },
  adNonRaggiungibile: {
    status: 503,
    message: "Active Directory non è raggiungibile. Riprova più tardi o contatta un amministratore.",
  },
};

/**
 * Il `codice` serve alla pagina di login per distinguere il tono: «non sei
 * abilitato» e «password di dominio scaduta» non sono errori di credenziali e
 * non vanno mostrati in rosso come un rifiuto. Il dettaglio tecnico resta nei
 * log del server: all'utente non serve, e direbbe l'indirizzo del DC.
 */
export function rispostaLogin(
  r: RisultatoLogin,
): { status: number; corpo: { message: string; codice: string } } {
  if (r.esito === "ok") {
    throw new Error("rispostaLogin non va chiamata sul percorso di successo");
  }
  const m = MESSAGGI[r.esito];
  return { status: m.status, corpo: { message: m.message, codice: r.esito } };
}
