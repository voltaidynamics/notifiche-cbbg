import { apiRequest } from "./queryClient";
import type {
  NetworkSegment,
  SegmentWithUserCount,
  Consorziato,
  CadastralParcel,
  CadastralParcelWithDetails,
  NotificationTemplate,
  Notification,
  NotificationWithStats,
  NotificationHistoryRow,
  NotificationHistoryDetail,
  NotificationHistoryFilters,
  InsertSegment,
  InsertConsorziati,
  InsertCadastralParcel,
  InsertNotificationTemplate,
  RigaRoggia,
  RigaRoggiaMadre,
  RigaDestinatario,
  RigaLegame,
  MadreSelezionabile,
  TrattaSelezionabile,
  RoggiaMadreSelezionabile,
  TrattaRoggiaSelezionabile,
  DestinatarioTratta,
  ConteggiLegami,
  StatoSync,
  SyncLog,
  UtenteTest,
} from "@shared/schema";
import type { SafeAppUser } from "@shared/schema";
import type { TipoNotifica, ClassificazioneNotifica } from "@shared/classificazione";
import type { TipoLegame } from "@shared/legame";
import type { RispostaStatoRogge } from "@shared/stato-rogge";
import type { RispostaGestioneCodici, GerarchiaCodice } from "@shared/codici-attivi";

export type { SafeAppUser };

// Segments API
export const segmentsApi = {
  getAll: (): Promise<SegmentWithUserCount[]> =>
    apiRequest("GET", "/api/segments").then((res) => res.json()),

  getById: (id: number): Promise<NetworkSegment> =>
    apiRequest("GET", `/api/segments/${id}`).then((res) => res.json()),

  getUsers: (id: number): Promise<Consorziato[]> =>
    apiRequest("GET", `/api/segments/${id}/users`).then((res) => res.json()),

  getParcels: (id: number): Promise<CadastralParcel[]> =>
    apiRequest("GET", `/api/segments/${id}/parcels`).then((res) => res.json()),

  addParcel: (segmentId: number, parcelId: number): Promise<void> =>
    apiRequest("POST", `/api/segments/${segmentId}/parcels`, { parcelId }).then(() => undefined),

  removeParcel: (segmentId: number, parcelId: number): Promise<void> =>
    apiRequest("DELETE", `/api/segments/${segmentId}/parcels/${parcelId}`).then(() => undefined),

  create: (data: InsertSegment): Promise<NetworkSegment> =>
    apiRequest("POST", "/api/segments", data).then((res) => res.json()),

  update: (id: number, data: Partial<InsertSegment>): Promise<NetworkSegment> =>
    apiRequest("PUT", `/api/segments/${id}`, data).then((res) => res.json()),

  updateStatus: (id: number, status: string): Promise<NetworkSegment> =>
    apiRequest("PUT", `/api/segments/${id}/status`, { status }).then((res) => res.json()),

  delete: (id: number): Promise<void> =>
    apiRequest("DELETE", `/api/segments/${id}`).then(() => undefined),
};

// Consorziati API
export const consorziatiApi = {
  getAll: (): Promise<Consorziato[]> =>
    apiRequest("GET", "/api/consorziati").then((res) => res.json()),

  getById: (id: number): Promise<Consorziato> =>
    apiRequest("GET", `/api/consorziati/${id}`).then((res) => res.json()),

  getSegments: (id: number): Promise<NetworkSegment[]> =>
    apiRequest("GET", `/api/consorziati/${id}/segments`).then((res) => res.json()),

  getParcels: (id: number): Promise<CadastralParcel[]> =>
    apiRequest("GET", `/api/consorziati/${id}/parcels`).then((res) => res.json()),

  addParcel: (userId: number, parcelId: number, role: string): Promise<void> =>
    apiRequest("POST", `/api/consorziati/${userId}/parcels`, { parcelId, role }).then(() => undefined),

  removeParcel: (userId: number, parcelId: number): Promise<void> =>
    apiRequest("DELETE", `/api/consorziati/${userId}/parcels/${parcelId}`).then(() => undefined),

  create: (data: InsertConsorziati): Promise<Consorziato> =>
    apiRequest("POST", "/api/consorziati", data).then((res) => res.json()),

  update: (id: number, data: Partial<InsertConsorziati>): Promise<Consorziato> =>
    apiRequest("PUT", `/api/consorziati/${id}`, data).then((res) => res.json()),

  delete: (id: number): Promise<void> =>
    apiRequest("DELETE", `/api/consorziati/${id}`).then(() => undefined),
};

