import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertSegmentSchema,
  insertConsorziatiSchema,
  insertCadastralParcelSchema,
  insertParcelSegmentMappingSchema,
  insertParcelUserAssignmentSchema,
  insertNotificationTemplateSchema,
  insertNotificationSchema,
  appUsers,
  type Consorziato,
} from "@shared/schema";
import {
  aggregaDestinatari,
  codiciTratte,
  descrizioniTratte,
  snapshotConduttore,
  type CoppiaDestinatario,
} from "@shared/destinatari";
import { validaClassificazioneInvio } from "@shared/classificazione";
import { z } from "zod";
import { sendSMS, isSMSConfigured, testConnessioneSms } from "./sms";
import multer from "multer";
import { importConsorziati, importParcels, CSV_TEMPLATE_CONSORZIATI, CSV_TEMPLATE_PARCELS } from "./import";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { requireAdmin, requireRole, autentica, rispostaLogin } from "./auth";
import { dipendenzeAutenticazione } from "./ad";
import { registerAdminRoutes } from "./adminRoutes";
import { registerUtentiTestRoutes } from "./utentiTestRoutes";
import { avviaSync, syncInCorso, SyncGiaInCorso } from "./sync/sync-all";
import { componiStatoSync } from "./sync/stato";
import { WS_ENTITIES, chiaveSetting, leggiConfigWs, CHIAVE_BASE, type WsEntity } from "./sync/config";
import {
  getConfigEmail, getConfigEmailPec, getConfigSms,
  salvaConfigEmail, salvaConfigEmailPec, salvaConfigSms, emailConfigurata, mittenteDi,
  type ConfigEmail, type ConfigSms,
} from "./config-notifiche";
import { inviaEmailProva, richiestaEmailProvaSchema } from "./email-prova";
import { inviaSmsProva, richiestaSmsProvaSchema } from "./sms-prova";
import { creaSource, estraiArray } from "./sync/source";
import { leggiCodici, TroppiCodici } from "./codici-query";
import { validaLegame } from "@shared/legame";
import { componiRispostaStato } from "@shared/stato-rogge";
import { salvaFileEntita } from "./sync/upload";
import { createTransporter } from "./email";
import {
  CHIAVE_DESTINATARI, separaDestinatari, validaDestinatari, leggiDestinatari,
  componiAvvisoDaLog, componiAvvisoGuasto, inviaAvvisoSync, descriviMancatoInvio,
} from "./avviso-sync";
import { preparaInvio, spedisciPreparato } from "./invio-notifica";
import { caricaFiltroCodici } from "./filtro-codici";
import { isGerarchiaCodice, type RispostaGestioneCodici } from "@shared/codici-attivi";
import { leggiTokenTracking } from "./tracking-token";
import {
  salvaConfigAd,
  vistaConfigAd,
  endpointAd,
  TIMEOUT_AD_MIN,
  TIMEOUT_AD_MAX,
  type EndpointAd,
} from "./config-ad";
import { provaEndpoint, type EsitoProva } from "./ad/http";
import type { ArchivioImpostazioni } from "./config-notifiche";

const schemaPatchAd = z.object({
  enabled: z.boolean().optional(),
  // Vuoto è lecito: vuol dire «usa ws.base + il percorso documentato».
  url: z
    .string()
    .max(1000)
    .refine((u) => u.trim() === "" || /^https?:\/\//i.test(u.trim()), {
      message: "L'URL deve iniziare con http:// o https://",
    })
    .optional(),
  timeoutMs: z.number().int().min(TIMEOUT_AD_MIN).max(TIMEOUT_AD_MAX).optional(),
}).strict();

export function patchConfigAd(body: unknown) {
  return schemaPatchAd.safeParse(body);
}

/**
 * Gli handler delle tre rotte AD, con le dipendenze da fuori.
 *
 * Sono le uniche rotte dell'applicazione sotto `requireRole("superadmin")`, e
 * stanno sulla pagina di impostazioni più pericolosa che abbiamo: una
 * regressione qui non la vedrebbe nessuno. Estrarle da `registerRoutes` è
 * l'unico modo di provarle senza rete e senza database — stessa forma di
 * `DipendenzeAutenticazione` in `server/auth.ts`.
 */
export type DipendenzeRotteAd = {
  archivio: ArchivioImpostazioni;
  prova: (
    endpoint: EndpointAd | null,
    credenziali?: { username: string; password: string },
  ) => Promise<EsitoProva>;
};

export function rotteAd(deps: DipendenzeRotteAd) {
  return {
    leggi: async (_req: Request, res: Response): Promise<void> => {
      // Nessun segreto da nascondere: l'URL non lo è, e ws.auth non si restituisce.
      try {
        res.json(vistaConfigAd(await deps.archivio.getAllSettings()));
      } catch (error) {
        console.error("Lettura della configurazione AD fallita:", error);
        res.status(500).json({ message: "Errore nella lettura della configurazione AD" });
      }
    },

    salva: async (req: Request, res: Response): Promise<void> => {
      const parsed = patchConfigAd(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Dati non validi", dettagli: parsed.error.issues });
        return;
      }
      try {
        res.json(await salvaConfigAd(deps.archivio, parsed.data));
      } catch (error) {
        console.error("Salvataggio della configurazione AD fallito:", error);
        res.status(500).json({ message: "Errore nel salvataggio della configurazione AD" });
      }
    },

    prova: async (req: Request, res: Response): Promise<void> => {
      const { username, password } = req.body ?? {};
      // Le credenziali di prova si usano una volta e basta: non vengono
      // salvate, non finiscono nei log e non tornano nella risposta.
      const credenziali =
        typeof username === "string" && username.trim() !== "" && typeof password === "string"
          ? { username, password }
          : undefined;
      try {
        // La configurazione salvata, interruttore ignorato: si prova prima di accendere.
        const endpoint = endpointAd(await deps.archivio.getAllSettings(), { ancheSpenta: true });
        res.json(await deps.prova(endpoint, credenziali));
      } catch {
        // Niente messaggio dell'errore né log: potrebbe citare l'URL, cioè la password.
        res.status(500).json({ riuscita: false, messaggio: "Errore imprevisto durante la prova" });
      }
    },
  };
}

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Troppi tentativi. Riprova tra un minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Multer separato per i JSON delle anagrafiche: quello sopra è tarato a 10 MB
// sui CSV di import, mentre l'export dei conduttori dell'intero consorzio può
// superarli. Il limite dei CSV non va alzato per riflesso.
const uploadWs = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ---- Template interpolation ----
function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

/**
 * Tratte di un invio: `segmentIds` (selezione multipla) oppure il vecchio
 * `segmentId` singolo, che resta accettato. Duplicati e valori non numerici
 * vengono scartati qui, così a valle si ragiona su una lista pulita.
 */
export function normalizzaSegmentIds(segmentIds: unknown, segmentId: unknown): number[] {
  const grezzi = Array.isArray(segmentIds)
    ? segmentIds
    : segmentId !== undefined && segmentId !== null && segmentId !== ""
      ? [segmentId]
      : [];
  const out: number[] = [];
  for (const v of grezzi) {
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    if (Number.isInteger(n) && out.indexOf(n) === -1) out.push(n);
  }
  return out;
}

