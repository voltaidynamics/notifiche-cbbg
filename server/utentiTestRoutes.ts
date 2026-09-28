// Le rotte degli utenti di test degli invii (issue #36).
//
// Tutte sotto `requireRole("superadmin")` tranne una: chi puo' aggiungere un
// utente di test decide che a *ogni* comunicazione del consorzio parta una
// copia verso un indirizzo scelto da lui. E' lo stesso livello della scheda
// Active Directory, ed e' l'unico altro posto dell'app che ce l'ha.
//
// L'eccezione e' `GET /api/utenti-test/attivi`, che serve alla pagina di invio:
// restituisce i soli nomi, perche' la pagina deve poter dire «partira' anche a
// Francesco» senza pubblicare i recapiti a chiunque sappia inviare.

import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { requireRole } from "./auth";
import { recapitoMancante, TIPI_EMAIL_TEST, type TipoEmailTest } from "@shared/utenti-test";

export type DatiUtenteTest = {
  nome: string;
  email: string | null;
  tipoEmail: TipoEmailTest;
  telefono: string | null;
  attivo: boolean;
};

export type EsitoValidazione =
  | { ok: true; dati: DatiUtenteTest }
  | { ok: false; errore: string };

const testo = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const testoONull = (v: unknown): string | null => testo(v) || null;

export function validaUtenteTest(body: unknown): EsitoValidazione {
  const b = (body ?? {}) as Record<string, unknown>;

  const nome = testo(b.nome);
  if (!nome) return { ok: false, errore: "Nome mancante" };

  const email = testoONull(b.email);
  const telefono = testoONull(b.telefono);
  if (recapitoMancante({ email, telefono })) {
    return { ok: false, errore: "Serve almeno un recapito: email o telefono" };
  }

  const tipoGrezzo = testo(b.tipoEmail) || "normale";
  if (TIPI_EMAIL_TEST.indexOf(tipoGrezzo as TipoEmailTest) === -1) {
    return { ok: false, errore: "Tipo email non valido: attesi Email o PEC" };
  }

  return {
    ok: true,
    dati: {
      nome,
      email,
      tipoEmail: tipoGrezzo as TipoEmailTest,
      telefono,
      // Chi non lo manda resta attivo: si censisce un utente per usarlo.
      attivo: b.attivo === undefined ? true : b.attivo === true,
    },
  };
}

export function registerUtentiTestRoutes(app: Express): void {
  // L'unica rotta aperta a chi invia, e restituisce i soli nomi.
  app.get("/api/utenti-test/attivi", async (_req: Request, res: Response) => {
    try {
      const attivi = await storage.getUtentiTestAttivi();
      res.json(attivi.map((u) => ({
        id: u.id,
        nome: u.nome,
        // Booleani, non recapiti: la pagina deve poter dire «questo invio non
        // raggiunge nessuno» applicando la stessa regola del server, senza che
        // gli indirizzi escano da Impostazioni. Il canale invece non è un
        // recapito — è "normale" o "pec" — e serve alla pagina per far
        // tornare il proprio conteggio PEC con quello che il server rifiuta.
        haEmail: (u.email ?? "").trim() !== "",
        haTelefono: (u.telefono ?? "").trim() !== "",
        canale: u.tipoEmail,
      })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero degli utenti di test" });
    }
  });

  app.get("/api/utenti-test", requireRole("superadmin"), async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getUtentiTest());
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel recupero degli utenti di test" });
    }
  });

  app.post("/api/utenti-test", requireRole("superadmin"), async (req: Request, res: Response) => {
    const esito = validaUtenteTest(req.body);
    if (!esito.ok) return res.status(400).json({ message: esito.errore });
    try {
      // `createdBy` dalla sessione e non dal corpo: chi ha censito un
      // destinatario di prova non deve poterselo firmare da solo.
      const creato = await storage.createUtenteTest({
        ...esito.dati,
        createdBy: req.user?.username ?? null,
      });
      res.status(201).json(creato);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nella creazione dell'utente di test" });
    }
  });

  app.put("/api/utenti-test/:id", requireRole("superadmin"), async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Id non valido" });
    const esito = validaUtenteTest(req.body);
    if (!esito.ok) return res.status(400).json({ message: esito.errore });
    try {
      const aggiornato = await storage.updateUtenteTest(id, esito.dati);
      if (!aggiornato) return res.status(404).json({ message: "Utente di test non trovato" });
      res.json(aggiornato);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel salvataggio dell'utente di test" });
    }
  });

  app.delete("/api/utenti-test/:id", requireRole("superadmin"), async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "Id non valido" });
    try {
      const tolto = await storage.deleteUtenteTest(id);
      if (!tolto) return res.status(404).json({ message: "Utente di test non trovato" });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nell'eliminazione dell'utente di test" });
    }
  });

  app.get("/api/notifiche-prova", requireRole("superadmin"), async (_req: Request, res: Response) => {
    try {
      res.json({ quante: await storage.contaNotificheProva() });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nel conteggio delle comunicazioni di prova" });
    }
  });

  app.delete("/api/notifiche-prova", requireRole("superadmin"), async (_req: Request, res: Response) => {
    try {
      res.json({ eliminate: await storage.eliminaNotificheProva() });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Errore nell'eliminazione delle comunicazioni di prova" });
    }
  });
}