// Parcels API
export const parcelsApi = {
  getAll: (): Promise<CadastralParcelWithDetails[]> =>
    apiRequest("GET", "/api/parcels").then((res) => res.json()),

  getById: (id: number): Promise<CadastralParcel> =>
    apiRequest("GET", `/api/parcels/${id}`).then((res) => res.json()),

  getUsers: (id: number): Promise<Consorziato[]> =>
    apiRequest("GET", `/api/parcels/${id}/users`).then((res) => res.json()),

  getSegments: (id: number): Promise<NetworkSegment[]> =>
    apiRequest("GET", `/api/parcels/${id}/segments`).then((res) => res.json()),

  create: (data: InsertCadastralParcel): Promise<CadastralParcel> =>
    apiRequest("POST", "/api/parcels", data).then((res) => res.json()),

  update: (id: number, data: Partial<InsertCadastralParcel>): Promise<CadastralParcel> =>
    apiRequest("PUT", `/api/parcels/${id}`, data).then((res) => res.json()),

  delete: (id: number): Promise<void> =>
    apiRequest("DELETE", `/api/parcels/${id}`).then(() => undefined),
};

// Templates API
export const templatesApi = {
  getAll: (): Promise<NotificationTemplate[]> =>
    apiRequest("GET", "/api/templates").then((res) => res.json()),

  getById: (id: number): Promise<NotificationTemplate> =>
    apiRequest("GET", `/api/templates/${id}`).then((res) => res.json()),

  create: (data: InsertNotificationTemplate): Promise<NotificationTemplate> =>
    apiRequest("POST", "/api/templates", data).then((res) => res.json()),

  update: (id: number, data: Partial<InsertNotificationTemplate>): Promise<NotificationTemplate> =>
    apiRequest("PUT", `/api/templates/${id}`, data).then((res) => res.json()),

  delete: (id: number): Promise<void> =>
    apiRequest("DELETE", `/api/templates/${id}`).then(() => undefined),

  setDefault: (id: number): Promise<NotificationTemplate> =>
    apiRequest("POST", `/api/templates/${id}/set-default`).then((res) => res.json()),

  preview: (id: number, variables?: Record<string, string>): Promise<{ subject: string; bodyEmail: string; bodySms: string }> =>
    apiRequest("POST", `/api/templates/${id}/preview`, { variables }).then((res) => res.json()),
};