function testoONull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/** La porta arriva dal form come stringa; vuota o non numerica = "non toccarla". */
function portaDaRichiesta(v: unknown): number | null | undefined {
  const s = testoONull(v);
  if (s === null) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// I test dall'interfaccia provano i valori del form, ma l'interfaccia non puo'
// rimostrare i segreti salvati: se un segreto arriva vuoto si usa quello attivo,
// altrimenti "prova" fallirebbe su una configurazione che invece funziona.
function configEmailDaRichiesta(body: any, attuale: ConfigEmail = getConfigEmail()): ConfigEmail {
  return {
    service: testoONull(body?.emailService) ?? attuale.service,
    user: testoONull(body?.emailUser) ?? attuale.user,
    password: testoONull(body?.emailPassword) ?? attuale.password,
    mittente: typeof body?.emailMittente === "string" ? body.emailMittente.trim() : attuale.mittente,
    smtpHost: testoONull(body?.smtpHost) ?? attuale.smtpHost,
    smtpPort: portaDaRichiesta(body?.smtpPort) ?? attuale.smtpPort,
    smtpSecure: typeof body?.smtpSecure === "boolean" ? body.smtpSecure : attuale.smtpSecure,
  };
}

/** Il mittente è facoltativo, ma se c'è dev'essere un indirizzo. */
function erroreMittente(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  return z.string().email().safeParse(v.trim()).success ? null : "Mittente: indirizzo email non valido";
}

function configSmsDaRichiesta(body: any): ConfigSms {
  const attuale = getConfigSms();
  return {
    clientid: testoONull(body?.clientid) ?? attuale.clientid,
    password: testoONull(body?.password) ?? attuale.password,
  };
}

// Tracking pixel (1x1 transparent GIF)
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function registerRoutes(app: Express): Promise<Server> {

  // ---- Auth ----

  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response, next) => {
    try {
      const { username, password } = req.body ?? {};
      const risultato = await autentica(
        typeof username === "string" ? username : "",
        typeof password === "string" ? password : "",
        await dipendenzeAutenticazione(),
      );

      if (risultato.esito !== "ok") {
        if (risultato.esito === "adNonRaggiungibile") {
          // Il dettaglio non va all'utente ma serve a noi in collaudo.
          console.error("Active Directory non raggiungibile:", risultato.dettaglio);
        }
        const { status, corpo } = rispostaLogin(risultato);
        return res.status(status).json(corpo);
      }

      const utente = risultato.utente;
      req.logIn(utente, async (loginErr) => {
        if (loginErr) return next(loginErr);
        // Questo corpo gira DOPO che il try/catch esterno si è già chiuso: una
        // promessa rifiutata qui non avrebbe nessun gestore, e la richiesta
        // resterebbe appesa senza risposta invece di rispondere 500. È il
        // percorso che ogni utente attraversa a ogni accesso, quindi il
        // gestore deve stare qui dentro.
        try {
          try {
            await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, utente.id));
          } catch (_) {
            // L'ora dell'ultimo accesso non vale un login fallito.
          }
          res.json({
            id: utente.id,
            username: utente.username,
            role: utente.role,
          });
        } catch (err) {
          next(err);
        }
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Non autenticato" });
    }
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    });
  });

  // ---- Segments ----

  app.get("/api/segments", async (req: Request, res: Response) => {
    try {
      const segments = await storage.getSegmentsWithCounts();
      res.json(segments);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle tratte" });
    }
  });

  app.get("/api/segments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const segment = await storage.getSegmentById(id);
      if (!segment) return res.status(404).json({ message: "Tratta non trovata" });
      res.json(segment);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero della tratta" });
    }
  });

  app.get("/api/segments/:id/users", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const users = await storage.getUsersBySegmentId(id);
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero degli utenti della tratta" });
    }
  });

  app.get("/api/segments/:id/parcels", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const parcels = await storage.getParcelsBySegmentId(id);
      res.json(parcels);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle particelle della tratta" });
    }
  });

  app.post("/api/segments", async (req: Request, res: Response) => {
    try {
      const data = insertSegmentSchema.parse(req.body);
      const segment = await storage.createSegment(data);
      res.status(201).json(segment);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nella creazione della tratta" });
    }
  });

  app.put("/api/segments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertSegmentSchema.partial().parse(req.body);
      const segment = await storage.updateSegment(id, data);
      if (!segment) return res.status(404).json({ message: "Tratta non trovata" });
      res.json(segment);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nell'aggiornamento della tratta" });
    }
  });

  app.put("/api/segments/:id/status", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!["active", "maintenance", "inactive"].includes(status)) {
        return res.status(400).json({ message: "Stato non valido" });
      }
      const segment = await storage.updateSegmentStatus(id, status);
      if (!segment) return res.status(404).json({ message: "Tratta non trovata" });
      res.json(segment);
    } catch (error) {
      res.status(500).json({ message: "Errore nell'aggiornamento dello stato della tratta" });
    }
  });

  app.delete("/api/segments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteSegment(id);
      if (!deleted) return res.status(404).json({ message: "Tratta non trovata" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione della tratta" });
    }
  });

  // ---- Consorziati ----

  app.get("/api/consorziati", async (req: Request, res: Response) => {
    try {
      const list = await storage.getAllConsorziati();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero dei consorziati" });
    }
  });

  app.get("/api/consorziati/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const c = await storage.getConsorziatiById(id);
      if (!c) return res.status(404).json({ message: "Consorziato non trovato" });
      res.json(c);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero del consorziato" });
    }
  });

  app.get("/api/consorziati/:id/segments", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const segments = await storage.getSegmentsByUserId(id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle tratte del consorziato" });
    }
  });

  app.get("/api/consorziati/:id/parcels", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const parcels = await storage.getParcelsByUserId(id);
      res.json(parcels);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle particelle del consorziato" });
    }
  });

  app.post("/api/consorziati", async (req: Request, res: Response) => {
    try {
      const data = insertConsorziatiSchema.parse(req.body);
      const c = await storage.createConsorziato(data);
      res.status(201).json(c);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nella creazione del consorziato" });
    }
  });

  app.put("/api/consorziati/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertConsorziatiSchema.partial().parse(req.body);
      const c = await storage.updateConsorziato(id, data);
      if (!c) return res.status(404).json({ message: "Consorziato non trovato" });
      res.json(c);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nell'aggiornamento del consorziato" });
    }
  });

  app.delete("/api/consorziati/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteConsorziato(id);
      if (!deleted) return res.status(404).json({ message: "Consorziato non trovato" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione del consorziato" });
    }
  });

  // ---- Cadastral Parcels ----

  app.get("/api/parcels", async (req: Request, res: Response) => {
    try {
      const parcels = await storage.getAllParcelsWithCounts();
      res.json(parcels);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle particelle catastali" });
    }
  });

  app.get("/api/parcels/:id/users", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const users = await storage.getUsersByParcelId(id);
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero dei consorziati della particella" });
    }
  });

  app.get("/api/parcels/:id/segments", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const segments = await storage.getSegmentsByParcelId(id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero delle tratte della particella" });
    }
  });

  app.get("/api/parcels/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const parcel = await storage.getParcelById(id);
      if (!parcel) return res.status(404).json({ message: "Particella non trovata" });
      res.json(parcel);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero della particella" });
    }
  });

  app.post("/api/parcels", async (req: Request, res: Response) => {
    try {
      const data = insertCadastralParcelSchema.parse(req.body);
      const parcel = await storage.createParcel(data);
      res.status(201).json(parcel);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nella creazione della particella" });
    }
  });

  app.put("/api/parcels/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertCadastralParcelSchema.partial().parse(req.body);
      const parcel = await storage.updateParcel(id, data);
      if (!parcel) return res.status(404).json({ message: "Particella non trovata" });
      res.json(parcel);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nell'aggiornamento della particella" });
    }
  });

  app.delete("/api/parcels/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteParcel(id);
      if (!deleted) return res.status(404).json({ message: "Particella non trovata" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione della particella" });
    }
  });

  // ---- Parcel-Segment mappings ----

  app.post("/api/segments/:id/parcels", async (req: Request, res: Response) => {
    try {
      const segmentId = parseInt(req.params.id);
      const { parcelId } = req.body;
      if (!parcelId) return res.status(400).json({ message: "parcelId richiesto" });
      const mapping = await storage.addParcelToSegment({ parcelId: parseInt(parcelId), segmentId });
      res.status(201).json(mapping);
    } catch (error) {
      res.status(500).json({ message: "Errore nell'aggiunta della particella alla tratta" });
    }
  });

  app.delete("/api/segments/:segId/parcels/:parcelId", async (req: Request, res: Response) => {
    try {
      const segmentId = parseInt(req.params.segId);
      const parcelId = parseInt(req.params.parcelId);
      const deleted = await storage.removeParcelFromSegment(parcelId, segmentId);
      if (!deleted) return res.status(404).json({ message: "Associazione non trovata" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nella rimozione della particella dalla tratta" });
    }
  });

  // ---- Parcel-User assignments ----

  app.post("/api/consorziati/:id/parcels", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      const { parcelId, role } = req.body;
      if (!parcelId) return res.status(400).json({ message: "parcelId richiesto" });
      const data = insertParcelUserAssignmentSchema.parse({ parcelId: parseInt(parcelId), userId, role });
      const assignment = await storage.addParcelToUser(data);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nell'assegnazione della particella al consorziato" });
    }
  });

  app.delete("/api/consorziati/:userId/parcels/:parcelId", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      const parcelId = parseInt(req.params.parcelId);
      const deleted = await storage.removeParcelFromUser(parcelId, userId);
      if (!deleted) return res.status(404).json({ message: "Assegnazione non trovata" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nella rimozione della particella dal consorziato" });
    }
  });

  // ---- Notification Templates ----

  app.get("/api/templates", async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero dei template" });
    }
  });

  app.post("/api/templates", async (req: Request, res: Response) => {
    try {
      const data = insertNotificationTemplateSchema.parse(req.body);
      // L'autore lo decide il server dalla sessione: se arrivasse dal corpo della
      // richiesta, chiunque potrebbe firmare un template a nome di un altro.
      const template = await storage.createTemplate(data, req.user?.username ?? null);
      res.status(201).json(template);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nella creazione del template" });
    }
  });

  app.put("/api/templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertNotificationTemplateSchema.partial().parse(req.body);
      // Chi modifica lo decide il server dalla sessione, come per l'autore:
      // l'autore però non cambia mai, la modifica si annota a parte (issue #18).
      const template = await storage.updateTemplate(id, data, req.user?.username ?? null);
      if (!template) return res.status(404).json({ message: "Template non trovato" });
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      res.status(500).json({ message: "Errore nell'aggiornamento del template" });
    }
  });

  app.delete("/api/templates/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteTemplate(id);
      if (!deleted) return res.status(404).json({ message: "Template non trovato" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione del template" });
    }
  });

  app.post("/api/templates/:id/set-default", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getTemplateById(id);
      if (!template) return res.status(404).json({ message: "Template non trovato" });
      await storage.setDefaultTemplate(id, template.tipoTemplate);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Errore nell'impostazione del template predefinito" });
    }
  });

  app.post("/api/templates/preview", async (req: Request, res: Response) => {
    try {
      const { templateId, variables } = req.body;
      let subject: string;
      let bodyEmail: string;
      let bodySms: string;

      if (templateId) {
        const template = await storage.getTemplateById(parseInt(templateId));
        if (!template) return res.status(404).json({ message: "Template non trovato" });
        subject = template.subject;
        bodyEmail = template.bodyEmail;
        bodySms = template.bodySms;
      } else {
        subject = req.body.subject || "";
        bodyEmail = req.body.bodyEmail || "";
        bodySms = req.body.bodySms || "";
      }

      const vars: Record<string, string> = variables || {};
      res.json({
        subject: interpolateTemplate(subject, vars),
        bodyEmail: interpolateTemplate(bodyEmail, vars),
        bodySms: interpolateTemplate(bodySms, vars),
      });
    } catch (error) {
      res.status(500).json({ message: "Errore nell'anteprima del template" });
    }
  });

  // ---- Notifications ----

  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const list = await storage.getAllNotifications();
      res.json(list);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle notifiche" });
    }
  });

  // Storico Notifiche (issue #12).
  // ATTENZIONE: deve restare prima di "/api/notifications/:id", altrimenti
  // "storico" verrebbe interpretato come id.
  app.get("/api/notifications/storico", async (req: Request, res: Response) => {
    try {
      const q = req.query as Record<string, string | undefined>;
      const rows = await storage.getNotificationHistory({
        utente: q.utente || undefined,
        dataInizio: q.dataInizio || undefined,
        dataFine: q.dataFine || undefined,
        roggia: q.roggia || undefined,
        tipo: q.tipo || undefined,
        classificazione: q.classificazione || undefined,
        destinatario: q.destinatario || undefined,
      });
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dello storico notifiche" });
    }
  });

  app.get("/api/notifications/storico/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ message: "Id non valido" });
      const detail = await storage.getNotificationHistoryDetail(id);
      if (!detail) return res.status(404).json({ message: "Notifica non trovata" });
      res.json(detail);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero del dettaglio notifica" });
    }
  });

  app.get("/api/notifications/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const notification = await storage.getNotificationById(id);
      if (!notification) return res.status(404).json({ message: "Notifica non trovata" });
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero della notifica" });
    }
  });

  app.get("/api/notifications/:id/recipients", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const recipients = await storage.getRecipientsByNotificationId(id);
      res.json(recipients);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero dei destinatari" });
    }
  });

  app.delete("/api/notifications/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteNotification(id);
      if (!deleted) return res.status(404).json({ message: "Notifica non trovata" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'eliminazione della notifica" });
    }
  });

  // L'invio dalla pagina «Invia notifica», sull'anagrafica vera (issue #23).
  //
  // Sta accanto a `/send` ma non ci passa: quella rotta risolve i destinatari
  // dalle tabelle legacy con id numerici e serve ancora allo scheduler, mentre
  // qui le chiavi sono i codici del mirror. La logica sta in
  // `server/invio-notifica.ts`, dove è testabile senza Express.
  app.post("/api/notifications/invia", async (req: Request, res: Response) => {
    try {
      // Gestione Codici (issue #52): un codice spento non riceve comunicazioni.
      // La pagina non lo offre più, ma una scheda rimasta aperta da prima dello
      // spegnimento lo può ancora spedire — si rifiuta tutto, prima di
      // scrivere, come per la PEC non configurata.
      const soloTesti = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : [];
      const bloccati = (await caricaFiltroCodici(storage)).bloccati(soloTesti(req.body?.tratte), soloTesti(req.body?.madri));
      if (bloccati.length > 0) {
        return res.status(400).json({
          message: `Codici spenti in Gestione Codici: ${bloccati.join(", ")}. Aggiorna la pagina e rifai la selezione.`,
        });
      }
      const esito = await preparaInvio(req.body ?? {}, {
        // Dalla sessione, non dal corpo: chi ha spedito non deve poterselo
        // firmare da solo.
        createdBy: req.user?.username ?? null,
      });
      if (!esito.ok) return res.status(400).json({ message: esito.errore });

      // Si risponde appena notifica e destinatari sono in tabella, e la
      // spedizione prosegue fuori dalla richiesta: con Gmail una mail costa
      // circa un secondo, e su una selezione ampia il proxy chiuderebbe la
      // connessione prima della fine. Gli esiti li porta lo Storico.
      res.status(202).json({ notificationId: esito.preparato.notificationId, destinatari: esito.destinatari });

      spedisciPreparato(esito.preparato).catch((error) => {
        console.error("Errore durante la spedizione della notifica:", error);
      });
    } catch (error) {
      console.error("Errore nell'invio della notifica:", error);
      res.status(500).json({ message: "Errore nell'invio della notifica" });
    }
  });

  app.post("/api/notifications/send", async (req: Request, res: Response) => {
    try {
      const {
        segmentId,
        segmentIds,
        templateId,
        subject: rawSubject,
        message: rawMessage,
        scheduledAt,
        sendEmail = true,
        sendSms: doSendSms = false,
        variables: templateVars = {},
        createdBy,
        tipo: rawTipo,
        classificazione: rawClassificazione,
      } = req.body;

      // I due assi sono obbligatori: senza, lo Storico avrebbe colonne vuote e
      // filtri inaffidabili proprio sui campi che il consorzio usa per cercare.
      const esitoClassificazione = validaClassificazioneInvio({
        tipo: rawTipo,
        classificazione: rawClassificazione,
      });
      if (!esitoClassificazione.ok) {
        return res.status(400).json({ message: esitoClassificazione.errore });
      }
      const { tipo, classificazione } = esitoClassificazione;

      // Resolve subject/message from template or raw body
      let subject = rawSubject || "";
      let emailBody = rawMessage || "";
      let smsBody = rawMessage || "";

      if (templateId) {
        const template = await storage.getTemplateById(parseInt(templateId));
        if (template) {
          subject = interpolateTemplate(template.subject, templateVars);
          emailBody = interpolateTemplate(template.bodyEmail, templateVars);
          smsBody = interpolateTemplate(template.bodySms, templateVars);
        }
      } else {
        subject = interpolateTemplate(subject, templateVars);
        emailBody = interpolateTemplate(emailBody, templateVars);
        smsBody = interpolateTemplate(smsBody, templateVars);
      }

      if (!subject) return res.status(400).json({ message: "Soggetto richiesto" });
      if (!emailBody) return res.status(400).json({ message: "Messaggio richiesto" });

      const idsSegmenti = normalizzaSegmentIds(segmentIds, segmentId);

      // Handle scheduled notification
      if (scheduledAt) {
        // La notifica programmata porta una sola tratta in tabella e il
        // dispatcher risolve i destinatari al momento dell'invio: su più tratte
        // ne perderebbe per strada senza dirlo a nessuno.
        if (idsSegmenti.length > 1) {
          return res.status(400).json({
            message: "L'invio programmato su più tratte non è ancora supportato",
          });
        }
        const notification = await storage.createNotification({
          segmentId: idsSegmenti[0],
          templateId: templateId ? parseInt(templateId) : undefined,
          tipo,
          classificazione,
          subject,
          message: emailBody,
          status: "scheduled",
          scheduledAt: new Date(scheduledAt),
          recipientCount: 0,
          createdBy: createdBy || null,
        });
        return res.status(201).json({ notification, scheduled: true });
      }

      // Resolve recipients via parcel chain
      const coppie: CoppiaDestinatario<Consorziato>[] = [];
      for (const id of idsSegmenti) {
        // Snapshot della tratta, conservato sui destinatari per lo Storico:
        // le anagrafiche cambiano a ogni sync, lo storico no.
        const segment = await storage.getSegmentById(id);
        const users = await storage.getUsersBySegmentId(id);
        for (const u of users) {
          coppie.push({
            conduttore: u,
            keyroggia: segment?.code ?? null,
            roggiaDescrizione: segment?.name ?? null,
          });
        }
      }

      // Un conduttore legato a più tratte selezionate è un destinatario solo e
      // riceve una sola comunicazione (issue #5): lo snapshot elenca tutte le
      // tratte che lo hanno raggiunto, ed è quindi per destinatario.
      const recipients = aggregaDestinatari(coppie, (u) => String(u.id)).map((d) => ({
        userId: d.conduttore.id,
        email: d.conduttore.email,
        phone: d.conduttore.phone,
        firstName: d.conduttore.firstName,
        lastName: d.conduttore.lastName,
        // Codice e descrizione del conduttore insieme, da un'unica regola: il
        // codice non veniva scritto da nessuno, e cercare un conduttore per
        // codice nello Storico non trovava mai niente (issue #12).
        snapshotConduttore: snapshotConduttore(d.conduttore),
        snapshotTratta: {
          keyroggia: codiciTratte(d.tratte),
          roggiaDescrizione: descrizioniTratte(d.tratte),
        },
      }));

      if (recipients.length === 0) {
        return res.status(400).json({ message: "Nessun destinatario trovato" });
      }

      // Create notification record
      const notification = await storage.createNotification({
        // La tabella tiene una tratta sola: con più tratte la verità sta nello
        // snapshot dei destinatari, che le elenca tutte.
        segmentId: idsSegmenti.length === 1 ? idsSegmenti[0] : undefined,
        templateId: templateId ? parseInt(templateId) : undefined,
        tipo,
        classificazione,
        subject,
        message: emailBody,
        status: "sending",
        recipientCount: recipients.length,
        emailCount: sendEmail ? recipients.length : 0,
        smsCount: doSendSms ? recipients.filter(r => !!r.phone).length : 0,
        createdBy: createdBy || null,
      });

      let emailsSent = 0;
      let smsSent = 0;

      // Send emails
      const configEmail = getConfigEmail();
      if (sendEmail && emailConfigurata(configEmail)) {
        try {
          const transporter = createTransporter(configEmail);
          for (const recipient of recipients) {
            const trackingToken = `${notification.id}-${recipient.userId}`;
            const trackingPixel = `<img src="${process.env.APP_URL || ""}/api/track/open/${trackingToken}" width="1" height="1" style="display:none;" />`;

            const personalVars = {
              ...templateVars,
              first_name: recipient.firstName,
              last_name: recipient.lastName,
            };
            const personalEmailBody = templateId
              ? emailBody
              : interpolateTemplate(emailBody, personalVars);

            const htmlWithTracking = personalEmailBody + trackingPixel;

            try {
              const info = await transporter.sendMail({
                from: mittenteDi(configEmail),
                to: recipient.email,
                subject,
                html: htmlWithTracking,
              });

              const messageId = (info as any).messageId || null;
              await storage.createNotificationRecipient({
                notificationId: notification.id,
                userId: recipient.userId,
                ...recipient.snapshotConduttore,
                ...recipient.snapshotTratta,
                email: recipient.email,
                phone: recipient.phone || null,
                emailStatus: "sent",
                smsStatus: "pending",
                emailMessageId: messageId,
                sentAt: new Date(),
              });
              emailsSent++;
            } catch (emailErr) {
              console.error(`Errore invio email a ${recipient.email}:`, emailErr);
              await storage.createNotificationRecipient({
                notificationId: notification.id,
                userId: recipient.userId,
                ...recipient.snapshotConduttore,
                ...recipient.snapshotTratta,
                email: recipient.email,
                phone: recipient.phone || null,
                emailStatus: "failed",
                smsStatus: "pending",
              });
            }
          }
        } catch (err) {
          console.error("Errore configurazione email:", err);
        }
      } else {
        // Create recipients without sending
        for (const recipient of recipients) {
          await storage.createNotificationRecipient({
            notificationId: notification.id,
            userId: recipient.userId,
            ...recipient.snapshotConduttore,
            ...recipient.snapshotTratta,
            email: recipient.email,
            phone: recipient.phone || null,
            emailStatus: "pending",
            smsStatus: "pending",
          });
        }
      }

      // Send SMS
      if (doSendSms) {
        if (!isSMSConfigured()) {
          console.log("SMS non configurato - necessarie le credenziali Register.it");
        } else {
          for (const recipient of recipients) {
            if (!recipient.phone) continue;
            try {
              const result = await sendSMS(recipient.phone, smsBody);
              const existingRecipient = (await storage.getRecipientsByNotificationId(notification.id))
                .find(r => r.userId === recipient.userId);
              if (existingRecipient) {
                await storage.updateRecipientSmsStatus(
                  existingRecipient.id,
                  result.success ? "sent" : "failed"
                );
                if (result.success && result.messageId) {
                  // Store SID via partial update (handled inline)
                }
              }
              if (result.success) smsSent++;
            } catch (smsErr) {
              console.error(`Errore invio SMS a ${recipient.phone}:`, smsErr);
            }
          }
        }
      }

      await storage.updateNotificationStatus(notification.id, "sent", new Date());

      res.status(201).json({ notification, emailsSent, smsSent });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Dati non validi", errors: error.errors });
      console.error(error);
      res.status(500).json({ message: "Errore nell'invio della notifica" });
    }
  });

  // ---- Sincronizzazione anagrafiche consorzio ----

  app.post("/api/sync", async (req: Request, res: Response) => {
    try {
      const syncLogId = await avviaSync("manuale");
      res.status(202).json({ syncLogId });
    } catch (error) {
      if (error instanceof SyncGiaInCorso) {
        return res.status(409).json({ message: "Sincronizzazione già in corso" });
      }
      console.error(error);
      res.status(500).json({ message: "Errore nell'avvio della sincronizzazione" });
    }
  });

  app.get("/api/sync/status", async (req: Request, res: Response) => {
    try {
      const recenti = await storage.getRecentSyncLogs(20);
      res.json(componiStatoSync(recenti, syncInCorso()));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dello stato di sincronizzazione" });
    }
  });

  // Lo storico è riservato agli amministratori: i messaggi d'errore contengono
  // l'indirizzo del web service del consorzio (source.ts lo mette nel testo).
  app.get("/api/sync/logs", requireAdmin, async (req: Request, res: Response) => {
    try {
      const richiesto = Number(req.query.limit);
      const limite = Number.isFinite(richiesto) && richiesto > 0
        ? Math.min(Math.floor(richiesto), 50)
        : 10;
      res.json(await storage.getRecentSyncLogs(limite));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dello storico dei caricamenti" });
    }
  });

  // ---- Anagrafiche (sola lettura dallo specchio consorzio) ----

  app.get("/api/anagrafiche/rogge", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json((await storage.getRigheRogge()).filter((r) => filtro.madreAttiva(r.codiceMadre)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle rogge" });
    }
  });

  app.get("/api/anagrafiche/rogge-madri", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json((await storage.getRigheRoggeMadri()).filter((r) => filtro.roggiaMadreAttiva(r.codiceMadre)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle rogge madri" });
    }
  });

  app.get("/api/anagrafiche/destinatari", async (req: Request, res: Response) => {
    try {
      res.json(await storage.getRigheDestinatari());
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dei destinatari" });
    }
  });

  app.get("/api/anagrafiche/legami", async (req: Request, res: Response) => {
    try {
      const metodo = String(req.query.metodo ?? "");
      if (metodo !== "live" && metodo !== "stagione") {
        return res.status(400).json({ message: "Metodo non valido: attesi 'live' o 'stagione'" });
      }
      // Un legame si nasconde con la sua tratta, e una tratta solo quando
      // nessuna delle sue madri è accesa (vedi `FiltroCodici.trattaAttiva`).
      const filtro = await caricaFiltroCodici(storage);
      res.json((await storage.getRigheLegami(metodo)).filter((r) => filtro.trattaAttiva(r.codiceFiglia)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dei legami" });
    }
  });

  // ---- Consorzio: selezione a cascata di Invia notifica (issue #14) ----
  //
  // Sono le stesse tabelle delle Anagrafiche, lette nella forma che serve alla
  // pagina di invio. Fino a qui la pagina girava su fixture inventate: il
  // filtro sui destinatari attivi vale solo se lo applica il codice che l'utente
  // usa davvero.

  app.get("/api/consorzio/madri", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json((await storage.getMadriSelezionabili()).filter((m) => filtro.madreAttiva(m.codicemadre)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle madri" });
    }
  });

  app.get("/api/consorzio/tratte", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json(await storage.getTratteDiMadri(leggiCodici(req.query.madri).filter((m) => filtro.madreAttiva(m))));
    } catch (error) {
      if (error instanceof TroppiCodici) return res.status(400).json({ message: error.message });
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle tratte" });
    }
  });

  app.get("/api/consorzio/destinatari", async (req: Request, res: Response) => {
    try {
      // Il legame è obbligatorio (issue #27): senza, questa rotta tornerebbe
      // l'unione dei due elenchi del consorzio, che è precisamente il
      // comportamento che la issue chiede di togliere.
      const legame = validaLegame(req.query.legame);
      if (legame === null) {
        return res.status(400).json({ message: "Tipo di legame mancante o non valido: attesi 'live' o 'stagione'" });
      }
      // Due modi di chiedere gli stessi destinatari: per tratta (rogge e
      // impianti) o per madre intera (i pozzi, issue #26). Il client ne usa uno
      // per volta; sommarli qui evita una seconda rotta che direbbe lo stesso.
      // I codici spenti si tolgono in silenzio: è un'anteprima, e il rifiuto
      // esplicito lo dà l'invio.
      const filtro = await caricaFiltroCodici(storage);
      res.json([
        ...(await storage.getDestinatariPerTratte(leggiCodici(req.query.tratte).filter((t) => filtro.trattaAttiva(t)), legame)),
        ...(await storage.getDestinatariPerMadri(leggiCodici(req.query.madri).filter((m) => filtro.madreAttiva(m)), legame)),
        // Terza strada, la seconda gerarchia (issue #49). `aggregaDestinatari`
        // toglie i doppioni a valle, come già fa fra tratte e madri.
        ...(await storage.getDestinatariPerRoggeMadri(leggiCodici(req.query.roggeMadri).filter((m) => filtro.roggiaMadreAttiva(m)), legame)),
      ]);
    } catch (error) {
      if (error instanceof TroppiCodici) return res.status(400).json({ message: error.message });
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dei destinatari" });
    }
  });

  // Quanti conduttori ha ciascuno dei due legami, su questa selezione e in
  // tutto il mirror (issue #27). Alimenta il popup di scelta: senza questi
  // numeri un elenco vuoto non saprebbe dire se l'export del consorzio non è
  // arrivato o se su queste tratte non c'è nessuno.
  app.get("/api/consorzio/legami/conteggi", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json(await storage.conteggiLegami(
        leggiCodici(req.query.tratte).filter((t) => filtro.trattaAttiva(t)),
        leggiCodici(req.query.madri).filter((m) => filtro.madreAttiva(m)),
        leggiCodici(req.query.roggeMadri).filter((m) => filtro.roggiaMadreAttiva(m)),
      ));
    } catch (error) {
      if (error instanceof TroppiCodici) return res.status(400).json({ message: error.message });
      console.error(error);
      res.status(500).json({ message: "Errore nel conteggio dei legami" });
    }
  });

  // ---- Consorzio: seconda gerarchia, le rogge madri R (issue #49) ----
  //
  // Rotte proprie e non un parametro su /madri e /tratte: le due gerarchie
  // hanno tabelle diverse, righe di forma diversa (una figlia R porta anche il
  // suo impianto) e possono essere caricate una senza l'altra.

  app.get("/api/consorzio/rogge-madri", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json((await storage.getRoggeMadri()).filter((m) => filtro.roggiaMadreAttiva(m.codicemadre)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle rogge madri" });
    }
  });

  app.get("/api/consorzio/rogge-tratte", async (req: Request, res: Response) => {
    try {
      const filtro = await caricaFiltroCodici(storage);
      res.json(await storage.getTratteDiRoggeMadri(leggiCodici(req.query.madri).filter((m) => filtro.roggiaMadreAttiva(m))));
    } catch (error) {
      if (error instanceof TroppiCodici) return res.status(400).json({ message: error.message });
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle tratte delle rogge madri" });
    }
  });

  // ---- Gestione Codici (issue #52) ----
  //
  // L'elenco è quello del mirror, intero: un codice spento resta qui, o non ci
  // sarebbe più modo di riaccenderlo. Le altre letture lo tolgono passando da
  // `caricaFiltroCodici`; Storico, Dashboard e stato delle rogge no — raccontano
  // cosa è successo, anche a chi oggi è spento.

  app.get("/api/gestione-codici", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [madri, roggeMadri, spenti] = await Promise.all([
        storage.getAllMadri(), storage.getRoggeMadri(), storage.getCodiciSpenti(),
      ]);
      const risposta: RispostaGestioneCodici = {
        impianti: madri.map((m) => ({ codice: m.codice, descrizione: m.name, attivo: spenti.impianti.indexOf(m.codice) === -1 })),
        rogge: roggeMadri.map((m) => ({ codice: m.codicemadre, descrizione: m.name, attivo: spenti.rogge.indexOf(m.codicemadre) === -1 })),
      };
      res.json(risposta);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dei codici" });
    }
  });

  app.put("/api/gestione-codici", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { gerarchia, codice, attivo } = req.body ?? {};
      if (!isGerarchiaCodice(gerarchia)) {
        return res.status(400).json({ message: "Gerarchia non valida: attese 'impianti' o 'rogge'" });
      }
      if (typeof codice !== "string" || codice.trim() === "" || typeof attivo !== "boolean") {
        return res.status(400).json({ message: "Servono il codice e lo stato acceso/spento" });
      }
      // Solo codici che il mirror conosce: uno inventato finirebbe in tabella
      // senza che nessuna schermata sappia mostrarlo o riaccenderlo.
      const noti = gerarchia === "impianti"
        ? (await storage.getAllMadri()).map((m) => m.codice)
        : (await storage.getRoggeMadri()).map((m) => m.codicemadre);
      if (noti.indexOf(codice) === -1) return res.status(404).json({ message: `Codice ${codice} non presente nel registro` });
      await storage.impostaCodiceSpento(gerarchia, codice, !attivo, req.user?.username ?? null);
      res.json({ gerarchia, codice, attivo });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel salvataggio del codice" });
    }
  });

  // Lo stato aperta/chiusa dei codici del consorzio (issue #22).
  //
  // Una rotta sola per tre pagine — Dashboard, Invia notifica, Anagrafiche —
  // perché la regola sta in `shared/stato-rogge.ts` e tre letture diverse
  // sarebbero tre occasioni di rispondere in modo diverso alla stessa domanda.
  app.get("/api/consorzio/stato-rogge", async (req: Request, res: Response) => {
    try {
      const eventi = await storage.getEventiStato();
      const madri = await storage.getMappaMadri();
      // 60 giorni: il doppio della finestra che la Dashboard disegna, così un
      // fuso o un giorno di ritardo non tagliano la prima barra del grafico.
      const da = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const risposta = componiRispostaStato(eventi, da, madri);
      // Le figlie di una madre chiusa mai nominate arrivano senza nome: la
      // mappa del registro porta solo i codici. Si rileggono qui, una query
      // sola, e solo per le madri che ne hanno bisogno.
      const madriSenzaNomi: string[] = [];
      for (const t of risposta.tratteChiuse) {
        const m = t.chiusaDaCodice;
        if (t.descrizione === null && m !== null && m !== t.codice && madriSenzaNomi.indexOf(m) === -1) madriSenzaNomi.push(m);
      }
      if (madriSenzaNomi.length > 0) {
        const nomi = new Map((await storage.getTratteDiMadri(madriSenzaNomi)).map((f) => [f.keyroggia, f.name]));
        for (const t of risposta.tratteChiuse) {
          if (t.descrizione === null) t.descrizione = nomi.get(t.codice) ?? null;
        }
      }
      res.json(risposta);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dello stato delle rogge" });
    }
  });

  // ---- Settings ----

  // Configurazione email/SMS — riservata agli amministratori come quella del WS:
  // sono credenziali con cui il server manda messaggi a nome del consorzio.
  app.get("/api/settings/email", requireAdmin, (_req: Request, res: Response) => {
    const c = getConfigEmail();
    // La password non torna mai al client: si dice solo se e' impostata.
    res.json({
      emailService: c.service,
      emailUser: c.user,
      emailMittente: c.mittente,
      smtpHost: c.smtpHost ?? "",
      smtpPort: c.smtpPort === null ? "" : String(c.smtpPort),
      smtpSecure: c.smtpSecure,
      passwordImpostata: c.password !== "",
      configurata: emailConfigurata(c),
    });
  });

  app.post("/api/settings/email", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailService, emailUser, emailPassword, emailMittente, smtpHost, smtpPort, smtpSecure } = req.body;
      const errore = erroreMittente(emailMittente);
      if (errore) return res.status(400).json({ message: errore });
      await salvaConfigEmail(storage, {
        service: emailService,
        user: emailUser,
        password: emailPassword,
        mittente: typeof emailMittente === "string" ? emailMittente : undefined,
        smtpHost: smtpHost ?? null,
        smtpPort: portaDaRichiesta(smtpPort),
        smtpSecure: typeof smtpSecure === "boolean" ? smtpSecure : undefined,
      });
      res.json({ success: true, message: "Configurazione email salvata" });
    } catch (error) {
      res.status(500).json({ message: "Errore nel salvataggio delle impostazioni email" });
    }
  });

  app.post("/api/settings/email/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const transporter = createTransporter(configEmailDaRichiesta(req.body));
      await transporter.verify();
      res.json({ success: true, message: "Connessione email riuscita" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message || "Test email fallito" });
    }
  });

  // Mail vera a un indirizzo scelto sul momento, con le credenziali salvate del
  // canale indicato: «Test Connessione» prova solo il login (server/email-prova.ts).
  app.post("/api/settings/email/invia-prova", requireAdmin, async (req: Request, res: Response) => {
    const richiesta = richiestaEmailProvaSchema.safeParse(req.body);
    if (!richiesta.success) {
      return res.status(400).json({ message: richiesta.error.issues[0]?.message ?? "Richiesta non valida" });
    }
    const esito = await inviaEmailProva(richiesta.data.canale, richiesta.data.destinatario);
    if (!esito.inviata) return res.status(400).json({ message: esito.motivo });
    res.json({ success: true, message: `Mail di prova inviata a ${esito.destinatario} da ${esito.mittente}` });
  });

  // La PEC ha il suo account, separato da quello ordinario (issue #23): metà dei
  // conduttori attivi ha un indirizzo certificato, e da una casella normale
  // quella comunicazione non avrebbe valore legale.
  app.get("/api/settings/email-pec", requireAdmin, (_req: Request, res: Response) => {
    const c = getConfigEmailPec();
    res.json({
      emailService: c.service,
      emailUser: c.user,
      emailMittente: c.mittente,
      smtpHost: c.smtpHost ?? "",
      smtpPort: c.smtpPort === null ? "" : String(c.smtpPort),
      smtpSecure: c.smtpSecure,
      passwordImpostata: c.password !== "",
      configurata: emailConfigurata(c),
    });
  });

  app.post("/api/settings/email-pec", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { emailService, emailUser, emailPassword, emailMittente, smtpHost, smtpPort, smtpSecure } = req.body;
      const errore = erroreMittente(emailMittente);
      if (errore) return res.status(400).json({ message: errore });
      await salvaConfigEmailPec(storage, {
        service: emailService,
        user: emailUser,
        password: emailPassword,
        mittente: typeof emailMittente === "string" ? emailMittente : undefined,
        smtpHost: smtpHost ?? null,
        smtpPort: portaDaRichiesta(smtpPort),
        smtpSecure: typeof smtpSecure === "boolean" ? smtpSecure : undefined,
      });
      res.json({ success: true, message: "Configurazione PEC salvata" });
    } catch (error) {
      res.status(500).json({ message: "Errore nel salvataggio delle impostazioni PEC" });
    }
  });

  app.post("/api/settings/email-pec/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const transporter = createTransporter(configEmailDaRichiesta(req.body, getConfigEmailPec()));
      await transporter.verify();
      res.json({ success: true, message: "Connessione PEC riuscita" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message || "Test PEC fallito" });
    }
  });

  app.get("/api/settings/sms", requireAdmin, (_req: Request, res: Response) => {
    const c = getConfigSms();
    // La password non torna mai al client: si dice solo se e' impostata.
    res.json({
      clientid: c.clientid,
      passwordImpostata: c.password !== "",
      configurata: isSMSConfigured(c),
    });
  });

  app.post("/api/settings/sms", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { clientid, password } = req.body;
      await salvaConfigSms(storage, { clientid, password });
      res.json({ success: true, message: "Configurazione SMS salvata" });
    } catch (error) {
      res.status(500).json({ message: "Errore nel salvataggio delle impostazioni SMS" });
    }
  });

  // SMS vero al numero scelto, con le credenziali salvate: la prova sopra
  // interroga solo il credito (server/sms-prova.ts).
  app.post("/api/settings/sms/invia-prova", requireAdmin, async (req: Request, res: Response) => {
    const richiesta = richiestaSmsProvaSchema.safeParse(req.body);
    if (!richiesta.success) {
      return res.status(400).json({ message: richiesta.error.issues[0]?.message ?? "Richiesta non valida" });
    }
    const esito = await inviaSmsProva(richiesta.data.numero);
    if (!esito.inviato) return res.status(400).json({ message: esito.motivo });
    res.json({ success: true, message: `SMS di prova inviato a ${esito.numero}` });
  });

  app.post("/api/settings/sms/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      // Interroga il credito: prova le credenziali senza spendere un messaggio.
      const result = await testConnessioneSms(configSmsDaRichiesta(req.body));
      if (result.success) {
        res.json({ success: true, message: "Credenziali SMS valide" });
      } else {
        res.status(400).json({ success: false, message: result.error || "Test SMS fallito" });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Errore nel test SMS" });
    }
  });

  app.get("/api/settings/ws", requireAdmin, async (req: Request, res: Response) => {
    try {
      const settings = await storage.getAllSettings();
      const config = leggiConfigWs(settings);
      // La stringa di autenticazione è un segreto: si comunica solo se esiste.
      res.json({ authImpostata: config.auth !== null, base: config.base ?? "", entita: config.entita });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero della configurazione" });
    }
  });

  app.post("/api/settings/ws", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { auth, base, entita } = req.body as {
        auth?: string;
        base?: string;
        entita?: Record<string, { mode?: string; url?: string; path?: string }>;
      };

      // Campo vuoto = non modificare il segreto già salvato.
      if (typeof auth === "string" && auth.trim() !== "") {
        await storage.setSetting("ws.auth", auth.trim());
      }
      // La base non è un segreto: si può anche svuotare.
      if (typeof base === "string") await storage.setSetting(CHIAVE_BASE, base.trim());

      for (const e of WS_ENTITIES) {
        const c = entita?.[e];
        if (!c) continue;
        await storage.setSetting(chiaveSetting(e, "mode"), c.mode === "file" ? "file" : "http");
        await storage.setSetting(chiaveSetting(e, "url"), (c.url ?? "").trim());
        await storage.setSetting(chiaveSetting(e, "path"), (c.path ?? "").trim());
      }
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel salvataggio della configurazione" });
    }
  });

  app.post("/api/settings/ws/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const entita = req.body?.entita as WsEntity;
      if (!WS_ENTITIES.includes(entita)) {
        return res.status(400).json({ message: "Entità non valida" });
      }
      const config = leggiConfigWs(await storage.getAllSettings());
      const source = creaSource(config);
      // Nessuna delle otto entità richiede parametri: l'endpoint del consorzio
      // porta già il suo argomento nel percorso (`/getroggeorari/S`).
      const righe = estraiArray(await source.fetchRaw(entita));
      res.json({ ok: true, righe: righe.length });
    } catch (error) {
      res.json({ ok: false, errore: (error as Error).message });
    }
  });

  app.post("/api/settings/ws/upload", requireAdmin, (req: Request, res: Response) => {
    // multer va invocato a mano invece che come middleware per poter tradurre
    // i suoi errori in messaggi italiani: lasciati propagare diventano un 500
    // generico che all'utente non dice nulla.
    uploadWs.single("file")(req, res, async (errUpload: any) => {
      if (errUpload) {
        let errore: string;
        if (errUpload.code === "LIMIT_FILE_SIZE") {
          errore = "File troppo grande: il limite è 50 MB";
        } else if (errUpload.code === "LIMIT_UNEXPECTED_FILE") {
          errore = "Campo file inatteso: il file va inviato nel campo \"file\"";
        } else {
          // Il messaggio di multer è sempre in inglese e non è pensato per
          // l'utente finale: resta nei log per chi deve indagare.
          console.error("Errore multer su /api/settings/ws/upload:", errUpload);
          errore = "Caricamento fallito";
        }
        return res.status(400).json({ ok: false, errore });
      }

      const entita = req.body?.entita as WsEntity;
      if (!WS_ENTITIES.includes(entita)) {
        return res.status(400).json({ ok: false, errore: "Entità non valida" });
      }
      if (!req.file) {
        return res.status(400).json({ ok: false, errore: "Nessun file ricevuto" });
      }

      let esito;
      try {
        esito = await salvaFileEntita(entita, req.file.buffer);
      } catch (error) {
        // Ogni rifiuto di salvaFileEntita è colpa del file caricato, non del
        // server: 400 con il messaggio testuale già in italiano. Un non-Error
        // non avrebbe .message: senza il fallback il campo "errore" sparirebbe
        // dalla risposta JSON invece di restare vuoto.
        const messaggio = error instanceof Error ? error.message : "Errore imprevisto";
        return res.status(400).json({ ok: false, errore: messaggio });
      }

      try {
        // La configurazione si tocca solo ora: invertire i due passi
        // significherebbe poter puntare app_settings a un file mai scritto.
        await storage.setSetting(chiaveSetting(entita, "mode"), "file");
        await storage.setSetting(chiaveSetting(entita, "path"), esito.percorso);
      } catch (error) {
        // Qui il file è già salvo su disco: un guasto in questo blocco è del
        // server (DB non raggiungibile, errore transitorio), non del file
        // caricato, quindi 500 — non va confuso con un rifiuto di
        // salvaFileEntita, che è sempre un 400.
        console.error("Errore nel salvataggio della configurazione WS:", error);
        return res.status(500).json({ ok: false, errore: "Errore interno nel salvataggio della configurazione" });
      }

      res.json({
        ok: true,
        righe: esito.righe,
        percorso: esito.percorso,
        avvisi: esito.avvisi,
      });
    });
  });

  /**
   * Configurazione di Active Directory: **solo superadmin**, unica sezione
   * dell'app con questo livello. Chi modifica host e certificato decide quale
   * macchina riceve le password di dominio del personale — le altre schede di
   * Impostazioni, al peggio, interrompono un servizio.
   */
  const ad = rotteAd({ archivio: storage, prova: provaEndpoint });
  app.get("/api/settings/ad", requireRole("superadmin"), ad.leggi);
  app.post("/api/settings/ad", requireRole("superadmin"), ad.salva);
  app.post("/api/settings/ad/test", requireRole("superadmin"), ad.prova);

  // ---- Avvisi del caricamento notturno (issue #6) ----

  app.get("/api/settings/avvisi-sync", requireAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({ destinatari: leggiDestinatari(await storage.getAllSettings()) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero dei destinatari degli avvisi" });
    }
  });

  app.post("/api/settings/avvisi-sync", requireAdmin, async (req: Request, res: Response) => {
    try {
      const testo = typeof req.body?.destinatari === "string" ? req.body.destinatari : "";
      const { validi, invalidi } = validaDestinatari(separaDestinatari(testo));
      // Un refuso non deve poter spegnere gli avvisi in silenzio: si rifiuta
      // tutto il salvataggio dicendo quale indirizzo è sbagliato.
      if (invalidi.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Indirizzi non validi: ${invalidi.join(", ")}`,
        });
      }
      await storage.setSetting(CHIAVE_DESTINATARI, validi.join(", "));
      res.json({ success: true, destinatari: validi });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel salvataggio dei destinatari degli avvisi" });
    }
  });

  // Prova end-to-end di indirizzi e credenziali: senza, l'unico modo di sapere
  // se la lista funziona è aspettare le 03:00.
  app.post("/api/settings/avvisi-sync/test", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const [ultimo] = await storage.getRecentSyncLogs(1);
      const base = ultimo
        ? componiAvvisoDaLog(ultimo)
        : componiAvvisoGuasto("Nessun caricamento registrato: questo è solo un messaggio di prova", new Date());
      const esito = await inviaAvvisoSync({ ...base, oggetto: `[PROVA] ${base.oggetto}` });
      if (!esito.inviato) {
        return res.status(400).json({ success: false, message: descriviMancatoInvio(esito) });
      }
      res.json({
        success: true,
        message: `Messaggio di prova inviato a ${esito.destinatari} ${esito.destinatari === 1 ? "destinatario" : "destinatari"}`,
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ success: false, message: error?.message || "Prova fallita" });
    }
  });

  // ---- Tracking ----

  app.get("/api/track/open/:token", async (req: Request, res: Response) => {
    try {
      // Due formati: quello nuovo porta l'id della riga destinatario, quello
      // storico lo userId dei consorziati legacy (vedi server/tracking-token.ts).
      const rif = leggiTokenTracking(req.params.token);
      if (rif) {
        const recipients = await storage.getRecipientsByNotificationId(rif.notificationId);
        const recipient = "recipientId" in rif
          ? recipients.find(r => r.id === rif.recipientId)
          : recipients.find(r => r.userId === rif.userId);
        if (recipient && recipient.emailStatus !== "opened") {
          await storage.updateRecipientEmailStatus(recipient.id, "opened", new Date());
        }
      }
    } catch (err) {
      // Silently fail - tracking should not break email rendering
    }
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(TRACKING_PIXEL);
  });

  app.post("/api/track/sms/:recipientId", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.recipientId);
      const { MessageStatus, SmsStatus } = req.body;
      const status = MessageStatus || SmsStatus || "delivered";
      const mappedStatus = status === "delivered" ? "delivered" : status === "failed" ? "failed" : "sent";
      await storage.updateRecipientSmsStatus(id, mappedStatus, mappedStatus === "delivered" ? new Date() : undefined);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Errore nell'aggiornamento dello stato SMS" });
    }
  });

  // ---- Stats ----

  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero delle statistiche" });
    }
  });

  // SMS status check (kept for compatibility)
  app.get("/api/sms/status", (req: Request, res: Response) => {
    res.json({ configured: isSMSConfigured(), provider: "Register.it" });
  });

  // ---- Import ----

  app.get("/api/import/template/consorziati", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="template_consorziati.csv"');
    res.send(CSV_TEMPLATE_CONSORZIATI);
  });

  app.get("/api/import/template/parcels", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="template_parcels.csv"');
    res.send(CSV_TEMPLATE_PARCELS);
  });

  app.get("/api/import/logs", async (req: Request, res: Response) => {
    try {
      const logs = await storage.getAllImportLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Errore nel recupero dei log di importazione" });
    }
  });

  app.post("/api/import/consorziati", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "File CSV richiesto" });
      const csvContent = req.file.buffer.toString("utf-8");
      const result = await importConsorziati(csvContent, req.file.originalname);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Errore nell'importazione" });
    }
  });

  app.post("/api/import/parcels", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: "File CSV richiesto" });
      const csvContent = req.file.buffer.toString("utf-8");
      const result = await importParcels(csvContent, req.file.originalname);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Errore nell'importazione" });
    }
  });

  registerAdminRoutes(app);
  registerUtentiTestRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
