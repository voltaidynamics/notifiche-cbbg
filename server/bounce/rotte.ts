/**
 * Rotte della scheda «Bounce» di Impostazioni (issue #126), tutte requireAdmin.
 *
 * Costruite da una funzione che riceve le dipendenze, come `rotteAd`: i test
 * le chiamano con MemStorage e un Graph finto.
 */
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  ErroreConfigBounce,
  credenzialiGraph,
  leggiConfigBounce,
  patchConfigBounceSchema,
  salvaConfigBounce,
  vistaConfigBounce,
} from "../config-bounce";
import { getConfigEmail, mittenteDi } from "../config-notifiche";
import {
  LetturaBounceInCorso,
  leggiCasellaBounce,
  provaCasellaBounce,
  type ArchivioBounce,
} from "./lettura";
import { inviaRiepilogoProva, type DipendenzeRiepilogo } from "./riepilogo";
import type { FetchGraph } from "./graph";

export type DipendenzeRotteBounce = {
  archivio: ArchivioBounce & DipendenzeRiepilogo["archivio"];
  fetchGraph?: FetchGraph;
  /** Il mittente della scheda Email: la scheda avvisa se non è la casella letta. */
  mittenteEmail?: () => string;
  trasporto?: DipendenzeRiepilogo["trasporto"];
};

/** Quante righe mostra l'elenco della scheda. */
export const LIMITE_ELENCO_BOUNCE = 500;

function primoErrore(e: ZodError): string {
  return e.issues[0]?.message ?? "Dati non validi";
}

export function rotteBounce(deps: DipendenzeRotteBounce) {
  const mittente = deps.mittenteEmail ?? (() => mittenteDi(getConfigEmail()));
  const fallita = (res: Response, contesto: string, e: unknown) => {
    console.error(`[bounce] ${contesto}:`, e);
    res.status(500).json({ message: `Errore: ${contesto}` });
  };

  return {
    leggi: async (_req: Request, res: Response) => {
      try {
        res.json({ ...vistaConfigBounce(await deps.archivio.getAllSettings()), mittenteEmail: mittente() });
      } catch (e) {
        fallita(res, "lettura della configurazione", e);
      }
    },

    salva: async (req: Request, res: Response) => {
      const parsed = patchConfigBounceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: primoErrore(parsed.error) });
      try {
        const vista = await salvaConfigBounce(deps.archivio, parsed.data);
        res.json({ ...vista, mittenteEmail: mittente() });
      } catch (e) {
        if (e instanceof ErroreConfigBounce) return res.status(400).json({ message: e.message });
        fallita(res, "salvataggio della configurazione", e);
      }
    },

    prova: async (_req: Request, res: Response) => {
      try {
        const cred = credenzialiGraph(leggiConfigBounce(await deps.archivio.getAllSettings()));
        res.json(await provaCasellaBounce(cred, deps.fetchGraph));
      } catch (e) {
        fallita(res, "prova di accesso alla casella", e);
      }
    },

    leggiOra: async (_req: Request, res: Response) => {
      try {
        const esito = await leggiCasellaBounce(
          { archivio: deps.archivio, fetchGraph: deps.fetchGraph },
          { ancheSpenta: true },
        );
        res.json(esito);
      } catch (e) {
        if (e instanceof LetturaBounceInCorso) return res.status(409).json({ message: e.message });
        fallita(res, "lettura della casella", e);
      }
    },

    riepilogoProva: async (_req: Request, res: Response) => {
      try {
        const esito = await inviaRiepilogoProva({ archivio: deps.archivio, trasporto: deps.trasporto });
        if (!esito.inviato) return res.status(400).json({ message: esito.motivo });
        res.json({
          message: `Riepilogo di prova inviato a ${esito.destinatari} ${esito.destinatari === 1 ? "destinatario" : "destinatari"}`,
        });
      } catch (e) {
        fallita(res, "invio del riepilogo di prova", e);
      }
    },

    elenco: async (_req: Request, res: Response) => {
      try {
        res.json(await deps.archivio.elencoBounce(LIMITE_ELENCO_BOUNCE));
      } catch (e) {
        fallita(res, "elenco dei bounce", e);
      }
    },
  };
}