// Notifications API
export const notificationsApi = {
  getAll: (): Promise<NotificationWithStats[]> =>
    apiRequest("GET", "/api/notifications").then((res) => res.json()),

  getById: (id: number): Promise<NotificationWithStats> =>
    apiRequest("GET", `/api/notifications/${id}`).then((res) => res.json()),

  getRecipients: (id: number): Promise<any[]> =>
    apiRequest("GET", `/api/notifications/${id}/recipients`).then((res) => res.json()),

  // Storico Notifiche (issue #12)
  getStorico: (filters: NotificationHistoryFilters = {}): Promise<NotificationHistoryRow[]> => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) qs.set(k, v);
    }
    const query = qs.toString();
    return apiRequest("GET", `/api/notifications/storico${query ? `?${query}` : ""}`)
      .then((res) => res.json());
  },

  getStoricoDetail: (id: number): Promise<NotificationHistoryDetail> =>
    apiRequest("GET", `/api/notifications/storico/${id}`).then((res) => res.json()),

  send: (data: {
    /** Tratta singola; per più tratte usare `segmentIds` (issue #5). */
    segmentId?: number;
    /** Più tratte in un invio solo: chi ne condivide due riceve comunque una notifica sola. */
    segmentIds?: number[];
    /** Obbligatori dalla issue #12: il server risponde 400 senza. */
    tipo: TipoNotifica;
    classificazione: ClassificazioneNotifica;
    templateId?: number;
    variables?: Record<string, string>;
    scheduledAt?: string;
    sendEmail: boolean;
    sendSms: boolean;
    subject: string;
    message: string;
  }): Promise<{ notification: Notification; emailsSent: number; smsSent: number }> =>
    apiRequest("POST", "/api/notifications/send", data).then((res) => res.json()),

  /**
   * Invio dalla pagina «Invia notifica», sull'anagrafica vera del consorzio
   * (issue #23).
   *
   * Vanno solo i codici: `keyroggia` delle tratte e `keykey` dei conduttori
   * rimasti spuntati. Indirizzi e numeri li rilegge il server dall'anagrafica —
   * un recapito che parte dal browser è un recapito che il consorzio non ha mai
   * visto. Il `titolo` diventa l'oggetto della mail.
   *
   * Risponde 202 appena la notifica e i suoi destinatari sono in tabella: le
   * mail continuano a partire dopo, e l'esito di ciascuna sta nello Storico.
   * Una risposta che aspettasse l'ultima mail supererebbe il timeout del proxy
   * su qualunque selezione non piccola.
   */
  inviaDaTratte: (data: {
    tratte: string[];
    /** Madri prese per intero: è così che si scelgono i pozzi (issue #26). */
    madri: string[];
    destinatari: string[];
    titolo: string;
    messaggio: string;
    /** Versione corta per il canale SMS: obbligatoria solo se `inviaSms` (issue #28). */
    messaggioSms: string;
    /** Se la comunicazione va anche per SMS (spunta in pagina). */
    inviaSms: boolean;
    tipo: TipoNotifica;
    classificazione: ClassificazioneNotifica;
    /** Live o stagione irrigua: da quale elenco del consorzio pescare (issue #27). */
    legame: TipoLegame;
  }): Promise<{ notificationId: number; destinatari: number }> =>
    apiRequest("POST", "/api/notifications/invia", data).then((res) => res.json()),

  delete: (id: number): Promise<void> =>
    apiRequest("DELETE", `/api/notifications/${id}`).then(() => undefined),
};

// Stats API
export const statsApi = {
  get: (): Promise<{
    totalSegments: number;
    activeSegments: number;
    maintenanceSegments: number;
    totalConsorziati: number;
    totalParcels: number;
    totalNotifications: number;
    scheduledNotifications: number;
    avgEmailOpenRate: number;
  }> => apiRequest("GET", "/api/stats").then((res) => res.json()),
};

// Import API
export const importApi = {
  getLogs: (): Promise<any[]> =>
    apiRequest("GET", "/api/import/logs").then((res) => res.json()),

  importConsorziati: (file: File): Promise<any> => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/import/consorziati", { method: "POST", body: form }).then((res) => res.json());
  },

  importParcels: (file: File): Promise<any> => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/import/parcels", { method: "POST", body: form }).then((res) => res.json());
  },

  downloadTemplate: (type: "consorziati" | "parcels") => {
    window.open(`/api/import/template/${type}`, "_blank");
  },
};

