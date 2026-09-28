import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startScheduler } from "./scheduler";
import { setupSession, requireAuth } from "./auth";
import { storage } from "./storage";
import { caricaConfigAd } from "./config-ad";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---- Session + Passport ----
setupSession(app);

// ---- Global auth guard ----
// Paths that bypass requireAuth:
//   - /api/auth/login  (public login endpoint)
//   - /api/track/      (email tracking pixel must be public)
//   - non-/api/ paths  (handled by Vite / static serving)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path.startsWith("/api/auth/login")) return next();
  if (req.path.startsWith("/api/track/")) return next();
  return requireAuth(req, res, next);
});

// ---- Osservatore read-only guard ----
// osservatore accounts may not call any mutating method on /api/ routes
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith("/api/")) return next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.user) return next(); // requireAuth already handled unauthenticated
  if (req.user.role === "osservatore") {
    return res.status(403).json({ message: "Accesso in sola lettura" });
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Chiude i sync rimasti aperti da un riavvio, altrimenti l'interfaccia
  // mostrerebbe per sempre una sincronizzazione in corso. È la prima query al
  // database nel ciclo di avvio: se il database non è ancora raggiungibile
  // (riavvio della macchina, PostgreSQL non ancora pronto) non deve impedire
  // al server di mettersi in ascolto — è igiene, non un prerequisito di avvio
  // (Correzione 4).
  try {
    const { chiudiSyncInterrotti } = await import("./sync/sync-all");
    const chiusi = await chiudiSyncInterrotti();
    if (chiusi > 0) console.log(`[sync] chiusi ${chiusi} log interrotti da un riavvio`);
  } catch (e) {
    console.error("[sync] chiudiSyncInterrotti fallita all'avvio, proseguo comunque:", e);
  }

  // Credenziali email/SMS salvate dall'interfaccia: vivono su app_settings e
  // vanno rilette qui, altrimenti resterebbero attive solo quelle di .env.
  // Stessa igiene del blocco sopra: se il database non risponde si parte con la
  // configurazione d'ambiente invece di non partire affatto.
  try {
    const { caricaConfigNotifiche } = await import("./config-notifiche");
    await caricaConfigNotifiche(storage);
  } catch (e) {
    console.error("[config] lettura impostazioni email/SMS fallita, uso .env:", e);
  }

  // Configurazione di Active Directory: a differenza di email/SMS non ha un
  // ripiego su .env, ma vale la stessa igiene — un database non ancora
  // raggiungibile all'avvio non deve impedire al server di mettersi in
  // ascolto. Con AD non caricata, verificatoreCorrente() resta null e il
  // login funziona comunque per gli utenti locali.
  try {
    await caricaConfigAd(storage);
  } catch (e) {
    console.error("[config] lettura impostazione Active Directory fallita:", e);
  }

  startScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "8610", 10);
  server.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();
