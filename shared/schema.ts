import { pgTable, text, serial, integer, boolean, timestamp, real, uniqueIndex, index, check, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { TIPI_TEMPLATE, TIPI_NOTIFICA, CLASSIFICAZIONI_NOTIFICA } from "./classificazione";
import type { CategoriaMadre } from "./categorie-madri";
import type { TipoLegame } from "./legame";
import type { LivelloCodice } from "./stato-rogge";
import type { OrigineMadre } from "./ws-consorzio";

// Network segments (tratte rete irrigua) - replaces wells
export const networkSegments = pgTable("network_segments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  lengthKm: real("length_km"),
  coordinates: text("coordinates"), // GeoJSON LineString as JSON string: [[lat,lng], ...]
  status: text("status").notNull().default("active"), // "active" | "maintenance" | "inactive"
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Consorziati (consortium members) - replaces users
export const consorziati = pgTable("consorziati", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  userType: text("user_type").notNull(), // "privato" | "agricoltore" | "cooperativa" | "ente"
  address: text("address"),
  codiceFiscale: text("codice_fiscale"),
  codiceConsorzio: text("codice_consorzio"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Cadastral parcels (particelle catastali)
export const cadastralParcels = pgTable("cadastral_parcels", {
  id: serial("id").primaryKey(),
  comune: text("comune").notNull(),
  codiceComune: text("codice_comune").notNull(), // e.g. "F205"
  foglio: text("foglio").notNull(),
  mappale: text("mappale").notNull(),
  sezione: text("sezione"),
  areaM2: real("area_m2"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Parcel ↔ Segment mappings
export const parcelSegmentMappings = pgTable("parcel_segment_mappings", {
  id: serial("id").primaryKey(),
  parcelId: integer("parcel_id").notNull().references(() => cadastralParcels.id, { onDelete: "cascade" }),
  segmentId: integer("segment_id").notNull().references(() => networkSegments.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

// Parcel ↔ Consorziato assignments
export const parcelUserAssignments = pgTable("parcel_user_assignments", {
  id: serial("id").primaryKey(),
  parcelId: integer("parcel_id").notNull().references(() => cadastralParcels.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => consorziati.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"), // "owner" | "tenant" | "representative"
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
});

// Notification templates
export const notificationTemplates = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // Nome diverso da `tipo` delle notifiche di proposito (issue #18): questo
  // campo aiuta l'utente a filtrare la lista dei template e non vincola nulla
  // altrove — non l'invio, non lo stato della roggia in Dashboard. A schermo si
  // chiama comunque "Tipo". Valori: TIPI_TEMPLATE.
  tipoTemplate: text("tipo_template").notNull(), // "apertura" | "chiusura" | "altro"
  subject: text("subject").notNull(),
  bodyEmail: text("body_email").notNull(),
  bodySms: text("body_sms").notNull(),
  variables: text("variables"), // JSON array of variable names
  isDefault: boolean("is_default").notNull().default(false),
  // Username di chi ha creato il template, non una FK a appUsers.id: cancellare
  // un utente non deve svuotare retroattivamente la colonna dei suoi template.
  // Stesso pattern di notifications.createdBy.
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Chi ha toccato il template per ultimo, e quando. Restano nulli finché
  // nessuno lo modifica: `createdBy` dice chi l'ha scritto, questi due dicono
  // se qualcun altro ci è passato sopra (issue #18). Anche qui username e non
  // FK, per lo stesso motivo di createdBy.
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at"),
});

// Notifications (enhanced)
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  segmentId: integer("segment_id").references(() => networkSegments.id),
  templateId: integer("template_id").references(() => notificationTemplates.id),
  // I due assi con cui il consorzio classifica una comunicazione (issue #12):
  // `tipo` dice cosa succede alla tratta, `classificazione` perché.
  //
  // Erano affiancati da `event_type`, che ammetteva cinque tipologie
  // (chiusura, manutenzione, riduzione portata, apertura, straordinario) e
  // governava i canali per tipo evento: colonna e tabella sono state droppate
  // (issue #18, migrazione 0008). Una comunicazione ha tre tipi soli —
  // apertura, chiusura, altro — e li dichiara qui.
  //
  // I default servono alla compatibilità della colonna, non a consentire invii
  // senza classificazione: sul percorso interattivo entrambi sono obbligatori
  // e il server rifiuta chi non li manda.
  tipo: text("tipo").notNull().default("altro"),                       // vedi TIPI_NOTIFICA
  classificazione: text("classificazione").notNull().default("ordinaria"), // vedi CLASSIFICAZIONI_NOTIFICA
  // Con quale dei due legami del consorzio è stata risolta la selezione:
  // "live" | "stagione" (issue #27, vedi shared/legame.ts).
  //
  // Resta null sul percorso legacy: `/api/notifications/send` e lo scheduler
  // risolvono i destinatari da `getUsersBySegmentId`, cioè dalle tabelle con
  // id numerici, dove i due legami del consorzio non esistono proprio. Scriverci "live" sarebbe inventare un dato che nessuno ha
  // registrato — la stessa scelta fatta per `canale` nella migrazione 0004.
  legame: text("legame"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  // La versione corta per il canale SMS (issue #28). Nullable di proposito:
  // le notifiche precedenti non hanno mai avuto un testo SMS, e una stringa
  // vuota le farebbe sembrare invii a cui l'SMS è stato scritto e non è
  // partito. Oggi nessuno la spedisce — si registra per quando il canale ci
  // sarà.
  messageSms: text("message_sms"),
  status: text("status").notNull().default("pending"), // "pending" | "sending" | "sent" | "scheduled" | "failed"
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  recipientCount: integer("recipient_count").notNull().default(0),
  emailCount: integer("email_count").notNull().default(0),
  smsCount: integer("sms_count").notNull().default(0),
  emailOpenCount: integer("email_open_count").notNull().default(0),
  smsDeliveredCount: integer("sms_delivered_count").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Per-recipient notification tracking
export const notificationRecipients = pgTable("notification_recipients", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => consorziati.id),
  // Snapshot anagrafico al momento dell'invio: le tabelle mirror del consorzio
  // sono sovrascritte a ogni sync, quindi lo storico deve conservare i valori.
  keykey: text("keykey"),                                 // codice conduttore
  conduttoreDescrizione: text("conduttore_descrizione"),  // descrizione conduttore
  keyroggia: text("keyroggia"),                           // codice roggia/tratta
  roggiaDescrizione: text("roggia_descrizione"),          // descrizione roggia/tratta
  email: text("email"),
  phone: text("phone"),
  // Con quale casella è partita: "normale" | "pec" (issue #23). Resta null sulle
  // notifiche precedenti ai due canali. È uno snapshot come gli altri: il
  // `tipo_email` dell'anagrafica cambia a ogni sync, e a distanza di mesi
  // «questa comunicazione è andata per PEC?» deve avere una risposta.
  canale: text("canale"),
  /**
   * Se questa riga è un utente di test e non un conduttore vero (issue #36).
   *
   * È l'unico segno che distingue i due, ed è da qui che si ricava anche cosa
   * sia una «comunicazione di prova»: una notifica con destinatari, nessuno dei
   * quali un conduttore vero. Falso su tutto lo storico precedente, che è la
   * risposta giusta — prima gli utenti di test non esistevano.
   */
  utenteTest: boolean("utente_test").notNull().default(false),
  emailStatus: text("email_status").notNull().default("pending"), // "pending" | "sent" | "failed" | "opened"
  smsStatus: text("sms_status").notNull().default("pending"), // "pending" | "sent" | "delivered" | "failed"
  emailMessageId: text("email_message_id"),
  smsSid: text("sms_sid"),
  emailOpenedAt: timestamp("email_opened_at"),
  smsDeliveredAt: timestamp("sms_delivered_at"),
  sentAt: timestamp("sent_at"),
}, (t) => [
  // Il filtro «Roggia» dello Storico cerca per codice tratta.
  //
  // L'indice nasceva dalla migrazione a mano `0001_storico_notifiche.sql` e non
  // era dichiarato qui: `db:push` lo ha quindi considerato di troppo e lo ha
  // CANCELLATO, esattamente come farebbe con la tabella `session` senza
  // `tablesFilter`. È successo davvero il 31/08/2026. Dichiararlo è l'unico modo
  // di farlo sopravvivere al prossimo push — non spostarlo di nuovo fuori.
  index("notification_recipients_keyroggia_idx").on(t.keyroggia),
]);

/**
 * Cosa è stato selezionato in una comunicazione: i codici, non i destinatari
 * (issue #22).
 *
 * Serve a sapere se una roggia risulta aperta o chiusa, e non si può ricavare
 * dagli snapshot dei destinatari: una tratta chiusa a cui non è legato nessun
 * conduttore non comparirebbe in nessuna riga di `notification_recipients`, ed
 * è precisamente una di quelle che la Dashboard deve contare.
 *
 * `descrizione` è uno snapshot come `keyroggia` e `canale` fra i destinatari:
 * se il WS smette di esportare quella figlia, la Dashboard deve poter ancora
 * scrivere un nome accanto al codice.
 */
export const notificationTargets = pgTable("notification_targets", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  /** `keyroggia` a 9 caratteri, oppure `codicemadre` a 3 per i pozzi (issue #26). */
  codice: text("codice").notNull(),
  /**
   * "tratta" | "madre": come è stata fatta la selezione, non la lunghezza del
   * codice. È a questo che si appoggia l'ereditarietà madre → figlia.
   */
  livello: text("livello").notNull(),
  descrizione: text("descrizione"),
}, (t) => ({
  byCodice: index("notification_targets_codice_idx").on(t.codice),
  byNotifica: index("notification_targets_notifica_idx").on(t.notificationId),
}));

// Import logs
export const importLogs = pgTable("import_logs", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  totalRows: integer("total_rows"),
  importedRows: integer("imported_rows"),
  skippedRows: integer("skipped_rows"),
  errorRows: integer("error_rows"),
  errors: text("errors"), // JSON array of error messages
  status: text("status").notNull(), // "success" | "partial" | "failed"
  importedAt: timestamp("imported_at").notNull().defaultNow(),
});

// App user roles
export const APP_ROLES = ["superadmin", "admin", "user", "osservatore"] as const;
export type AppRole = typeof APP_ROLES[number];

/**
 * Chi valida la password di un utente. È una colonna e non l'ordine dei
 * tentativi: se si provasse bcrypt e poi, fallendo, Active Directory, una riga
 * locale con lo stesso username di un utente di dominio vincerebbe per sempre —
 * anche dopo che il consorzio ha disabilitato quell'account sul dominio.
 */
export const AUTH_SOURCES = ["locale", "ad"] as const;
export type AuthSource = typeof AUTH_SOURCES[number];

// Dashboard login accounts (separate from consorziati)
export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  // Nullo per gli utenti Active Directory: la loro password non vive qui.
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"), // AppRole
  authSource: text("auth_source").notNull().default("locale"), // AuthSource
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  createdBy: integer("created_by"), // FK to appUsers.id — intentionally no Drizzle reference to avoid circular
}, (t) => [
  // La difesa che regge anche se un giorno qualcuno scrive nella tabella senza
  // passare dalle rotte: un utente AD con un hash sarebbe una seconda
  // credenziale valida che il consorzio non può revocare dal dominio.
  check(
    "app_users_credenziali_coerenti",
    sql`(${t.authSource} = 'locale' AND ${t.passwordHash} IS NOT NULL)
        OR (${t.authSource} = 'ad' AND ${t.passwordHash} IS NULL)`,
  ),
]);

/**
 * Chi ha superato il bind su Active Directory ma non è fra gli abilitati.
 * Serve a un problema solo: senza account di servizio non possiamo cercare gli
 * utenti su AD, quindi il superadmin non ha modo di sapere lo username esatto di
 * dominio. Qui ce lo scrive AD stesso. Mai la password.
 */
export const richiesteAccesso = pgTable("richieste_accesso", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  primoTentativo: timestamp("primo_tentativo").notNull().defaultNow(),
  ultimoTentativo: timestamp("ultimo_tentativo").notNull().defaultNow(),
  tentativi: integer("tentativi").notNull().default(1),
});

/**
 * I destinatari di prova degli invii (issue #36).
 *
 * Le colonne ricalcano quelle di un conduttore — `email`, `tipo_email`,
 * `telefono`, `attivo` per `flag_attivo` — di proposito: così un utente di test
 * attraversa il codice di invio come un destinatario qualunque, e il canale con
 * cui lo si raggiunge lo decide la stessa `canaleDi()` che decide per i veri.
 * Una forma diversa vorrebbe dire un ramo in più in ogni passaggio della
 * spedizione, cioè esattamente il codice che il collaudo non starebbe
 * collaudando.
 *
 * Non è una tabella del mirror: non la tocca il sync, e non ha niente a che
 * vedere con `conduttori`. Non è nemmeno `app_users`: quella serve ad accedere,
 * questa a ricevere. La stessa persona può stare in entrambe.
 */
export const utentiTest = pgTable("utenti_test", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email"),
  /** "normale" | "pec": vedi TIPI_EMAIL_TEST in shared/utenti-test.ts. */
  tipoEmail: text("tipo_email").notNull().default("normale"),
  telefono: text("telefono"),
  /**
   * Lo switch per singolo utente, non uno globale: chi vuole restare in
   * ricezione per accorgersi se qualcosa smette di funzionare lo decide per sé.
   */
  attivo: boolean("attivo").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---- Zod schemas ----

export const insertSegmentSchema = createInsertSchema(networkSegments).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Nome richiesto"),
  code: z.string().min(1, "Codice richiesto"),
  status: z.enum(["active", "maintenance", "inactive"]).default("active"),
  lengthKm: z.number().optional(),
  coordinates: z.string().optional(),
});

export const insertConsorziatiSchema = createInsertSchema(consorziati).omit({
  id: true,
  createdAt: true,
}).extend({
  firstName: z.string().min(1, "Nome richiesto"),
  lastName: z.string().min(1, "Cognome richiesto"),
  email: z.string().email("Email non valida"),
  userType: z.enum(["privato", "agricoltore", "cooperativa", "ente"]),
});

export const insertCadastralParcelSchema = createInsertSchema(cadastralParcels).omit({
  id: true,
  createdAt: true,
}).extend({
  comune: z.string().min(1, "Comune richiesto"),
  codiceComune: z.string().min(1, "Codice comune richiesto"),
  foglio: z.string().min(1, "Foglio richiesto"),
  mappale: z.string().min(1, "Mappale richiesto"),
});

export const insertParcelSegmentMappingSchema = createInsertSchema(parcelSegmentMappings).omit({
  id: true,
  assignedAt: true,
});

export const insertParcelUserAssignmentSchema = createInsertSchema(parcelUserAssignments).omit({
  id: true,
  assignedAt: true,
}).extend({
  role: z.enum(["owner", "tenant", "representative"]).default("owner"),
});

export const insertNotificationTemplateSchema = createInsertSchema(notificationTemplates).omit({
  id: true,
  createdAt: true,
  // Autore e ultima modifica li scrive il server dalla sessione: se arrivassero
  // dal corpo della richiesta, la tracciatura si potrebbe firmare a piacere.
  createdBy: true,
  updatedBy: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Nome richiesto"),
  tipoTemplate: z.enum(TIPI_TEMPLATE),
  subject: z.string().min(1, "Soggetto richiesto"),
  bodyEmail: z.string().min(1, "Corpo email richiesto"),
  bodySms: z.string().min(1, "Testo SMS richiesto"),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
  sentAt: true,
}).extend({
  tipo: z.enum(TIPI_NOTIFICA).default("altro"),
  classificazione: z.enum(CLASSIFICAZIONI_NOTIFICA).default("ordinaria"),
  subject: z.string().min(1, "Soggetto richiesto"),
  message: z.string().min(1, "Messaggio richiesto"),
  status: z.enum(["pending", "sending", "sent", "scheduled", "failed"]).default("pending"),
});

export const insertAppUserSchema = createInsertSchema(appUsers).omit({
  id: true,
  createdAt: true,
  lastLoginAt: true,
  passwordHash: true,
}).extend({
  username: z.string().min(3, "Username min 3 caratteri"),
  // Facoltativa: un utente authSource "ad" non ha una password locale da impostare.
  password: z.string().min(8, "Password min 8 caratteri").optional(),
  role: z.enum(APP_ROLES).default("user"),
  authSource: z.enum(AUTH_SOURCES).default("locale"),
  isActive: z.boolean().default(true),
});

// ---- TypeScript types ----

export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type NetworkSegment = typeof networkSegments.$inferSelect;

export type InsertConsorziati = z.infer<typeof insertConsorziatiSchema>;
export type Consorziato = typeof consorziati.$inferSelect;

export type InsertCadastralParcel = z.infer<typeof insertCadastralParcelSchema>;
export type CadastralParcel = typeof cadastralParcels.$inferSelect;

export type InsertParcelSegmentMapping = z.infer<typeof insertParcelSegmentMappingSchema>;
export type ParcelSegmentMapping = typeof parcelSegmentMappings.$inferSelect;

export type InsertParcelUserAssignment = z.infer<typeof insertParcelUserAssignmentSchema>;
export type ParcelUserAssignment = typeof parcelUserAssignments.$inferSelect;

export type InsertNotificationTemplate = z.infer<typeof insertNotificationTemplateSchema>;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
export type NotificationTarget = typeof notificationTargets.$inferSelect;

/** Un codice selezionato, come lo passa l'invio all'archivio. */
export type TargetNotifica = {
  codice: string;
  livello: LivelloCodice;
  descrizione: string | null;
};

export type ImportLog = typeof importLogs.$inferSelect;

export type AppUser = typeof appUsers.$inferSelect;
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;

export const insertRichiestaAccessoSchema = createInsertSchema(richiesteAccesso).omit({
  id: true,
  primoTentativo: true,
  ultimoTentativo: true,
  tentativi: true,
});
export type RichiestaAccesso = typeof richiesteAccesso.$inferSelect;
export type InsertRichiestaAccesso = z.infer<typeof insertRichiestaAccessoSchema>;

export const insertUtenteTestSchema = createInsertSchema(utentiTest).omit({
  id: true,
  createdAt: true,
});

export type UtenteTest = typeof utentiTest.$inferSelect;
export type InsertUtenteTest = z.infer<typeof insertUtenteTestSchema>;

// Safe user type (no passwordHash) returned to clients
export type SafeAppUser = Omit<AppUser, "passwordHash">;

// Composite types
export type SegmentWithUserCount = NetworkSegment & {
  userCount: number;
  parcelCount: number;
};

export type ConsorziatolWithSegments = Consorziato & {
  segments: NetworkSegment[];
};

export type CadastralParcelWithDetails = CadastralParcel & {
  userCount: number;
  segmentCount: number;
};

export type NotificationWithStats = Notification & {
  segment?: NetworkSegment;
  emailOpenRate: number;
  smsDeliveryRate: number;
};

// --- Storico Notifiche (issue #12) ---

/** Riga della tabella principale dello storico. */
export type NotificationHistoryRow = {
  id: number;
  codice: string;          // "N00042"
  utente: string | null;   // notifications.createdBy
  data: string;            // ISO: sentAt ?? createdAt
  numRogge: number;        // rogge distinte fra i destinatari
  numDestinatari: number;
  tipo: string;
  classificazione: string;
  /**
   * Il legame con cui sono stati scelti i destinatari (issue #54): `live` o
   * `stagione`, fissato all'invio in `notifications.legame`. Null per le
   * notifiche precedenti alla scelta del legame (issue #27) e per quelle dei
   * percorsi legacy, che non lo chiedono.
   */
  legame: string | null;
  subject: string;
  /**
   * Comunicazione andata ai soli utenti di test (issue #36).
   *
   * Derivata dai destinatari, non da una colonna: e' la stessa definizione con
   * cui il superadmin le cancella per ripulire Dashboard e Storico dopo il
   * collaudo, e due definizioni diverse vorrebbero dire un badge che promette
   * una cancellazione che poi non avviene.
   */
  prova: boolean;
};

/** Riga del dettaglio destinatari di una notifica. */
export type NotificationRecipientDetail = {
  id: number;
  codiceConduttore: string | null;
  descrizioneConduttore: string | null;
  codiceRoggia: string | null;
  descrizioneRoggia: string | null;
  sms: string | null;
  mail: string | null;
  /** "normale" | "pec", oppure null per le notifiche precedenti ai due canali. */
  canale: string | null;
  /** Se questa riga e' un utente di test e non un conduttore vero (issue #36). */
  utenteTest: boolean;
};

export type NotificationHistoryDetail = NotificationHistoryRow & {
  messaggio: string;
  /** Testo SMS registrato con la notifica (issue #28): null se non c'è mai stato. */
  messaggioSms: string | null;
  destinatari: NotificationRecipientDetail[];
};

/** Filtri accettati da GET /api/notifications/storico. */
export type NotificationHistoryFilters = {
  utente?: string;
  dataInizio?: string;   // YYYY-MM-DD
  dataFine?: string;     // YYYY-MM-DD
  roggia?: string;
  tipo?: string;
  classificazione?: string;
  destinatario?: string;
};


export const SEGMENT_STATUSES = ["active", "maintenance", "inactive"] as const;
export type SegmentStatus = typeof SEGMENT_STATUSES[number];

// ============================================================
// Consortium WS mirror tables (read-only copy, source of truth = consorzio)
// Natural keys, no hard FKs between mirror tables (soft references).
// ============================================================

export const conduttori = pgTable("conduttori", {
  keykey: text("keykey").primaryKey(),
  descrizione: text("descrizione").notNull().default(""),
  email: text("email"),
  cellulare: text("cellulare"),
  tipoEmail: text("tipo_email").notNull().default("normale"), // "normale" | "pec"
  flagAttivo: boolean("flag_attivo").notNull().default(true),
  dataConsenso: text("data_consenso"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

// --- Modello vero del consorzio (2026-09): madri / tratte / legami ---
//
// Sostituisce rogge_madri + rogge_figlie + associazioni. La differenza che
// conta: `codice_madre` è **caricato**, non calcolato dal prefisso. Per i
// codici R la madre è l'impianto `IM..` che li rivendica, e 9 prefissi su 34
// sono spalmati su più impianti — `R08` da solo ne copre 13.

export const madri = pgTable("madri", {
  codice: text("codice").primaryKey(),            // IM01A | S45 | R29
  name: text("name").notNull().default(""),
  categoria: text("categoria").notNull(),         // rogge | impianti | pozzi
  tipoIrrigazione: text("tipo_irrigazione"),      // descrizione WS; null per S e servizio
  origine: text("origine").notNull(),             // impianti | orari | servizio
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const tratte = pgTable("tratte", {
  keyroggia: text("keyroggia").primaryKey(),      // R34D02S01 | S45D00001 | R29D10+++
  name: text("name").notNull().default(""),
  // NOT NULL per costruzione: una tratta senza madre non entra nel mirror,
  // diventa una tratta di servizio sotto la madre del suo prefisso. È
  // l'invariante che rende inutile ogni controllo a valle.
  codiceMadre: text("codice_madre").notNull().references(() => madri.codice),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => ({
  byMadre: index("tratte_madre_idx").on(t.codiceMadre),
}));

export const legami = pgTable("legami", {
  id: serial("id").primaryKey(),
  keykey: text("keykey").notNull(),               // soft-ref -> conduttori.keykey
  // Soft-ref e non FK verso `tratte`: il sync garantisce già che ogni legame
  // abbia la sua tratta (le sintetizza), e una FK qui trasformerebbe una
  // sorpresa nei dati in un sync notturno che fallisce per intero invece di
  // scartare e contare.
  keyroggia: text("keyroggia").notNull(),
  metodo: text("metodo").notNull(),               // live | stagione
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => ({
  byRoggiaMetodo: index("legami_roggia_metodo_idx").on(t.keyroggia, t.metodo),
  byKeykey: index("legami_keykey_idx").on(t.keykey),
}));

// --- Seconda gerarchia (2026-09, issue #49): le rogge madri R ---
//
// Vive accanto a madri/tratte, non dentro: il consorzio la mantiene con due
// endpoint propri e liste che non coincidono con quelle degli impianti.
// I nomi NON sono `rogge_madri`/`rogge_figlie`: quelli li ha cancellati la
// migrazione 0012, e su un database che non l'avesse mai applicata due epoche
// diverse finirebbero nella stessa tabella senza che nessuno se ne accorga.

export const madriRogge = pgTable("madri_rogge", {
  codice: text("codice").primaryKey(),           // R01 | R08 | R45
  name: text("name").notNull().default(""),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const tratteRogge = pgTable("tratte_rogge", {
  keyroggia: text("keyroggia").primaryKey(),     // R08D02S01 | R02D10+++
  name: text("name").notNull().default(""),
  // Nessuna FK verso madri_rogge dalla 0015: una figlia può arrivare senza la
  // sua madre in elenco, e si tiene (richiesta del consorzio, 24/09/2026).
  codiceMadre: text("codice_madre").notNull(),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
}, (t) => ({
  byMadre: index("tratte_rogge_madre_idx").on(t.codiceMadre),
}));

// Gestione Codici (issue #52): quali madri l'admin ha spento. Tabella
// dell'app, non del mirror — il sync riscrive `madri` e `madri_rogge` ogni
// notte, e una colonna lì sopravviverebbe solo fino alle 03:00. Si scrivono
// solo i codici **spenti**: al primo rilascio la tabella è vuota e tutto è
// acceso, e un codice nuovo portato dal sync nasce acceso senza che nessuno
// debba ricordarsene. Nessuna FK verso le due tabelle del mirror, per la
// stessa ragione: il sync le svuota e le riempie.
export const codiciSpenti = pgTable("codici_spenti", {
  /** "impianti" (tabella `madri`) | "rogge" (tabella `madri_rogge`): vedi shared/codici-attivi.ts. */
  gerarchia: text("gerarchia").notNull(),
  codice: text("codice").notNull(),
  spentoDa: text("spento_da"),
  spentoIl: timestamp("spento_il").notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.gerarchia, t.codice] }),
}));

export type CodiceSpento = typeof codiciSpenti.$inferSelect;

export type MadreRoggia = typeof madriRogge.$inferSelect;
export type TrattaRoggia = typeof tratteRogge.$inferSelect;

// ============================================================
// Support tables
// ============================================================

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(),                 // "notturno" | "pre-notifica" | "manuale"
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: text("status").notNull().default("running"), // "running" | "success" | "partial" | "failed"
  entityCounts: text("entity_counts"),                 // JSON: { entity: rowCount }
  errors: text("errors"),                              // JSON: string[]
  skippedEntities: text("skipped_entities"),           // JSON: string[] — etichette delle entità non configurate, distinte dagli errori veri
});

// ---- Mirror + support types ----

export type Conduttore = typeof conduttori.$inferSelect;
export type Madre = typeof madri.$inferSelect;
export type Tratta = typeof tratte.$inferSelect;
export type Legame = typeof legami.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;

// --- Righe della sezione Anagrafiche (sola lettura, dallo specchio consorzio) ---

export type RigaRoggia = {
  codiceMadre: string;
  descrizioneMadre: string;
  codiceFiglia: string;
  descrizioneFiglia: string;
};

/**
 * Una riga della scheda «Rogge madri» di Anagrafiche.
 *
 * `codiceMadreImpianto` è l'impianto `IM` della stessa tratta nel registro
 * degli impianti, quando esiste — stessa cosa di
 * `TrattaRoggiaSelezionabile.codicemadreimpianto`, usata qui e non lì perché
 * questa riga non porta già una `codicemadre`. Serve **solo** all'ereditarietà
 * dello stato (issue #49, Rilievo 2): senza, una tratta chiusa perché è chiuso
 * il suo impianto risulterebbe "Aperta" in questa scheda mentre "Rogge" e
 * Invia notifica, sugli stessi dati, dicono "Chiusa". `null` per una figlia
 * che nessun impianto rivendica.
 */
export type RigaRoggiaMadre = RigaRoggia & {
  codiceMadreImpianto: string | null;
};

export type RigaDestinatario = {
  codice: string;
  descrizione: string;
  numero: string | null;
  mail: string | null;
};

export type RigaLegame = {
  codiceDestinatario: string;
  descrizioneDestinatario: string;
  codiceFiglia: string;
  descrizioneFiglia: string;
};

// --- Righe di Invia notifica (selezione a cascata madre → tratte → destinatari) ---
//
// Sono viste di lettura sullo specchio del consorzio, non tabelle: la pagina di
// invio non deve conoscere la forma del mirror né rifare i join a mano.

export type MadreSelezionabile = {
  codicemadre: string;
  name: string;
  categoria: CategoriaMadre;
  /** `servizio` = madre sintetizzata da noi, non esiste nell'anagrafica del consorzio. */
  origine: OrigineMadre;
};

export type TrattaSelezionabile = {
  keyroggia: string;
  name: string;
  codicemadre: string | null;
};

/** Una roggia madre come la mostra il quarto bottone. Niente categoria: le
 *  rogge madri sono una gerarchia a sé, non una quarta categoria di `madri`. */
export type RoggiaMadreSelezionabile = {
  codicemadre: string;
  name: string;
};

/**
 * Una figlia della gerarchia R, con **due** madri.
 *
 * `codicemadre` è la roggia madre: è con quella che si seleziona e che
 * «Tutta la roggia» accende. `codicemadreimpianto` è l'impianto `IM` della
 * stessa tratta, quando esiste, e serve a una cosa sola: l'ereditarietà dello
 * stato, perché chiudere il pozzo `IM27A` deve mostrare chiuse le sue tratte
 * anche guardandole da qui. È null per una figlia che nessun impianto rivendica.
 */
export type TrattaRoggiaSelezionabile = {
  keyroggia: string;
  name: string;
  codicemadre: string;
  codicemadreimpianto: string | null;
};

/** Il conduttore come lo vede chi sta per scrivergli. */
export type DestinatarioInvio = {
  keykey: string;
  descrizione: string;
  email: string | null;
  /** Già ripulito da `numeroDestinatario()`: lo "0" del WS arriva qui come null. */
  cellulare: string | null;
  tipoEmail: string;
};

/** Una coppia (destinatario, tratta): l'aggregazione per conduttore la fa `aggregaDestinatari`. */
export type DestinatarioTratta = {
  conduttore: DestinatarioInvio;
  keyroggia: string;
  /**
   * Descrizione della tratta, o null se il codice non è più risolvibile.
   *
   * Serve all'invio (issue #23): finisce nello snapshot del destinatario, ed è
   * uno dei due campi su cui il filtro "Roggia" dello Storico cerca. Senza,
   * cercare una roggia per nome in una comunicazione già spedita non trova
   * niente — è già successo col codice conduttore (issue #12).
   */
  roggiaDescrizione: string | null;
};

/**
 * Quanti legami di un tipo, sulla selezione e in tutto il mirror (issue #27).
 *
 * Servono due numeri perché uno zero ha due cause: `mirror = 0` significa che
 * quell'export del consorzio non è ancora arrivato, `selezione = 0` con
 * `mirror > 0` significa che su queste tratte non c'è nessuno. Il popup di
 * scelta le dice come frasi diverse, che è tutta la differenza fra un elenco
 * vuoto spiegato e uno muto.
 */
export type ConteggioLegame = { selezione: number; mirror: number };
export type ConteggiLegami = Record<TipoLegame, ConteggioLegame>;

export type StatoSync = {
  inCorso: boolean;
  ultimo: SyncLog | null;
  ultimoCompletato: SyncLog | null;
};