// Settings API
export const settingsApi = {
  // I segreti non tornano mai dal server: si sa solo se sono impostati.
  getEmailSettings: (): Promise<{
    emailService: "gmail" | "smtp"; emailUser: string; emailMittente: string; smtpHost: string;
    smtpPort: string; smtpSecure: boolean; autenticazione: boolean; passwordImpostata: boolean; configurata: boolean;
  }> => apiRequest("GET", "/api/settings/email").then((res) => res.json()),

  // Il secondo account di posta: la PEC (issue #23). Stessa forma di quello
  // ordinario, chiavi diverse in `app_settings`.
  getEmailPecSettings: (): Promise<{
    emailService: "gmail" | "smtp"; emailUser: string; emailMittente: string; smtpHost: string;
    smtpPort: string; smtpSecure: boolean; autenticazione: boolean; passwordImpostata: boolean; configurata: boolean;
  }> => apiRequest("GET", "/api/settings/email-pec").then((res) => res.json()),

  saveEmailPecSettings: (data: any): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/email-pec", data).then((res) => res.json()),

  testEmailPecSettings: (data: any): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/email-pec/test", data).then((res) => res.json()),

  getSmsSettings: (): Promise<{
    clientid: string;
    passwordImpostata: boolean;
    configurata: boolean;
  }> => apiRequest("GET", "/api/settings/sms").then((res) => res.json()),

  saveEmailSettings: (data: any): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/email", data).then((res) => res.json()),

  testEmailSettings: (data: any): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/email/test", data).then((res) => res.json()),

  // Mail vera con le credenziali salvate del canale, verso un indirizzo scelto ora.
  inviaEmailProva: (data: { canale: "normale" | "pec"; destinatario: string }): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/email/invia-prova", data).then((res) => res.json()),

  // SMS vero con le credenziali salvate, verso un numero scelto ora: costa un messaggio.
  inviaSmsProva: (data: { numero: string }): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/sms/invia-prova", data).then((res) => res.json()),

  saveSMSSettings: (data: any): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/sms", data).then((res) => res.json()),

  testSMSSettings: (data: any): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/sms/test", data).then((res) => res.json()),

  getWs: (): Promise<{ authImpostata: boolean; base: string; entita: Record<string, { mode: "http" | "file"; url: string | null; path: string | null }> }> =>
    apiRequest("GET", "/api/settings/ws").then((res) => res.json()),

  saveWs: (data: { auth?: string; base?: string; entita: Record<string, { mode: string; url: string; path: string }> }): Promise<{ success: boolean }> =>
    apiRequest("POST", "/api/settings/ws", data).then((res) => res.json()),

  testWs: (entita: string): Promise<{ ok: boolean; righe?: number; errore?: string }> =>
    apiRequest("POST", "/api/settings/ws/test", { entita }).then((res) => res.json()),

  uploadWs: (entita: string, file: File): Promise<{
    ok: boolean; righe?: number; percorso?: string; avvisi?: string[]; errore?: string;
  }> => {
    const form = new FormData();
    // 'entita' prima del file: multer legge il multipart in ordine di stream e
    // popola req.body man mano, quindi il campo deve precedere il payload.
    form.append("entita", entita);
    form.append("file", file);
    // Niente apiRequest: imposterebbe Content-Type: application/json e il
    // browser non potrebbe aggiungere il boundary del multipart.
    return fetch("/api/settings/ws/upload", { method: "POST", body: form })
      .then(async (res) => {
        const testo = await res.text();
        try {
          return JSON.parse(testo);
        } catch {
          // In produzione la richiesta passa da Nginx Proxy Manager, il cui
          // client_max_body_size di default (1 MB) è sotto il limite di 50 MB
          // della route: un upload troppo grande per il proxy torna una
          // pagina HTML, non il JSON che la route produce sempre. Senza
          // questo ramo res.json() lancerebbe un errore di parsing generico
          // ("Unexpected token '<'") al posto di un messaggio comprensibile.
          return {
            ok: false,
            errore: `Il server ha risposto ${res.status} senza JSON: il file potrebbe superare `
              + "il limite di caricamento del server (es. proxy)",
          };
        }
      });
  },
};

// Mirror di `VistaConfigAd` in server/config-ad.ts. Il client non importa dal
// server (stesso motivo degli altri tipi qui sopra), quindi la forma è ricopiata.
export type ConfigAd = {
  enabled: boolean;
  url: string; // quello salvato; "" = predefinito da ws.base
  timeoutMs: number;
  urlEffettivo: string; // quello che verrà chiamato davvero; "" = nessuno
  urlDerivato: boolean;
};

export type PatchConfigAd = { enabled?: boolean; url?: string; timeoutMs?: number };

// Mirror di `EsitoAd` in server/ad/verificatore.ts: unione chiusa, così lo
// switch della scheda ha un controllo di esaustività.
export type EsitoBindAd =
  | { esito: "ok" }
  | { esito: "credenzialiNonValide" }
  | { esito: "nonRaggiungibile"; dettaglio: string };

export type EsitoProvaAd = {
  riuscita: boolean;
  messaggio: string;
  verifica?: EsitoBindAd;
};

export const adSettingsApi = {
  get: (): Promise<ConfigAd> =>
    apiRequest("GET", "/api/settings/ad").then((res) => res.json()),
  save: (data: PatchConfigAd): Promise<ConfigAd> =>
    apiRequest("POST", "/api/settings/ad", data).then((res) => res.json()),
  test: (credenziali?: { username: string; password: string }): Promise<EsitoProvaAd> =>
    apiRequest("POST", "/api/settings/ad/test", credenziali ?? {}).then((res) => res.json()),
};

export type RichiestaAccesso = {
  id: number;
  username: string;
  primoTentativo: string;
  ultimoTentativo: string;
  tentativi: number;
};

export const richiesteAccessoApi = {
  list: (): Promise<RichiestaAccesso[]> =>
    apiRequest("GET", "/api/admin/richieste-accesso").then((res) => res.json()),
  remove: (id: number): Promise<{ success: boolean }> =>
    apiRequest("DELETE", `/api/admin/richieste-accesso/${id}`).then((res) => res.json()),
};

// Admin — Users
export const adminUsersApi = {
  getAll: (): Promise<SafeAppUser[]> =>
    apiRequest("GET", "/api/admin/users").then((res) => res.json()),

  create: (data: {
    username: string;
    password?: string; // assente per un utente Active Directory, che non ha password nell'app
    role: string;
    authSource?: "locale" | "ad";
    isActive?: boolean;
    richiestaId?: number; // da «Abilita» su una richiesta di accesso (issue #116)
  }): Promise<SafeAppUser> =>
    apiRequest("POST", "/api/admin/users", data).then((res) => res.json()),

  update: (
    id: number,
    data: {
      username?: string;
      password?: string; // assente = non cambiare
      role?: string;
      authSource?: "locale" | "ad";
      isActive?: boolean;
    }
  ): Promise<SafeAppUser> =>
    apiRequest("PUT", `/api/admin/users/${id}`, data).then((res) => res.json()),

  delete: (id: number): Promise<void> =>
    apiRequest("DELETE", `/api/admin/users/${id}`).then(() => undefined),
};

// Anagrafiche consorzio (sola lettura)
export const anagraficheApi = {
  getRogge: (): Promise<RigaRoggia[]> =>
    apiRequest("GET", "/api/anagrafiche/rogge").then((res) => res.json()),

  getDestinatari: (): Promise<RigaDestinatario[]> =>
    apiRequest("GET", "/api/anagrafiche/destinatari").then((res) => res.json()),

  getLegami: (metodo: "live" | "stagione"): Promise<RigaLegame[]> =>
    apiRequest("GET", `/api/anagrafiche/legami?metodo=${metodo}`).then((res) => res.json()),

  // Seconda gerarchia (issue #49): le rogge madri R e le loro figlie, nella
  // forma che serve alla sezione Anagrafiche. Il consumo vero è del task
  // successivo — qui c'è solo perché senza questo wrapper quel task è bloccato.
  getRoggeMadri: (): Promise<RigaRoggiaMadre[]> =>
    apiRequest("GET", "/api/anagrafiche/rogge-madri").then((res) => res.json()),
};

// Selezione a cascata di Invia notifica, sullo specchio del consorzio (issue #14).
// I destinatari che tornano da qui sono già filtrati sui soli attivi.
export const consorzioApi = {
  getMadri: (): Promise<MadreSelezionabile[]> =>
    apiRequest("GET", "/api/consorzio/madri").then((res) => res.json()),

  getTratte: (codicimadre: string[]): Promise<TrattaSelezionabile[]> =>
    codicimadre.length === 0
      ? Promise.resolve([])
      : apiRequest(
          "GET",
          `/api/consorzio/tratte?madri=${encodeURIComponent(codicimadre.join(","))}`,
        ).then((res) => res.json()),

  // Seconda gerarchia (issue #49): le rogge madri R e le loro figlie. Rotte
  // proprie, non un parametro su /madri e /tratte — vedi il commento sopra le
  // rotte server in `server/routes.ts`.
  getRoggeMadri: (): Promise<RoggiaMadreSelezionabile[]> =>
    apiRequest("GET", "/api/consorzio/rogge-madri").then((res) => res.json()),

  getTratteDiRoggeMadri: (codici: string[]): Promise<TrattaRoggiaSelezionabile[]> =>
    codici.length === 0
      ? Promise.resolve([])
      : apiRequest(
          "GET",
          `/api/consorzio/rogge-tratte?madri=${encodeURIComponent(codici.join(","))}`,
        ).then((res) => res.json()),

  // I pozzi non passano dalle tratte ma dalla madre intera (issue #26): il
  // server risolve i conduttori di tutti i suoi figli.
  //
  // Il legame è il primo parametro ed è obbligatorio (issue #27): decide da
  // quale dei due elenchi del consorzio si pescano i destinatari, e non ha un
  // valore di ripiego sensato.
  //
  // `roggeMadri` è la terza via, la seconda gerarchia (issue #49): stesso
  // meccanismo di `madri`, endpoint diverso perché legge tabelle diverse.
  getDestinatari: (
    legame: TipoLegame,
    keyroggie: string[],
    codicimadre: string[] = [],
    roggeMadri: string[] = [],
  ): Promise<DestinatarioTratta[]> => {
    const parti: string[] = [`legame=${encodeURIComponent(legame)}`];
    if (keyroggie.length > 0) parti.push(`tratte=${encodeURIComponent(keyroggie.join(","))}`);
    if (codicimadre.length > 0) parti.push(`madri=${encodeURIComponent(codicimadre.join(","))}`);
    if (roggeMadri.length > 0) parti.push(`roggeMadri=${encodeURIComponent(roggeMadri.join(","))}`);
    if (parti.length === 1) return Promise.resolve([]);
    return apiRequest("GET", `/api/consorzio/destinatari?${parti.join("&")}`).then((res) => res.json());
  },

  // I due numeri per legame che il popup di scelta mostra (issue #27). Si
  // chiama anche a selezione vuota: i totali del mirror valgono comunque.
  getConteggiLegami: (
    keyroggie: string[],
    codicimadre: string[] = [],
    roggeMadri: string[] = [],
  ): Promise<ConteggiLegami> => {
    const parti: string[] = [];
    if (keyroggie.length > 0) parti.push(`tratte=${encodeURIComponent(keyroggie.join(","))}`);
    if (codicimadre.length > 0) parti.push(`madri=${encodeURIComponent(codicimadre.join(","))}`);
    if (roggeMadri.length > 0) parti.push(`roggeMadri=${encodeURIComponent(roggeMadri.join(","))}`);
    const query = parti.length > 0 ? `?${parti.join("&")}` : "";
    return apiRequest("GET", `/api/consorzio/legami/conteggi${query}`).then((res) => res.json());
  },

  // Lo stato aperta/chiusa dei codici (issue #22). Lo leggono Dashboard, Invia
  // notifica e Anagrafiche: la stessa risposta, la stessa regola condivisa.
  getStatoRogge: (): Promise<RispostaStatoRogge> =>
    apiRequest("GET", "/api/consorzio/stato-rogge").then((res) => res.json()),
};

// Sincronizzazione anagrafiche
export const syncApi = {
  avvia: (): Promise<{ syncLogId: number }> =>
    apiRequest("POST", "/api/sync").then((res) => res.json()),

  stato: (): Promise<StatoSync> =>
    apiRequest("GET", "/api/sync/status").then((res) => res.json()),

  logs: (limit = 10): Promise<SyncLog[]> =>
    apiRequest("GET", `/api/sync/logs?limit=${limit}`).then((res) => res.json()),
};

// Avvisi del caricamento notturno (issue #6)
export const avvisiSyncApi = {
  get: (): Promise<{ destinatari: string[] }> =>
    apiRequest("GET", "/api/settings/avvisi-sync").then((res) => res.json()),

  // Si manda il testo grezzo della casella: separatori e normalizzazione stanno
  // solo lato server, così client e server non possono divergere.
  salva: (destinatari: string): Promise<{ success: boolean; destinatari: string[] }> =>
    apiRequest("POST", "/api/settings/avvisi-sync", { destinatari }).then((res) => res.json()),

  prova: (): Promise<{ success: boolean; message: string }> =>
    apiRequest("POST", "/api/settings/avvisi-sync/test").then((res) => res.json()),
};

// Utenti di test degli invii (issue #36)
// Gestione Codici (issue #52): accendere e spegnere impianti e rogge madri.
export const gestioneCodiciApi = {
  elenco: (): Promise<RispostaGestioneCodici> =>
    apiRequest("GET", "/api/gestione-codici").then((res) => res.json()),

  imposta: (gerarchia: GerarchiaCodice, codice: string, attivo: boolean): Promise<{ gerarchia: GerarchiaCodice; codice: string; attivo: boolean }> =>
    apiRequest("PUT", "/api/gestione-codici", { gerarchia, codice, attivo }).then((res) => res.json()),
};

/** Se gli SMS possono partire (issue #117): accende di default la spunta di Invia notifica. */
export const smsDisponibile = (): Promise<{ configurato: boolean }> =>
  apiRequest("GET", "/api/notifications/sms-disponibile").then((res) => res.json());

export const utentiTestApi = {
  /** Solo nomi e due booleani: i recapiti non escono da Impostazioni. */
  attivi: (): Promise<{ id: number; nome: string; haEmail: boolean; haTelefono: boolean; canale: string }[]> =>
    apiRequest("GET", "/api/utenti-test/attivi").then((res) => res.json()),

  elenco: (): Promise<UtenteTest[]> =>
    apiRequest("GET", "/api/utenti-test").then((res) => res.json()),

  crea: (data: DatiUtenteTestClient): Promise<UtenteTest> =>
    apiRequest("POST", "/api/utenti-test", data).then((res) => res.json()),

  aggiorna: (id: number, data: DatiUtenteTestClient): Promise<UtenteTest> =>
    apiRequest("PUT", `/api/utenti-test/${id}`, data).then((res) => res.json()),

  elimina: (id: number): Promise<{ success: boolean }> =>
    apiRequest("DELETE", `/api/utenti-test/${id}`).then((res) => res.json()),

  contaProve: (): Promise<{ quante: number }> =>
    apiRequest("GET", "/api/notifiche-prova").then((res) => res.json()),

  eliminaProve: (): Promise<{ eliminate: number }> =>
    apiRequest("DELETE", "/api/notifiche-prova").then((res) => res.json()),
};

/** Quel che il form manda: `id` e `createdAt` li mette il server. */
export type DatiUtenteTestClient = {
  nome: string;
  email: string | null;
  tipoEmail: string;
  telefono: string | null;
  attivo: boolean;
};
