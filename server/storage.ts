import {
  networkSegments, consorziati, cadastralParcels, parcelSegmentMappings, parcelUserAssignments,
  notificationTemplates, notifications, notificationRecipients, importLogs,
  type NetworkSegment, type Consorziato, type CadastralParcel, type ParcelSegmentMapping, type ParcelUserAssignment,
  type NotificationTemplate, type Notification, type NotificationRecipient, type ImportLog,
  type InsertSegment, type InsertConsorziati, type InsertCadastralParcel, type InsertParcelSegmentMapping,
  type InsertParcelUserAssignment, type InsertNotificationTemplate, type InsertNotification,
  type SegmentWithUserCount, type NotificationWithStats,
  type NotificationHistoryRow, type NotificationHistoryDetail,
  type NotificationHistoryFilters, type NotificationRecipientDetail,
  conduttori, appSettings, syncLogs,
  type Conduttore,
  type AppSetting, type SyncLog,
  type RigaRoggia, type RigaRoggiaMadre, type RigaDestinatario, type RigaLegame,
  type MadreSelezionabile, type TrattaSelezionabile, type DestinatarioTratta,
  type ConteggiLegami,
  notificationTargets,
  type TargetNotifica,
  richiesteAccesso,
  type RichiestaAccesso,
  utentiTest,
  type UtenteTest,
  type InsertUtenteTest,
  madri as madriT, tratte as tratteT, legami as legamiT,
  type Madre, type Tratta, type Legame,
  madriRogge as madriRoggeT, tratteRogge as tratteRoggeT,
  codiciSpenti as codiciSpentiT,
  type MadreRoggia, type TrattaRoggia,
  type RoggiaMadreSelezionabile, type TrattaRoggiaSelezionabile,
} from "@shared/schema";
import { CATEGORIE_MADRE, type CategoriaMadre } from "@shared/categorie-madri";
import { numeroDestinatario } from "@shared/destinatari";
import { isTipoLegame, type TipoLegame } from "@shared/legame";
import type { EventoStato, LivelloCodice } from "@shared/stato-rogge";
import type { CodiciSpenti, GerarchiaCodice } from "@shared/codici-attivi";
import { ORIGINI_MADRE, type RegistroConsorzio, type ConteggiRegistro, type OrigineMadre, type ConduttoreInsert } from "@shared/ws-consorzio";
import type { GerarchiaRogge, ConteggiGerarchiaRogge, NomiGerarchiaRogge } from "@shared/gerarchia-rogge";
import { componiRigheRoggeMadri } from "@shared/righe-anagrafiche";
import { db } from "./db";
import { eq, ne, sql, and, inArray, lte, desc, or, type SQL } from "drizzle-orm";
import { costruisciStorico, buildHistoryDetail } from "@shared/storico-notifiche";

export interface IStorage {
  // Segments
  getAllSegments(): Promise<NetworkSegment[]>;
  getSegmentById(id: number): Promise<NetworkSegment | undefined>;
  getSegmentsWithCounts(): Promise<SegmentWithUserCount[]>;
  createSegment(data: InsertSegment): Promise<NetworkSegment>;
  updateSegment(id: number, data: Partial<InsertSegment>): Promise<NetworkSegment | undefined>;
  updateSegmentStatus(id: number, status: string): Promise<NetworkSegment | undefined>;
  deleteSegment(id: number): Promise<boolean>;

  // Consorziati
  getAllConsorziati(): Promise<Consorziato[]>;
  getConsorziatiById(id: number): Promise<Consorziato | undefined>;
  createConsorziato(data: InsertConsorziati): Promise<Consorziato>;
  updateConsorziato(id: number, data: Partial<InsertConsorziati>): Promise<Consorziato | undefined>;
  deleteConsorziato(id: number): Promise<boolean>;
  getUsersBySegmentId(segmentId: number): Promise<Consorziato[]>;
  getSegmentsByUserId(userId: number): Promise<NetworkSegment[]>;

  // Cadastral Parcels
  getAllParcels(): Promise<CadastralParcel[]>;
  getAllParcelsWithCounts(): Promise<import("@shared/schema").CadastralParcelWithDetails[]>;
  getParcelById(id: number): Promise<CadastralParcel | undefined>;
  createParcel(data: InsertCadastralParcel): Promise<CadastralParcel>;
  updateParcel(id: number, data: Partial<InsertCadastralParcel>): Promise<CadastralParcel | undefined>;
  deleteParcel(id: number): Promise<boolean>;
  getParcelsBySegmentId(segmentId: number): Promise<CadastralParcel[]>;
  getParcelsByUserId(userId: number): Promise<CadastralParcel[]>;
  getUsersByParcelId(parcelId: number): Promise<Consorziato[]>;
  getSegmentsByParcelId(parcelId: number): Promise<NetworkSegment[]>;

  // Parcel-Segment mappings
  addParcelToSegment(data: InsertParcelSegmentMapping): Promise<ParcelSegmentMapping>;
  removeParcelFromSegment(parcelId: number, segmentId: number): Promise<boolean>;
  getParcelSegmentMappings(segmentId: number): Promise<ParcelSegmentMapping[]>;

  // Parcel-User assignments
  addParcelToUser(data: InsertParcelUserAssignment): Promise<ParcelUserAssignment>;
  removeParcelFromUser(parcelId: number, userId: number): Promise<boolean>;
  getParcelUserAssignments(parcelId: number): Promise<ParcelUserAssignment[]>;

  // Notification Templates
  getAllTemplates(): Promise<NotificationTemplate[]>;
  getTemplateById(id: number): Promise<NotificationTemplate | undefined>;
  getDefaultTemplateForTipo(tipoTemplate: string): Promise<NotificationTemplate | undefined>;
  createTemplate(data: InsertNotificationTemplate, createdBy?: string | null): Promise<NotificationTemplate>;
  // `updatedBy` arriva dalla sessione, mai dal corpo della richiesta: è il
  // motivo per cui non sta dentro `data` (issue #18).
  updateTemplate(id: number, data: Partial<InsertNotificationTemplate>, updatedBy?: string | null): Promise<NotificationTemplate | undefined>;
  deleteTemplate(id: number): Promise<boolean>;
  setDefaultTemplate(id: number, tipoTemplate: string): Promise<void>;

  // Notifications
  getAllNotifications(): Promise<NotificationWithStats[]>;
  getNotificationById(id: number): Promise<Notification | undefined>;
  createNotification(data: InsertNotification): Promise<Notification>;
  updateNotificationStatus(id: number, status: string, sentAt?: Date): Promise<void>;
  deleteNotification(id: number): Promise<boolean>;
  getPendingScheduledNotifications(): Promise<Notification[]>;

  // Storico Notifiche (issue #12)
  getNotificationHistory(filters: NotificationHistoryFilters): Promise<NotificationHistoryRow[]>;
  getNotificationHistoryDetail(id: number): Promise<NotificationHistoryDetail | undefined>;

  // Notification Recipients
  createNotificationRecipient(data: Partial<NotificationRecipient>): Promise<NotificationRecipient>;
  getRecipientsByNotificationId(notificationId: number): Promise<NotificationRecipient[]>;
  updateRecipientEmailStatus(id: number, status: string, openedAt?: Date): Promise<void>;
  // Esito della spedizione, non dell'apertura: `updateRecipientEmailStatus` sa
  // scrivere solo lo stato e la data di apertura, e lascerebbe fuori il
  // messageId con cui Nodemailer identifica la mail e l'ora in cui è partita.
  registraEsitoEmail(id: number, esito: { status: string; messageId?: string | null; sentAt?: Date }): Promise<void>;
  updateRecipientSmsStatus(id: number, status: string, deliveredAt?: Date): Promise<void>;
  getRecipientByEmailMessageId(messageId: string): Promise<NotificationRecipient | undefined>;

  // Stats
  getStats(): Promise<{
    totalSegments: number;
    activeSegments: number;
    maintenanceSegments: number;
    totalConsorziati: number;
    totalParcels: number;
    totalNotifications: number;
    scheduledNotifications: number;
    avgEmailOpenRate: number;
  }>;

  // Import Logs
  getAllImportLogs(): Promise<ImportLog[]>;
  createImportLog(data: Partial<ImportLog>): Promise<ImportLog>;

  // Consortium mirror — conduttori
  getAllConduttori(): Promise<Conduttore[]>;
  getConduttoreByKey(keykey: string): Promise<Conduttore | undefined>;
  replaceConduttori(rows: ConduttoreInsert[]): Promise<number>;

  // Registro del consorzio (modello 2026-09): madri / tratte / legami
  /** Sostituisce l'intero registro in una transazione: o tutto, o niente. */
  replaceRegistro(r: RegistroConsorzio): Promise<ConteggiRegistro>;
  getAllMadri(): Promise<Madre[]>;
  getAllTratte(): Promise<Tratta[]>;
  /** `keyroggia → codice madre`, per chi deve risolvere l'ereditarietà. */
  getMappaMadri(): Promise<Record<string, string>>;
  /** `keyroggia → roggia madre` della seconda gerarchia (`tratte_rogge`). */
  getMappaMadriRogge(): Promise<Record<string, string>>;

  // Gestione Codici (issue #52): solo i codici spenti sono scritti.
  getCodiciSpenti(): Promise<CodiciSpenti>;
  /** `spento: false` riaccende, cioè cancella la riga; ripetere non fa danni. */
  impostaCodiceSpento(gerarchia: GerarchiaCodice, codice: string, spento: boolean, utente: string | null): Promise<void>;

  // Seconda gerarchia: rogge madri R (issue #49). Gruppo suo, transazione sua.
  replaceGerarchiaRogge(g: GerarchiaRogge): Promise<ConteggiGerarchiaRogge>;
  getRoggeMadri(): Promise<RoggiaMadreSelezionabile[]>;
  getTratteDiRoggeMadri(codici: string[]): Promise<TrattaRoggiaSelezionabile[]>;
  /** Nomi veri del consorzio: li usano i nomi di servizio del sync e i target dell'invio. */
  getNomiGerarchiaRogge(): Promise<NomiGerarchiaRogge>;
  /** I destinatari di una roggia madre: passa dalle sue figlie della seconda gerarchia. */
  getDestinatariPerRoggeMadri(codici: string[], legame: TipoLegame): Promise<DestinatarioTratta[]>;

  // Anagrafiche (lettura con join, sola lettura)
  getRigheRogge(): Promise<RigaRoggia[]>;
  getRigheDestinatari(): Promise<RigaDestinatario[]>;
  getRigheLegami(metodo: string): Promise<RigaLegame[]>;
  getRigheRoggeMadri(): Promise<RigaRoggiaMadre[]>;

  // Stato aperta/chiusa delle rogge (issue #22)
  /** Registra i codici selezionati da una comunicazione. Ritorna quanti ne ha scritti. */
  createNotificationTargets(notificationId: number, targets: TargetNotifica[]): Promise<number>;
  /** Gli eventi che muovono lo stato: solo notifiche di apertura o chiusura. */
  getEventiStato(): Promise<EventoStato[]>;

  // Invia notifica: selezione a cascata sullo specchio consorzio (issue #14)
  getMadriSelezionabili(): Promise<MadreSelezionabile[]>;
  getTratteDiMadri(codicimadre: string[]): Promise<TrattaSelezionabile[]>;
  getDestinatariPerTratte(keyroggie: string[], legame: TipoLegame): Promise<DestinatarioTratta[]>;
  getDestinatariPerMadri(codicimadre: string[], legame: TipoLegame): Promise<DestinatarioTratta[]>;
  /** I due numeri per metodo che il popup di scelta legame mostra (issue #27). */
  conteggiLegami(tratte: string[], madri: string[], roggeMadri?: string[]): Promise<ConteggiLegami>;

  // App settings (key/value)
  getSetting(key: string): Promise<string | undefined>;
  getAllSettings(): Promise<Record<string, string>>;
  setSetting(key: string, value: string): Promise<void>;

  // Richieste di accesso (chi ha superato AD ma non e' fra gli abilitati)
  registraRichiestaAccesso(username: string): Promise<void>;
  getRichiesteAccesso(): Promise<RichiestaAccesso[]>;
  deleteRichiestaAccesso(id: number): Promise<boolean>;
  deleteRichiestaAccessoPerUsername(username: string): Promise<void>;

  // Utenti di test degli invii (issue #36)
  getUtentiTest(): Promise<UtenteTest[]>;
  getUtentiTestAttivi(): Promise<UtenteTest[]>;
  createUtenteTest(data: InsertUtenteTest): Promise<UtenteTest>;
  updateUtenteTest(id: number, data: Partial<InsertUtenteTest>): Promise<UtenteTest | undefined>;
  deleteUtenteTest(id: number): Promise<boolean>;
  /**
   * Le comunicazioni andate ai soli utenti di test: hanno destinatari, e
   * nessuno di essi e' un conduttore vero. E' una definizione derivata dai
   * destinatari e non una colonna, perche' un flag scritto all'invio puo'
   * mentire mentre «a chi e' andata questa mail» e' un fatto gia' in tabella.
   */
  contaNotificheProva(): Promise<number>;
  eliminaNotificheProva(): Promise<number>;

  // Sync logs
  createSyncLog(data: { trigger: string }): Promise<SyncLog>;
  updateSyncLog(id: number, data: { finishedAt?: Date; status?: string; entityCounts?: string; errors?: string; skippedEntities?: string }): Promise<SyncLog | undefined>;
  getRecentSyncLogs(limit: number): Promise<SyncLog[]>;
}

// ---- MemStorage ----

export class MemStorage implements IStorage {
  private segments: Map<number, NetworkSegment> = new Map();
  private consorziatiMap: Map<number, Consorziato> = new Map();
  private parcels: Map<number, CadastralParcel> = new Map();
  private parcelSegmentMappingsMap: Map<number, ParcelSegmentMapping> = new Map();
  private parcelUserAssignmentsMap: Map<number, ParcelUserAssignment> = new Map();
  private templatesMap: Map<number, NotificationTemplate> = new Map();
  private notificationsMap: Map<number, Notification> = new Map();
  private recipientsMap: Map<number, NotificationRecipient> = new Map();
  private importLogsMap: Map<number, ImportLog> = new Map();
  private conduttoriMap: Map<string, Conduttore> = new Map();
  private madriMap: Map<string, Madre> = new Map();
  private tratteMap: Map<string, Tratta> = new Map();
  private legamiList: Legame[] = [];
  private madriRoggeMap: Map<string, MadreRoggia> = new Map();
  private tratteRoggeMap: Map<string, TrattaRoggia> = new Map();
  /** Chiave `gerarchia|codice` → gerarchia. */
  private codiciSpentiMap: Map<string, GerarchiaCodice> = new Map();
  private legamiIdSeq = 1;
  private settingsMap: Map<string, string> = new Map();
  private syncLogsMap: Map<number, SyncLog> = new Map();
  private syncLogIdSeq = 1;
  private notificationTargetsList: { id: number; notificationId: number; codice: string; livello: LivelloCodice; descrizione: string | null }[] = [];
  private notificationTargetIdSeq = 1;
  private richiesteAccessoMap: Map<string, RichiestaAccesso> = new Map();
  private prossimaRichiestaId = 1;
  private utentiTestMap: Map<number, UtenteTest> = new Map();
  private prossimoUtenteTestId = 1;

  private segmentIdSeq = 1;
  private consorziatiIdSeq = 1;
  private parcelIdSeq = 1;
  private parcelSegmentIdSeq = 1;
  private parcelUserIdSeq = 1;
  private templateIdSeq = 1;
  private notificationIdSeq = 1;
  private recipientIdSeq = 1;
  private importLogIdSeq = 1;

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed segments
    const seg1: NetworkSegment = {
      id: this.segmentIdSeq++,
      name: "Tratta Principale Nord",
      code: "TPN-001",
      description: "Tratta principale di distribuzione zona nord",
      lengthKm: 12.5,
      coordinates: null,
      status: "active",
      notes: null,
      createdAt: new Date(),
    };
    const seg2: NetworkSegment = {
      id: this.segmentIdSeq++,
      name: "Tratta Secondaria Est",
      code: "TSE-002",
      description: "Derivazione zona est",
      lengthKm: 5.3,
      coordinates: null,
      status: "maintenance",
      notes: "In manutenzione straordinaria",
      createdAt: new Date(),
    };
    this.segments.set(seg1.id, seg1);
    this.segments.set(seg2.id, seg2);

    // Seed consorziati
    const c1: Consorziato = {
      id: this.consorziatiIdSeq++,
      firstName: "Mario",
      lastName: "Rossi",
      email: "mario.rossi@example.com",
      phone: "+39 331 1234567",
      userType: "agricoltore",
      address: "Via Roma 12, 44100 Ferrara",
      codiceFiscale: "RSSMRA80A01D548Y",
      codiceConsorzio: "C-0001",
      notes: null,
      createdAt: new Date(),
    };
    const c2: Consorziato = {
      id: this.consorziatiIdSeq++,
      firstName: "Lucia",
      lastName: "Bianchi",
      email: "lucia.bianchi@example.com",
      phone: "+39 347 9876543",
      userType: "privato",
      address: "Via Po 8, 44121 Ferrara",
      codiceFiscale: null,
      codiceConsorzio: "C-0002",
      notes: null,
      createdAt: new Date(),
    };
    this.consorziatiMap.set(c1.id, c1);
    this.consorziatiMap.set(c2.id, c2);

    // Seed parcels
    const p1: CadastralParcel = {
      id: this.parcelIdSeq++,
      comune: "Ferrara",
      codiceComune: "D548",
      foglio: "15",
      mappale: "234",
      sezione: null,
      areaM2: 12000,
      notes: null,
      createdAt: new Date(),
    };
    const p2: CadastralParcel = {
      id: this.parcelIdSeq++,
      comune: "Ferrara",
      codiceComune: "D548",
      foglio: "15",
      mappale: "235",
      sezione: null,
      areaM2: 8500,
      notes: null,
      createdAt: new Date(),
    };
    this.parcels.set(p1.id, p1);
    this.parcels.set(p2.id, p2);

    // Seed parcel-segment mappings
    const psm1: ParcelSegmentMapping = {
      id: this.parcelSegmentIdSeq++,
      parcelId: p1.id,
      segmentId: seg1.id,
      assignedAt: new Date(),
    };
    this.parcelSegmentMappingsMap.set(psm1.id, psm1);

    // Seed parcel-user assignments
    const pua1: ParcelUserAssignment = {
      id: this.parcelUserIdSeq++,
      parcelId: p1.id,
      userId: c1.id,
      role: "owner",
      assignedAt: new Date(),
    };
    const pua2: ParcelUserAssignment = {
      id: this.parcelUserIdSeq++,
      parcelId: p2.id,
      userId: c2.id,
      role: "owner",
      assignedAt: new Date(),
    };
    this.parcelUserAssignmentsMap.set(pua1.id, pua1);
    this.parcelUserAssignmentsMap.set(pua2.id, pua2);

    // Seed notification templates (uno predefinito per tipo template)
    const defaultTemplates: Omit<NotificationTemplate, "id">[] = [
      {
        name: "Interruzione servizio irriguo",
        tipoTemplate: "chiusura",
        subject: "Interruzione servizio irriguo — Tratta {{tratta_nome}} ({{data_evento}})",
        bodyEmail: `<p>Gentile {{nome_destinatario}},</p>
<p>La informiamo che il servizio irriguo sulla tratta <strong>{{tratta_nome}}</strong> (codice: {{tratta_codice}}) sarà <strong>interrotto</strong> a partire dal <strong>{{data_evento}}</strong> alle ore <strong>{{ora_inizio}}</strong>.</p>
<p>Durata prevista dell'interruzione: <strong>{{durata_prevista}}</strong>.</p>
{{#if tratte_alternative}}<p>Tratte alternative disponibili: <em>{{tratte_alternative}}</em>.</p>{{/if}}
{{#if messaggio_personalizzato}}<p>Note: {{messaggio_personalizzato}}</p>{{/if}}
<p>Ci scusiamo per il disagio.<br>Cordiali saluti,<br><strong>Consorzio di Bonifica</strong></p>`,
        bodySms: "CONS. IRRIGUO: interruzione tratta {{tratta_nome}} dal {{data_evento}} ore {{ora_inizio}} per {{durata_prevista}}. Info: consorzio.",
        variables: JSON.stringify(["nome_destinatario", "tratta_nome", "tratta_codice", "data_evento", "ora_inizio", "durata_prevista", "tratte_alternative", "messaggio_personalizzato"]),
        isDefault: true,
        createdBy: null,
        createdAt: new Date(),
        updatedBy: null,
        updatedAt: null,
      },
      {
        name: "Manutenzione programmata rete",
        tipoTemplate: "altro",
        subject: "Manutenzione programmata — Tratta {{tratta_nome}} ({{data_evento}})",
        bodyEmail: `<p>Gentile {{nome_destinatario}},</p>
<p>La informiamo che è previsto un intervento di <strong>manutenzione programmata</strong> sulla tratta <strong>{{tratta_nome}}</strong> (codice: {{tratta_codice}}) in data <strong>{{data_evento}}</strong> dalle ore <strong>{{ora_inizio}}</strong>.</p>
<p>Durata stimata dei lavori: <strong>{{durata_prevista}}</strong>.</p>
{{#if messaggio_personalizzato}}<p>Dettagli: {{messaggio_personalizzato}}</p>{{/if}}
<p>Durante i lavori il servizio potrebbe essere parzialmente ridotto.<br>Cordiali saluti,<br><strong>Consorzio di Bonifica</strong></p>`,
        bodySms: "CONS. IRRIGUO: manutenzione tratta {{tratta_nome}} il {{data_evento}} ore {{ora_inizio}} (durata: {{durata_prevista}}). Possibili disservizi.",
        variables: JSON.stringify(["nome_destinatario", "tratta_nome", "tratta_codice", "data_evento", "ora_inizio", "durata_prevista", "messaggio_personalizzato"]),
        isDefault: true,
        createdBy: null,
        createdAt: new Date(),
        updatedBy: null,
        updatedAt: null,
      },
      {
        name: "Riduzione temporanea portata",
        tipoTemplate: "altro",
        subject: "Riduzione temporanea portata — Tratta {{tratta_nome}} ({{data_evento}})",
        bodyEmail: `<p>Gentile {{nome_destinatario}},</p>
<p>La informiamo che a partire dal <strong>{{data_evento}}</strong> è prevista una <strong>riduzione temporanea della portata</strong> sulla tratta <strong>{{tratta_nome}}</strong> (codice: {{tratta_codice}}).</p>
<p>Durata prevista: <strong>{{durata_prevista}}</strong>.</p>
{{#if messaggio_personalizzato}}<p>Motivazione: {{messaggio_personalizzato}}</p>{{/if}}
<p>Si prega di pianificare l'irrigazione di conseguenza.<br>Cordiali saluti,<br><strong>Consorzio di Bonifica</strong></p>`,
        bodySms: "CONS. IRRIGUO: riduzione portata tratta {{tratta_nome}} dal {{data_evento}} per {{durata_prevista}}. Pianificare l'irrigazione.",
        variables: JSON.stringify(["nome_destinatario", "tratta_nome", "tratta_codice", "data_evento", "ora_inizio", "durata_prevista", "messaggio_personalizzato"]),
        // Il predefinito è uno per tipo: fra i tre template di tipo "altro" lo
        // è la manutenzione, questo e lo straordinario no.
        isDefault: false,
        createdBy: null,
        createdAt: new Date(),
        updatedBy: null,
        updatedAt: null,
      },
      {
        name: "Ripresa servizio irriguo",
        tipoTemplate: "apertura",
        subject: "Ripresa servizio irriguo — Tratta {{tratta_nome}}",
        bodyEmail: `<p>Gentile {{nome_destinatario}},</p>
<p>Siamo lieti di comunicarLe che il servizio irriguo sulla tratta <strong>{{tratta_nome}}</strong> (codice: {{tratta_codice}}) è stato <strong>ripristinato</strong>.</p>
<p>La tratta è nuovamente operativa a partire dal <strong>{{data_evento}}</strong> ore <strong>{{ora_inizio}}</strong>.</p>
{{#if messaggio_personalizzato}}<p>Note: {{messaggio_personalizzato}}</p>{{/if}}
<p>Cordiali saluti,<br><strong>Consorzio di Bonifica</strong></p>`,
        bodySms: "CONS. IRRIGUO: ripresa servizio tratta {{tratta_nome}} dal {{data_evento}} ore {{ora_inizio}}. Servizio regolare.",
        variables: JSON.stringify(["nome_destinatario", "tratta_nome", "tratta_codice", "data_evento", "ora_inizio", "messaggio_personalizzato"]),
        isDefault: true,
        createdBy: null,
        createdAt: new Date(),
        updatedBy: null,
        updatedAt: null,
      },
      {
        name: "Intervento straordinario",
        tipoTemplate: "altro",
        subject: "Intervento straordinario — Tratta {{tratta_nome}} ({{data_evento}})",
        bodyEmail: `<p>Gentile {{nome_destinatario}},</p>
<p>La informiamo che è in corso un <strong>intervento straordinario</strong> sulla tratta <strong>{{tratta_nome}}</strong> (codice: {{tratta_codice}}).</p>
<p>Data intervento: <strong>{{data_evento}}</strong> ore <strong>{{ora_inizio}}</strong>.<br>Durata stimata: <strong>{{durata_prevista}}</strong>.</p>
{{#if messaggio_personalizzato}}<p>Dettagli: {{messaggio_personalizzato}}</p>{{/if}}
<p>Ci scusiamo per l'inconveniente.<br>Cordiali saluti,<br><strong>Consorzio di Bonifica</strong></p>`,
        bodySms: "CONS. IRRIGUO: intervento straordinario tratta {{tratta_nome}} il {{data_evento}} ore {{ora_inizio}} ({{durata_prevista}}). Possibili disservizi.",
        variables: JSON.stringify(["nome_destinatario", "tratta_nome", "tratta_codice", "data_evento", "ora_inizio", "durata_prevista", "messaggio_personalizzato"]),
        isDefault: false,
        createdBy: null,
        createdAt: new Date(),
        updatedBy: null,
        updatedAt: null,
      },
    ];
    for (const tmpl of defaultTemplates) {
      const id = this.templateIdSeq++;
      this.templatesMap.set(id, { id, ...tmpl });
    }
  }

  // Segments
  async getAllSegments(): Promise<NetworkSegment[]> {
    return Array.from(this.segments.values());
  }

  async getSegmentById(id: number): Promise<NetworkSegment | undefined> {
    return this.segments.get(id);
  }

  async getSegmentsWithCounts(): Promise<SegmentWithUserCount[]> {
    const segs = Array.from(this.segments.values());
    return segs.map(seg => {
      const parcels = Array.from(this.parcelSegmentMappingsMap.values()).filter(m => m.segmentId === seg.id);
      const parcelIds = parcels.map(m => m.parcelId);
      const userIds = new Set(
        Array.from(this.parcelUserAssignmentsMap.values())
          .filter(a => parcelIds.includes(a.parcelId))
          .map(a => a.userId)
      );
      return { ...seg, userCount: userIds.size, parcelCount: parcelIds.length };
    });
  }

  async createSegment(data: InsertSegment): Promise<NetworkSegment> {
    const id = this.segmentIdSeq++;
    const seg: NetworkSegment = {
      id,
      name: data.name,
      code: data.code,
      description: data.description ?? null,
      lengthKm: data.lengthKm ?? null,
      coordinates: data.coordinates ?? null,
      status: data.status ?? "active",
      notes: data.notes ?? null,
      createdAt: new Date(),
    };
    this.segments.set(id, seg);
    return seg;
  }

  async updateSegment(id: number, data: Partial<InsertSegment>): Promise<NetworkSegment | undefined> {
    const existing = this.segments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.segments.set(id, updated);
    return updated;
  }

  async updateSegmentStatus(id: number, status: string): Promise<NetworkSegment | undefined> {
    return this.updateSegment(id, { status } as Partial<InsertSegment>);
  }

  async deleteSegment(id: number): Promise<boolean> {
    // cascade: remove parcel-segment mappings
    Array.from(this.parcelSegmentMappingsMap.entries())
      .filter(([, m]) => m.segmentId === id)
      .forEach(([k]) => this.parcelSegmentMappingsMap.delete(k));
    return this.segments.delete(id);
  }

  // Consorziati
  async getAllConsorziati(): Promise<Consorziato[]> {
    return Array.from(this.consorziatiMap.values());
  }

  async getConsorziatiById(id: number): Promise<Consorziato | undefined> {
    return this.consorziatiMap.get(id);
  }

  async createConsorziato(data: InsertConsorziati): Promise<Consorziato> {
    const id = this.consorziatiIdSeq++;
    const c: Consorziato = {
      id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone ?? null,
      userType: data.userType,
      address: data.address ?? null,
      codiceFiscale: data.codiceFiscale ?? null,
      codiceConsorzio: data.codiceConsorzio ?? null,
      notes: data.notes ?? null,
      createdAt: new Date(),
    };
    this.consorziatiMap.set(id, c);
    return c;
  }

  async updateConsorziato(id: number, data: Partial<InsertConsorziati>): Promise<Consorziato | undefined> {
    const existing = this.consorziatiMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.consorziatiMap.set(id, updated);
    return updated;
  }

  async deleteConsorziato(id: number): Promise<boolean> {
    Array.from(this.parcelUserAssignmentsMap.entries())
      .filter(([, a]) => a.userId === id)
      .forEach(([k]) => this.parcelUserAssignmentsMap.delete(k));
    return this.consorziatiMap.delete(id);
  }

  async getUsersBySegmentId(segmentId: number): Promise<Consorziato[]> {
    const parcelIds = Array.from(this.parcelSegmentMappingsMap.values())
      .filter(m => m.segmentId === segmentId)
      .map(m => m.parcelId);
    const userIds = new Set(
      Array.from(this.parcelUserAssignmentsMap.values())
        .filter(a => parcelIds.includes(a.parcelId))
        .map(a => a.userId)
    );
    return Array.from(userIds)
      .map(uid => this.consorziatiMap.get(uid))
      .filter((u): u is Consorziato => u !== undefined);
  }

  async getSegmentsByUserId(userId: number): Promise<NetworkSegment[]> {
    const parcelIds = Array.from(this.parcelUserAssignmentsMap.values())
      .filter(a => a.userId === userId)
      .map(a => a.parcelId);
    const segmentIds = new Set(
      Array.from(this.parcelSegmentMappingsMap.values())
        .filter(m => parcelIds.includes(m.parcelId))
        .map(m => m.segmentId)
    );
    return Array.from(segmentIds)
      .map(sid => this.segments.get(sid))
      .filter((s): s is NetworkSegment => s !== undefined);
  }

  // Cadastral Parcels
  async getAllParcels(): Promise<CadastralParcel[]> {
    return Array.from(this.parcels.values());
  }

  async getParcelById(id: number): Promise<CadastralParcel | undefined> {
    return this.parcels.get(id);
  }

  async createParcel(data: InsertCadastralParcel): Promise<CadastralParcel> {
    const id = this.parcelIdSeq++;
    const p: CadastralParcel = {
      id,
      comune: data.comune,
      codiceComune: data.codiceComune,
      foglio: data.foglio,
      mappale: data.mappale,
      sezione: data.sezione ?? null,
      areaM2: data.areaM2 ?? null,
      notes: data.notes ?? null,
      createdAt: new Date(),
    };
    this.parcels.set(id, p);
    return p;
  }

  async updateParcel(id: number, data: Partial<InsertCadastralParcel>): Promise<CadastralParcel | undefined> {
    const existing = this.parcels.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.parcels.set(id, updated);
    return updated;
  }

  async deleteParcel(id: number): Promise<boolean> {
    Array.from(this.parcelSegmentMappingsMap.entries())
      .filter(([, m]) => m.parcelId === id)
      .forEach(([k]) => this.parcelSegmentMappingsMap.delete(k));
    Array.from(this.parcelUserAssignmentsMap.entries())
      .filter(([, a]) => a.parcelId === id)
      .forEach(([k]) => this.parcelUserAssignmentsMap.delete(k));
    return this.parcels.delete(id);
  }

  async getParcelsBySegmentId(segmentId: number): Promise<CadastralParcel[]> {
    const parcelIds = Array.from(this.parcelSegmentMappingsMap.values())
      .filter(m => m.segmentId === segmentId)
      .map(m => m.parcelId);
    return parcelIds
      .map(pid => this.parcels.get(pid))
      .filter((p): p is CadastralParcel => p !== undefined);
  }

  async getParcelsByUserId(userId: number): Promise<CadastralParcel[]> {
    const parcelIds = Array.from(this.parcelUserAssignmentsMap.values())
      .filter(a => a.userId === userId)
      .map(a => a.parcelId);
    return parcelIds
      .map(pid => this.parcels.get(pid))
      .filter((p): p is CadastralParcel => p !== undefined);
  }

  async getAllParcelsWithCounts(): Promise<import("@shared/schema").CadastralParcelWithDetails[]> {
    return Array.from(this.parcels.values()).map(p => {
      const userIds = new Set(
        Array.from(this.parcelUserAssignmentsMap.values())
          .filter(a => a.parcelId === p.id)
          .map(a => a.userId)
      );
      const segmentIds = new Set(
        Array.from(this.parcelSegmentMappingsMap.values())
          .filter(m => m.parcelId === p.id)
          .map(m => m.segmentId)
      );
      return { ...p, userCount: userIds.size, segmentCount: segmentIds.size };
    });
  }

  async getUsersByParcelId(parcelId: number): Promise<Consorziato[]> {
    const userIds = Array.from(this.parcelUserAssignmentsMap.values())
      .filter(a => a.parcelId === parcelId)
      .map(a => a.userId);
    return userIds
      .map(uid => this.consorziatiMap.get(uid))
      .filter((c): c is Consorziato => c !== undefined);
  }

  async getSegmentsByParcelId(parcelId: number): Promise<NetworkSegment[]> {
    const segmentIds = Array.from(this.parcelSegmentMappingsMap.values())
      .filter(m => m.parcelId === parcelId)
      .map(m => m.segmentId);
    return segmentIds
      .map(sid => this.segments.get(sid))
      .filter((s): s is NetworkSegment => s !== undefined);
  }

  // Parcel-Segment mappings
  async addParcelToSegment(data: InsertParcelSegmentMapping): Promise<ParcelSegmentMapping> {
    const id = this.parcelSegmentIdSeq++;
    const m: ParcelSegmentMapping = { id, parcelId: data.parcelId, segmentId: data.segmentId, assignedAt: new Date() };
    this.parcelSegmentMappingsMap.set(id, m);
    return m;
  }

  async removeParcelFromSegment(parcelId: number, segmentId: number): Promise<boolean> {
    const entry = Array.from(this.parcelSegmentMappingsMap.entries())
      .find(([, m]) => m.parcelId === parcelId && m.segmentId === segmentId);
    if (!entry) return false;
    return this.parcelSegmentMappingsMap.delete(entry[0]);
  }

  async getParcelSegmentMappings(segmentId: number): Promise<ParcelSegmentMapping[]> {
    return Array.from(this.parcelSegmentMappingsMap.values()).filter(m => m.segmentId === segmentId);
  }

  // Parcel-User assignments
  async addParcelToUser(data: InsertParcelUserAssignment): Promise<ParcelUserAssignment> {
    const id = this.parcelUserIdSeq++;
    const a: ParcelUserAssignment = {
      id,
      parcelId: data.parcelId,
      userId: data.userId,
      role: data.role ?? "owner",
      assignedAt: new Date(),
    };
    this.parcelUserAssignmentsMap.set(id, a);
    return a;
  }

  async removeParcelFromUser(parcelId: number, userId: number): Promise<boolean> {
    const entry = Array.from(this.parcelUserAssignmentsMap.entries())
      .find(([, a]) => a.parcelId === parcelId && a.userId === userId);
    if (!entry) return false;
    return this.parcelUserAssignmentsMap.delete(entry[0]);
  }

  async getParcelUserAssignments(parcelId: number): Promise<ParcelUserAssignment[]> {
    return Array.from(this.parcelUserAssignmentsMap.values()).filter(a => a.parcelId === parcelId);
  }

  // Notification Templates
  async getAllTemplates(): Promise<NotificationTemplate[]> {
    return Array.from(this.templatesMap.values());
  }

  async getTemplateById(id: number): Promise<NotificationTemplate | undefined> {
    return this.templatesMap.get(id);
  }

  async getDefaultTemplateForTipo(tipoTemplate: string): Promise<NotificationTemplate | undefined> {
    return Array.from(this.templatesMap.values()).find(t => t.tipoTemplate === tipoTemplate && t.isDefault);
  }

  async createTemplate(data: InsertNotificationTemplate, createdBy?: string | null): Promise<NotificationTemplate> {
    const id = this.templateIdSeq++;
    const t: NotificationTemplate = {
      id,
      name: data.name,
      tipoTemplate: data.tipoTemplate,
      subject: data.subject,
      bodyEmail: data.bodyEmail,
      bodySms: data.bodySms,
      variables: data.variables ?? null,
      isDefault: data.isDefault ?? false,
      createdBy: createdBy ?? null,
      createdAt: new Date(),
      // Appena creato non è ancora stato modificato: la riga "Ultima modifica"
      // del dettaglio deve restare vuota, non ripetere l'autore.
      updatedBy: null,
      updatedAt: null,
    };
    this.templatesMap.set(id, t);
    return t;
  }

  async updateTemplate(id: number, data: Partial<InsertNotificationTemplate>, updatedBy?: string | null): Promise<NotificationTemplate | undefined> {
    const existing = this.templatesMap.get(id);
    if (!existing) return undefined;
    const updated: NotificationTemplate = {
      ...existing,
      ...data,
      // L'autore non si tocca mai: dice chi ha creato il template, non chi
      // l'ha modificato per ultimo. Quello lo dicono le due righe qui sotto.
      createdBy: existing.createdBy,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date(),
    };
    this.templatesMap.set(id, updated);
    return updated;
  }

  async deleteTemplate(id: number): Promise<boolean> {
    return this.templatesMap.delete(id);
  }

  async setDefaultTemplate(id: number, tipoTemplate: string): Promise<void> {
    // Clear existing defaults for tipo template
    for (const [k, t] of this.templatesMap.entries()) {
      if (t.tipoTemplate === tipoTemplate && t.isDefault) {
        this.templatesMap.set(k, { ...t, isDefault: false });
      }
    }
    const target = this.templatesMap.get(id);
    if (target) this.templatesMap.set(id, { ...target, isDefault: true });
  }

  // Notifications
  async getAllNotifications(): Promise<NotificationWithStats[]> {
    return Array.from(this.notificationsMap.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(n => {
        const segment = n.segmentId ? this.segments.get(n.segmentId) : undefined;
        const emailOpenRate = n.emailCount > 0 ? (n.emailOpenCount / n.emailCount) * 100 : 0;
        const smsDeliveryRate = n.smsCount > 0 ? (n.smsDeliveredCount / n.smsCount) * 100 : 0;
        return { ...n, segment, emailOpenRate, smsDeliveryRate };
      });
  }

  async getNotificationById(id: number): Promise<Notification | undefined> {
    return this.notificationsMap.get(id);
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const id = this.notificationIdSeq++;
    const n: Notification = {
      id,
      segmentId: data.segmentId ?? null,
      templateId: data.templateId ?? null,
      tipo: data.tipo ?? "altro",
      classificazione: data.classificazione ?? "ordinaria",
      legame: data.legame ?? null,
      subject: data.subject,
      message: data.message,
      messageSms: data.messageSms ?? null,
      status: data.status ?? "pending",
      scheduledAt: data.scheduledAt ?? null,
      sentAt: null,
      recipientCount: data.recipientCount ?? 0,
      emailCount: data.emailCount ?? 0,
      smsCount: data.smsCount ?? 0,
      emailOpenCount: data.emailOpenCount ?? 0,
      smsDeliveredCount: data.smsDeliveredCount ?? 0,
      createdBy: data.createdBy ?? null,
      createdAt: new Date(),
    };
    this.notificationsMap.set(id, n);
    return n;
  }

  async updateNotificationStatus(id: number, status: string, sentAt?: Date): Promise<void> {
    const existing = this.notificationsMap.get(id);
    if (existing) {
      this.notificationsMap.set(id, { ...existing, status, sentAt: sentAt ?? existing.sentAt });
    }
  }

  async deleteNotification(id: number): Promise<boolean> {
    Array.from(this.recipientsMap.entries())
      .filter(([, r]) => r.notificationId === id)
      .forEach(([k]) => this.recipientsMap.delete(k));
    return this.notificationsMap.delete(id);
  }

  async getPendingScheduledNotifications(): Promise<Notification[]> {
    const now = new Date();
    return Array.from(this.notificationsMap.values())
      .filter(n => n.status === "scheduled" && n.scheduledAt && n.scheduledAt <= now);
  }

  // Storico Notifiche
  async getNotificationHistory(filters: NotificationHistoryFilters): Promise<NotificationHistoryRow[]> {
    return costruisciStorico(
      Array.from(this.notificationsMap.values()),
      Array.from(this.recipientsMap.values()),
      filters,
    );
  }

  async getNotificationHistoryDetail(id: number): Promise<NotificationHistoryDetail | undefined> {
    const n = this.notificationsMap.get(id);
    if (!n) return undefined;
    const recipients = Array.from(this.recipientsMap.values()).filter(r => r.notificationId === id);
    return buildHistoryDetail(n, recipients);
  }

  // Notification Recipients
  async createNotificationRecipient(data: Partial<NotificationRecipient>): Promise<NotificationRecipient> {
    const id = this.recipientIdSeq++;
    const r: NotificationRecipient = {
      id,
      notificationId: data.notificationId!,
      userId: data.userId ?? null,
      keykey: data.keykey ?? null,
      conduttoreDescrizione: data.conduttoreDescrizione ?? null,
      keyroggia: data.keyroggia ?? null,
      roggiaDescrizione: data.roggiaDescrizione ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      canale: data.canale ?? null,
      utenteTest: data.utenteTest ?? false,
      emailStatus: data.emailStatus ?? "pending",
      smsStatus: data.smsStatus ?? "pending",
      emailMessageId: data.emailMessageId ?? null,
      smsSid: data.smsSid ?? null,
      emailOpenedAt: data.emailOpenedAt ?? null,
      smsDeliveredAt: data.smsDeliveredAt ?? null,
      sentAt: data.sentAt ?? null,
    };
    this.recipientsMap.set(id, r);
    return r;
  }

  async getRecipientsByNotificationId(notificationId: number): Promise<NotificationRecipient[]> {
    return Array.from(this.recipientsMap.values()).filter(r => r.notificationId === notificationId);
  }

  async updateRecipientEmailStatus(id: number, status: string, openedAt?: Date): Promise<void> {
    const existing = this.recipientsMap.get(id);
    if (existing) {
      this.recipientsMap.set(id, { ...existing, emailStatus: status, emailOpenedAt: openedAt ?? existing.emailOpenedAt });
    }
  }

  async registraEsitoEmail(id: number, esito: { status: string; messageId?: string | null; sentAt?: Date }): Promise<void> {
    const existing = this.recipientsMap.get(id);
    if (existing) {
      this.recipientsMap.set(id, {
        ...existing,
        emailStatus: esito.status,
        emailMessageId: esito.messageId !== undefined ? esito.messageId : existing.emailMessageId,
        sentAt: esito.sentAt ?? existing.sentAt,
      });
    }
  }

  async updateRecipientSmsStatus(id: number, status: string, deliveredAt?: Date): Promise<void> {
    const existing = this.recipientsMap.get(id);
    if (existing) {
      this.recipientsMap.set(id, { ...existing, smsStatus: status, smsDeliveredAt: deliveredAt ?? existing.smsDeliveredAt });
    }
  }

  async getRecipientByEmailMessageId(messageId: string): Promise<NotificationRecipient | undefined> {
    return Array.from(this.recipientsMap.values()).find(r => r.emailMessageId === messageId);
  }

  // Stats
  async getStats(): Promise<{
    totalSegments: number;
    activeSegments: number;
    maintenanceSegments: number;
    totalConsorziati: number;
    totalParcels: number;
    totalNotifications: number;
    scheduledNotifications: number;
    avgEmailOpenRate: number;
  }> {
    const segs = Array.from(this.segments.values());
    const notifs = Array.from(this.notificationsMap.values());
    const sentNotifs = notifs.filter(n => n.status === "sent" && n.emailCount > 0);
    const avgEmailOpenRate = sentNotifs.length > 0
      ? sentNotifs.reduce((sum, n) => sum + (n.emailCount > 0 ? (n.emailOpenCount / n.emailCount) * 100 : 0), 0) / sentNotifs.length
      : 0;
    return {
      totalSegments: segs.length,
      activeSegments: segs.filter(s => s.status === "active").length,
      maintenanceSegments: segs.filter(s => s.status === "maintenance").length,
      totalConsorziati: this.consorziatiMap.size,
      totalParcels: this.parcels.size,
      totalNotifications: notifs.length,
      scheduledNotifications: notifs.filter(n => n.status === "scheduled").length,
      avgEmailOpenRate,
    };
  }

  // Import Logs
  async getAllImportLogs(): Promise<ImportLog[]> {
    return Array.from(this.importLogsMap.values()).sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime());
  }

  async createImportLog(data: Partial<ImportLog>): Promise<ImportLog> {
    const id = this.importLogIdSeq++;
    const log: ImportLog = {
      id,
      filename: data.filename ?? "",
      totalRows: data.totalRows ?? null,
      importedRows: data.importedRows ?? null,
      skippedRows: data.skippedRows ?? null,
      errorRows: data.errorRows ?? null,
      errors: data.errors ?? null,
      status: data.status ?? "success",
      importedAt: data.importedAt ?? new Date(),
    };
    this.importLogsMap.set(id, log);
    return log;
  }

  // Consortium mirror — conduttori
  async getAllConduttori(): Promise<Conduttore[]> {
    return Array.from(this.conduttoriMap.values());
  }
  async getConduttoreByKey(keykey: string): Promise<Conduttore | undefined> {
    return this.conduttoriMap.get(keykey);
  }
  async replaceConduttori(rows: ConduttoreInsert[]): Promise<number> {
    this.conduttoriMap.clear();
    for (const r of rows) {
      this.conduttoriMap.set(r.keykey, { ...r, syncedAt: new Date() });
    }
    return this.conduttoriMap.size;
  }

  // Registro del consorzio
  async replaceRegistro(r: RegistroConsorzio): Promise<ConteggiRegistro> {
    const adesso = new Date();
    this.madriMap.clear();
    for (const m of r.madri) this.madriMap.set(m.codice, { ...m, syncedAt: adesso });
    this.tratteMap.clear();
    for (const t of r.tratte) this.tratteMap.set(t.keyroggia, { ...t, syncedAt: adesso });
    this.legamiList = r.legami.map((l) => ({ id: this.legamiIdSeq++, ...l, syncedAt: adesso }));
    return { madri: this.madriMap.size, tratte: this.tratteMap.size, legami: this.legamiList.length };
  }
  async getAllMadri(): Promise<Madre[]> {
    // Stesso ordine di PostgreSQLStorage: due implementazioni della stessa
    // interfaccia non devono rispondere in ordine diverso.
    return Array.from(this.madriMap.values())
      .sort((a, b) => a.codice.localeCompare(b.codice));
  }
  async getAllTratte(): Promise<Tratta[]> {
    return Array.from(this.tratteMap.values())
      .sort((a, b) => a.keyroggia.localeCompare(b.keyroggia));
  }
  async getMappaMadri(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    this.tratteMap.forEach((t) => { out[t.keyroggia] = t.codiceMadre; });
    return out;
  }
  async getMappaMadriRogge(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    this.tratteRoggeMap.forEach((t) => { out[t.keyroggia] = t.codiceMadre; });
    return out;
  }

  // Gestione Codici (issue #52)
  async getCodiciSpenti(): Promise<CodiciSpenti> {
    const out: CodiciSpenti = { impianti: [], rogge: [] };
    this.codiciSpentiMap.forEach((g, chiave) => { out[g].push(chiave.slice(g.length + 1)); });
    out.impianti.sort();
    out.rogge.sort();
    return out;
  }
  async impostaCodiceSpento(gerarchia: GerarchiaCodice, codice: string, spento: boolean): Promise<void> {
    const chiave = `${gerarchia}|${codice}`;
    if (spento) this.codiciSpentiMap.set(chiave, gerarchia);
    else this.codiciSpentiMap.delete(chiave);
  }

  // Seconda gerarchia (issue #49)
  async replaceGerarchiaRogge(g: GerarchiaRogge): Promise<ConteggiGerarchiaRogge> {
    const adesso = new Date();
    this.madriRoggeMap.clear();
    for (const m of g.madri) this.madriRoggeMap.set(m.codice, { ...m, syncedAt: adesso });
    this.tratteRoggeMap.clear();
    for (const t of g.tratte) this.tratteRoggeMap.set(t.keyroggia, { ...t, syncedAt: adesso });
    return { madri: this.madriRoggeMap.size, tratte: this.tratteRoggeMap.size };
  }

  async getRoggeMadri(): Promise<RoggiaMadreSelezionabile[]> {
    return Array.from(this.madriRoggeMap.values())
      .sort((a, b) => a.codice.localeCompare(b.codice))
      .map((m) => ({ codicemadre: m.codice, name: m.name }));
  }

  async getTratteDiRoggeMadri(codici: string[]): Promise<TrattaRoggiaSelezionabile[]> {
    if (codici.length === 0) return [];
    return Array.from(this.tratteRoggeMap.values())
      .filter((t) => codici.indexOf(t.codiceMadre) !== -1)
      .sort((a, b) => a.keyroggia.localeCompare(b.keyroggia))
      .map((t) => ({
        keyroggia: t.keyroggia,
        name: t.name,
        codicemadre: t.codiceMadre,
        // L'impianto della stessa tratta, se il registro lo conosce: serve
        // all'ereditarietà dello stato, non alla selezione.
        codicemadreimpianto: this.tratteMap.get(t.keyroggia)?.codiceMadre ?? null,
      }));
  }

  async getNomiGerarchiaRogge(): Promise<NomiGerarchiaRogge> {
    const madri: Record<string, string> = {};
    const tratte: Record<string, string> = {};
    this.madriRoggeMap.forEach((m) => { if (m.name !== "") madri[m.codice] = m.name; });
    this.tratteRoggeMap.forEach((t) => { if (t.name !== "") tratte[t.keyroggia] = t.name; });
    return { madri, tratte };
  }

  /**
   * I conduttori sotto una roggia madre: tutte le sue figlie, prese dalla
   * seconda gerarchia. Stessa forma di `getDestinatariPerMadri`, altra tabella.
   */
  async getDestinatariPerRoggeMadri(codici: string[], legame: TipoLegame): Promise<DestinatarioTratta[]> {
    if (codici.length === 0) return [];
    return this.destinatariDove((k) => {
      const t = this.tratteRoggeMap.get(k);
      return t !== undefined && codici.indexOf(t.codiceMadre) !== -1;
    }, legame);
  }

  // Anagrafiche
  async getRigheRogge(): Promise<RigaRoggia[]> {
    const madri = new Map(Array.from(this.madriMap.values()).map((m) => [m.codice, m]));
    return Array.from(this.tratteMap.values()).map((t) => ({
      codiceMadre: t.codiceMadre,
      descrizioneMadre: madri.get(t.codiceMadre)?.name ?? "",
      codiceFiglia: t.keyroggia,
      descrizioneFiglia: t.name,
    }));
  }

  async getRigheRoggeMadri(): Promise<RigaRoggiaMadre[]> {
    // Ordine, madri senza figlie e figlie senza madre: `componiRigheRoggeMadri`,
    // la stessa di PostgreSQLStorage.
    return componiRigheRoggeMadri(
      Array.from(this.tratteRoggeMap.values()).map((t) => ({
        codiceMadre: t.codiceMadre,
        codiceFiglia: t.keyroggia,
        descrizioneFiglia: t.name,
        // L'impianto della stessa tratta nel registro degli impianti, se
        // esiste: serve all'ereditarietà dello stato (Rilievo 2), stessa
        // fonte di `getTratteDiRoggeMadri` qui sopra.
        codiceMadreImpianto: this.tratteMap.get(t.keyroggia)?.codiceMadre ?? null,
      })),
      Array.from(this.madriRoggeMap.values()),
    );
  }

  async getRigheDestinatari(): Promise<RigaDestinatario[]> {
    return Array.from(this.conduttoriMap.values())
      .filter((c) => c.flagAttivo)
      .map((c) => ({
        codice: c.keykey,
        descrizione: c.descrizione,
        numero: numeroDestinatario(c.cellulare),
        mail: c.email,
      }));
  }

  async getRigheLegami(metodo: string): Promise<RigaLegame[]> {
    // Stesse regole della query di PostgreSQLStorage (mail del consorzio del
    // 24/09/2026): niente riga senza il nome del conduttore, e la roggia
    // sconosciuta si descrive col suo codice.
    const righe: RigaLegame[] = [];
    for (const l of this.legamiList) {
      if (l.metodo !== metodo) continue;
      const nome = this.conduttoriMap.get(l.keykey)?.descrizione ?? "";
      if (nome === "") continue;
      righe.push({
        codiceDestinatario: l.keykey,
        descrizioneDestinatario: nome,
        codiceFiglia: l.keyroggia,
        descrizioneFiglia: this.tratteMap.get(l.keyroggia)?.name
          || this.tratteRoggeMap.get(l.keyroggia)?.name
          || l.keyroggia,
      });
    }
    return righe;
  }

  async createNotificationTargets(notificationId: number, targets: TargetNotifica[]): Promise<number> {
    for (const t of targets) {
      this.notificationTargetsList.push({
        id: this.notificationTargetIdSeq++,
        notificationId,
        codice: t.codice,
        livello: t.livello,
        descrizione: t.descrizione,
      });
    }
    return targets.length;
  }

  async getEventiStato(): Promise<EventoStato[]> {
    const eventi: EventoStato[] = [];
    for (const t of this.notificationTargetsList) {
      const n = this.notificationsMap.get(t.notificationId);
      // Solo apertura e chiusura: "altro" resta in tabella — serve allo Storico —
      // ma non deve arrivare fin qui.
      if (!n || (n.tipo !== "apertura" && n.tipo !== "chiusura")) continue;
      eventi.push({
        id: t.id,
        notificaId: t.notificationId,
        codice: t.codice,
        livello: t.livello,
        // Ternario e non `n.tipo`: `notifications.tipo` è una `string`, e il
        // TypeScript non la restringe all'unione con dei `!==` in guardia.
        tipo: n.tipo === "apertura" ? "apertura" : "chiusura",
        quando: n.createdAt,
        descrizione: t.descrizione,
      });
    }
    return eventi;
  }

  // Invia notifica (issue #14)
  async getMadriSelezionabili(): Promise<MadreSelezionabile[]> {
    return Array.from(this.madriMap.values())
      .sort((a, b) => a.codice.localeCompare(b.codice))
      .map((m) => ({
        codicemadre: m.codice,
        name: m.name,
        // Sia categoria sia origine sono colonne scritte al sync. Il ripiego
        // copre solo una riga scritta a mano nel database.
        categoria: (CATEGORIE_MADRE as readonly string[]).indexOf(m.categoria) !== -1
          ? (m.categoria as CategoriaMadre) : "rogge",
        origine: (ORIGINI_MADRE as readonly string[]).indexOf(m.origine) !== -1
          ? (m.origine as OrigineMadre) : "servizio",
      }));
  }

  async getTratteDiMadri(codicimadre: string[]): Promise<TrattaSelezionabile[]> {
    if (codicimadre.length === 0) return [];
    return Array.from(this.tratteMap.values())
      .filter((t) => codicimadre.indexOf(t.codiceMadre) !== -1)
      .sort((a, b) => a.keyroggia.localeCompare(b.keyroggia))
      .map((t) => ({ keyroggia: t.keyroggia, name: t.name, codicemadre: t.codiceMadre }));
  }

  async getDestinatariPerTratte(keyroggie: string[], legame: TipoLegame): Promise<DestinatarioTratta[]> {
    if (keyroggie.length === 0) return [];
    // Set e non indexOf: `ammette` gira una volta per legame, e con i numeri
    // veri (migliaia di legami per centinaia di tratte) un indexOf lineare
    // costerebbe milioni di confronti.
    const set = new Set(keyroggie);
    return this.destinatariDove((k) => set.has(k), legame);
  }

  /**
   * I conduttori sotto una madre: tutte le sue tratte, prese dal registro.
   *
   * Non è più `substr(keyroggia,1,3)`. Per i codici R la madre è l'impianto,
   * e 9 prefissi su 34 sono spalmati su più impianti — `R08` da solo ne copre
   * 13, che il prefisso fonderebbe in uno.
   *
   * Un legame la cui `keyroggia` non è in `tratteMap` resta fuori. Non è un
   * caso possibile: `sintetizzaServizio` (`shared/madri-servizio.ts`) crea una
   * tratta di servizio per ogni legame che il consorzio non copre. Se
   * quell'invariante saltasse, qui si perderebbe un destinatario in silenzio.
   */
  async getDestinatariPerMadri(codicimadre: string[], legame: TipoLegame): Promise<DestinatarioTratta[]> {
    if (codicimadre.length === 0) return [];
    return this.destinatariDove((k) => {
      const t = this.tratteMap.get(k);
      return t !== undefined && codicimadre.indexOf(t.codiceMadre) !== -1;
    }, legame);
  }

  async conteggiLegami(tratte: string[], madri: string[], roggeMadri: string[] = []): Promise<ConteggiLegami> {
    const out: ConteggiLegami = {
      live: { selezione: 0, mirror: 0 },
      stagione: { selezione: 0, mirror: 0 },
    };
    const nellaSelezione = new Map<string, Set<string>>();
    for (const l of this.legamiList) {
      if (!isTipoLegame(l.metodo)) continue;
      out[l.metodo].mirror += 1;
      // Il conduttore conta una volta sola anche se lo raggiungono più tratte,
      // o se lo raggiungono sia una tratta sia la sua madre (in una gerarchia
      // o nell'altra): è il numero di comunicazioni che partirebbero, non di legami.
      if (!this.rientraNellaSelezione(l.keyroggia, tratte, madri, roggeMadri)) continue;
      const c = this.conduttoriMap.get(l.keykey);
      if (!c || !c.flagAttivo) continue;
      if (!nellaSelezione.has(l.metodo)) nellaSelezione.set(l.metodo, new Set());
      nellaSelezione.get(l.metodo)!.add(l.keykey);
    }
    // `forEach`, non `for...of`: iterare una Map con `for...of` richiede
    // `--downlevelIteration` col target ES5 di questo progetto.
    nellaSelezione.forEach((chiavi, metodo) => {
      if (isTipoLegame(metodo)) out[metodo].selezione = chiavi.size;
    });
    return out;
  }

  /**
   * Una roggia rientra se è fra le tratte spuntate, sotto una madre di
   * impianto scelta, o sotto una roggia madre della seconda gerarchia scelta.
   *
   * Non è più il prefisso: la madre di una tratta è quella scritta nel
   * registro, presa da `tratteMap`, come in `getDestinatariPerMadri`.
   */
  private rientraNellaSelezione(
    keyroggia: string, tratte: string[], madri: string[], roggeMadri: string[],
  ): boolean {
    if (tratte.indexOf(keyroggia) !== -1) return true;
    const t = this.tratteMap.get(keyroggia);
    if (t !== undefined && madri.indexOf(t.codiceMadre) !== -1) return true;
    // Seconda gerarchia: la stessa roggia può essere scelta anche da qui.
    // `destinatariDove`/il `Set` per metodo in `conteggiLegami` garantiscono
    // che un conduttore raggiunto da tutt'e due le strade resti una
    // comunicazione sola.
    const r = this.tratteRoggeMap.get(keyroggia);
    return r !== undefined && roggeMadri.indexOf(r.codiceMadre) !== -1;
  }

  private destinatariDove(
    ammette: (keyroggia: string) => boolean,
    legame: TipoLegame,
  ): DestinatarioTratta[] {
    const viste = new Set<string>();
    const righe: DestinatarioTratta[] = [];
    for (const l of this.legamiList) {
      if (l.metodo !== legame) continue;
      if (!ammette(l.keyroggia)) continue;
      const c = this.conduttoriMap.get(l.keykey);
      if (!c || !c.flagAttivo) continue;
      const chiave = `${l.keykey}|${l.keyroggia}`;
      if (viste.has(chiave)) continue;
      viste.add(chiave);
      righe.push({
        conduttore: {
          keykey: c.keykey,
          descrizione: c.descrizione,
          email: c.email,
          cellulare: numeroDestinatario(c.cellulare),
          tipoEmail: c.tipoEmail,
        },
        keyroggia: l.keyroggia,
        // Il nome si cerca in tutt'e due le gerarchie: una figlia che nessun
        // impianto rivendica ce l'ha solo nella seconda.
        roggiaDescrizione:
          this.tratteMap.get(l.keyroggia)?.name
          ?? this.tratteRoggeMap.get(l.keyroggia)?.name
          ?? null,
      });
    }
    // Stesso ordine di PostgreSQLStorage (`order by descrizione, keyroggia`):
    // due implementazioni della stessa interfaccia non rispondono in ordine diverso.
    return righe.sort((a, b) =>
      a.conduttore.descrizione.localeCompare(b.conduttore.descrizione)
      || a.keyroggia.localeCompare(b.keyroggia));
  }

  // App settings (key/value)
  async getSetting(key: string): Promise<string | undefined> {
    return this.settingsMap.get(key);
  }
  async getAllSettings(): Promise<Record<string, string>> {
    return Object.fromEntries(this.settingsMap.entries());
  }
  async setSetting(key: string, value: string): Promise<void> {
    this.settingsMap.set(key, value);
  }

  // Richieste di accesso
  async registraRichiestaAccesso(username: string): Promise<void> {
    const esistente = this.richiesteAccessoMap.get(username);
    if (esistente) {
      esistente.ultimoTentativo = new Date();
      esistente.tentativi += 1;
      return;
    }
    const adesso = new Date();
    this.richiesteAccessoMap.set(username, {
      id: this.prossimaRichiestaId++,
      username,
      primoTentativo: adesso,
      ultimoTentativo: adesso,
      tentativi: 1,
    });
  }

  async getRichiesteAccesso(): Promise<RichiestaAccesso[]> {
    return Array.from(this.richiesteAccessoMap.values()).sort(
      (a, b) => b.ultimoTentativo.getTime() - a.ultimoTentativo.getTime(),
    );
  }

  async deleteRichiestaAccesso(id: number): Promise<boolean> {
    const trovato = Array.from(this.richiesteAccessoMap.entries()).find(([, riga]) => riga.id === id);
    if (!trovato) return false;
    this.richiesteAccessoMap.delete(trovato[0]);
    return true;
  }

  async deleteRichiestaAccessoPerUsername(username: string): Promise<void> {
    this.richiesteAccessoMap.delete(username);
  }

  // Utenti di test degli invii
  async getUtentiTest(): Promise<UtenteTest[]> {
    return Array.from(this.utentiTestMap.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async getUtentiTestAttivi(): Promise<UtenteTest[]> {
    return (await this.getUtentiTest()).filter((u) => u.attivo);
  }

  async createUtenteTest(data: InsertUtenteTest): Promise<UtenteTest> {
    const u: UtenteTest = {
      id: this.prossimoUtenteTestId++,
      nome: data.nome,
      email: data.email ?? null,
      tipoEmail: data.tipoEmail ?? "normale",
      telefono: data.telefono ?? null,
      attivo: data.attivo ?? true,
      createdBy: data.createdBy ?? null,
      createdAt: new Date(),
    };
    this.utentiTestMap.set(u.id, u);
    return u;
  }

  async updateUtenteTest(id: number, data: Partial<InsertUtenteTest>): Promise<UtenteTest | undefined> {
    const esistente = this.utentiTestMap.get(id);
    if (!esistente) return undefined;
    // Solo i campi mandati: un salvataggio che tocca `attivo` non deve
    // riscrivere il nome con `undefined`.
    const aggiornato: UtenteTest = {
      ...esistente,
      nome: data.nome ?? esistente.nome,
      email: data.email !== undefined ? data.email : esistente.email,
      tipoEmail: data.tipoEmail ?? esistente.tipoEmail,
      telefono: data.telefono !== undefined ? data.telefono : esistente.telefono,
      attivo: data.attivo !== undefined ? data.attivo : esistente.attivo,
    };
    this.utentiTestMap.set(id, aggiornato);
    return aggiornato;
  }

  async deleteUtenteTest(id: number): Promise<boolean> {
    return this.utentiTestMap.delete(id);
  }

  /** Gli id delle notifiche andate ai soli utenti di test. */
  private idNotificheProva(): number[] {
    const perNotifica = new Map<number, { totale: number; test: number }>();
    Array.from(this.recipientsMap.values()).forEach((r) => {
      const c = perNotifica.get(r.notificationId) ?? { totale: 0, test: 0 };
      c.totale += 1;
      if (r.utenteTest) c.test += 1;
      perNotifica.set(r.notificationId, c);
    });
    const ids: number[] = [];
    Array.from(perNotifica.entries()).forEach(([id, c]) => {
      // `totale > 0` esclude le notifiche senza destinatari: non sono prove,
      // sono comunicazioni che non hanno raggiunto nessuno.
      if (c.totale > 0 && c.totale === c.test) ids.push(id);
    });
    return ids;
  }

  async contaNotificheProva(): Promise<number> {
    return this.idNotificheProva().length;
  }

  async eliminaNotificheProva(): Promise<number> {
    const ids = this.idNotificheProva();
    ids.forEach((id) => {
      Array.from(this.recipientsMap.entries())
        .filter(([, r]) => r.notificationId === id)
        .forEach(([k]) => this.recipientsMap.delete(k));
      this.notificationTargetsList = this.notificationTargetsList.filter((t) => t.notificationId !== id);
      this.notificationsMap.delete(id);
    });
    return ids.length;
  }

  // Sync logs
  async createSyncLog(data: { trigger: string }): Promise<SyncLog> {
    const log: SyncLog = {
      id: this.syncLogIdSeq++,
      trigger: data.trigger,
      startedAt: new Date(),
      finishedAt: null,
      status: "running",
      entityCounts: null,
      errors: null,
      skippedEntities: null,
    };
    this.syncLogsMap.set(log.id, log);
    return log;
  }
  async updateSyncLog(id: number, data: { finishedAt?: Date; status?: string; entityCounts?: string; errors?: string; skippedEntities?: string }): Promise<SyncLog | undefined> {
    const existing = this.syncLogsMap.get(id);
    if (!existing) return undefined;
    const updated: SyncLog = {
      ...existing,
      finishedAt: data.finishedAt ?? existing.finishedAt,
      status: data.status ?? existing.status,
      entityCounts: data.entityCounts ?? existing.entityCounts,
      errors: data.errors ?? existing.errors,
      skippedEntities: data.skippedEntities ?? existing.skippedEntities,
    };
    this.syncLogsMap.set(id, updated);
    return updated;
  }
  async getRecentSyncLogs(limit: number): Promise<SyncLog[]> {
    return Array.from(this.syncLogsMap.values())
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
}

// ---- PostgreSQLStorage ----

export class PostgreSQLStorage implements IStorage {
  // Segments
  async getAllSegments(): Promise<NetworkSegment[]> {
    return await db.select().from(networkSegments);
  }

  async getSegmentById(id: number): Promise<NetworkSegment | undefined> {
    const result = await db.select().from(networkSegments).where(eq(networkSegments.id, id));
    return result[0];
  }

  async getSegmentsWithCounts(): Promise<SegmentWithUserCount[]> {
    const segs = await this.getAllSegments();
    const result: SegmentWithUserCount[] = [];
    for (const seg of segs) {
      const mappings = await db.select().from(parcelSegmentMappings).where(eq(parcelSegmentMappings.segmentId, seg.id));
      const parcelIds = mappings.map(m => m.parcelId);
      let userCount = 0;
      if (parcelIds.length > 0) {
        const assignments = await db.select().from(parcelUserAssignments).where(inArray(parcelUserAssignments.parcelId, parcelIds));
        userCount = new Set(assignments.map(a => a.userId)).size;
      }
      result.push({ ...seg, userCount, parcelCount: parcelIds.length });
    }
    return result;
  }

  async createSegment(data: InsertSegment): Promise<NetworkSegment> {
    const result = await db.insert(networkSegments).values(data).returning();
    return result[0];
  }

  async updateSegment(id: number, data: Partial<InsertSegment>): Promise<NetworkSegment | undefined> {
    const result = await db.update(networkSegments).set(data).where(eq(networkSegments.id, id)).returning();
    return result[0];
  }

  async updateSegmentStatus(id: number, status: string): Promise<NetworkSegment | undefined> {
    const result = await db.update(networkSegments).set({ status }).where(eq(networkSegments.id, id)).returning();
    return result[0];
  }

  async deleteSegment(id: number): Promise<boolean> {
    const result = await db.delete(networkSegments).where(eq(networkSegments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Consorziati
  async getAllConsorziati(): Promise<Consorziato[]> {
    return await db.select().from(consorziati);
  }

  async getConsorziatiById(id: number): Promise<Consorziato | undefined> {
    const result = await db.select().from(consorziati).where(eq(consorziati.id, id));
    return result[0];
  }

  async createConsorziato(data: InsertConsorziati): Promise<Consorziato> {
    const result = await db.insert(consorziati).values(data).returning();
    return result[0];
  }

  async updateConsorziato(id: number, data: Partial<InsertConsorziati>): Promise<Consorziato | undefined> {
    const result = await db.update(consorziati).set(data).where(eq(consorziati.id, id)).returning();
    return result[0];
  }

  async deleteConsorziato(id: number): Promise<boolean> {
    const result = await db.delete(consorziati).where(eq(consorziati.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getUsersBySegmentId(segmentId: number): Promise<Consorziato[]> {
    const mappings = await db.select().from(parcelSegmentMappings).where(eq(parcelSegmentMappings.segmentId, segmentId));
    const parcelIds = mappings.map(m => m.parcelId);
    if (parcelIds.length === 0) return [];
    const assignments = await db.select().from(parcelUserAssignments).where(inArray(parcelUserAssignments.parcelId, parcelIds));
    const userIds = [...new Set(assignments.map(a => a.userId))];
    if (userIds.length === 0) return [];
    return await db.select().from(consorziati).where(inArray(consorziati.id, userIds));
  }

  async getSegmentsByUserId(userId: number): Promise<NetworkSegment[]> {
    const assignments = await db.select().from(parcelUserAssignments).where(eq(parcelUserAssignments.userId, userId));
    const parcelIds = assignments.map(a => a.parcelId);
    if (parcelIds.length === 0) return [];
    const mappings = await db.select().from(parcelSegmentMappings).where(inArray(parcelSegmentMappings.parcelId, parcelIds));
    const segmentIds = [...new Set(mappings.map(m => m.segmentId))];
    if (segmentIds.length === 0) return [];
    return await db.select().from(networkSegments).where(inArray(networkSegments.id, segmentIds));
  }

  // Cadastral Parcels
  async getAllParcels(): Promise<CadastralParcel[]> {
    return await db.select().from(cadastralParcels);
  }

  async getParcelById(id: number): Promise<CadastralParcel | undefined> {
    const result = await db.select().from(cadastralParcels).where(eq(cadastralParcels.id, id));
    return result[0];
  }

  async createParcel(data: InsertCadastralParcel): Promise<CadastralParcel> {
    const result = await db.insert(cadastralParcels).values(data).returning();
    return result[0];
  }

  async updateParcel(id: number, data: Partial<InsertCadastralParcel>): Promise<CadastralParcel | undefined> {
    const result = await db.update(cadastralParcels).set(data).where(eq(cadastralParcels.id, id)).returning();
    return result[0];
  }

  async deleteParcel(id: number): Promise<boolean> {
    const result = await db.delete(cadastralParcels).where(eq(cadastralParcels.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getParcelsBySegmentId(segmentId: number): Promise<CadastralParcel[]> {
    const mappings = await db.select().from(parcelSegmentMappings).where(eq(parcelSegmentMappings.segmentId, segmentId));
    const parcelIds = mappings.map(m => m.parcelId);
    if (parcelIds.length === 0) return [];
    return await db.select().from(cadastralParcels).where(inArray(cadastralParcels.id, parcelIds));
  }

  async getParcelsByUserId(userId: number): Promise<CadastralParcel[]> {
    const assignments = await db.select().from(parcelUserAssignments).where(eq(parcelUserAssignments.userId, userId));
    const parcelIds = assignments.map(a => a.parcelId);
    if (parcelIds.length === 0) return [];
    return await db.select().from(cadastralParcels).where(inArray(cadastralParcels.id, parcelIds));
  }

  async getAllParcelsWithCounts(): Promise<import("@shared/schema").CadastralParcelWithDetails[]> {
    const parcels = await db.select().from(cadastralParcels);
    const result: import("@shared/schema").CadastralParcelWithDetails[] = [];
    for (const p of parcels) {
      const userAssignments = await db.select().from(parcelUserAssignments).where(eq(parcelUserAssignments.parcelId, p.id));
      const segmentMappings = await db.select().from(parcelSegmentMappings).where(eq(parcelSegmentMappings.parcelId, p.id));
      result.push({ ...p, userCount: new Set(userAssignments.map(a => a.userId)).size, segmentCount: segmentMappings.length });
    }
    return result;
  }

  async getUsersByParcelId(parcelId: number): Promise<Consorziato[]> {
    const assignments = await db.select().from(parcelUserAssignments).where(eq(parcelUserAssignments.parcelId, parcelId));
    const userIds = [...new Set(assignments.map(a => a.userId))];
    if (userIds.length === 0) return [];
    return await db.select().from(consorziati).where(inArray(consorziati.id, userIds));
  }

  async getSegmentsByParcelId(parcelId: number): Promise<NetworkSegment[]> {
    const mappings = await db.select().from(parcelSegmentMappings).where(eq(parcelSegmentMappings.parcelId, parcelId));
    const segmentIds = [...new Set(mappings.map(m => m.segmentId))];
    if (segmentIds.length === 0) return [];
    return await db.select().from(networkSegments).where(inArray(networkSegments.id, segmentIds));
  }

  // Parcel-Segment mappings
  async addParcelToSegment(data: InsertParcelSegmentMapping): Promise<ParcelSegmentMapping> {
    const result = await db.insert(parcelSegmentMappings).values(data).returning();
    return result[0];
  }

  async removeParcelFromSegment(parcelId: number, segmentId: number): Promise<boolean> {
    const result = await db.delete(parcelSegmentMappings)
      .where(and(eq(parcelSegmentMappings.parcelId, parcelId), eq(parcelSegmentMappings.segmentId, segmentId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getParcelSegmentMappings(segmentId: number): Promise<ParcelSegmentMapping[]> {
    return await db.select().from(parcelSegmentMappings).where(eq(parcelSegmentMappings.segmentId, segmentId));
  }

  // Parcel-User assignments
  async addParcelToUser(data: InsertParcelUserAssignment): Promise<ParcelUserAssignment> {
    const result = await db.insert(parcelUserAssignments).values(data).returning();
    return result[0];
  }

  async removeParcelFromUser(parcelId: number, userId: number): Promise<boolean> {
    const result = await db.delete(parcelUserAssignments)
      .where(and(eq(parcelUserAssignments.parcelId, parcelId), eq(parcelUserAssignments.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getParcelUserAssignments(parcelId: number): Promise<ParcelUserAssignment[]> {
    return await db.select().from(parcelUserAssignments).where(eq(parcelUserAssignments.parcelId, parcelId));
  }

  // Notification Templates
  async getAllTemplates(): Promise<NotificationTemplate[]> {
    return await db.select().from(notificationTemplates);
  }

  async getTemplateById(id: number): Promise<NotificationTemplate | undefined> {
    const result = await db.select().from(notificationTemplates).where(eq(notificationTemplates.id, id));
    return result[0];
  }

  async getDefaultTemplateForTipo(tipoTemplate: string): Promise<NotificationTemplate | undefined> {
    const result = await db.select().from(notificationTemplates)
      .where(and(eq(notificationTemplates.tipoTemplate, tipoTemplate), eq(notificationTemplates.isDefault, true)));
    return result[0];
  }

  async createTemplate(data: InsertNotificationTemplate, createdBy?: string | null): Promise<NotificationTemplate> {
    const result = await db.insert(notificationTemplates)
      .values({ ...data, createdBy: createdBy ?? null })
      .returning();
    return result[0];
  }

  async updateTemplate(id: number, data: Partial<InsertNotificationTemplate>, updatedBy?: string | null): Promise<NotificationTemplate | undefined> {
    // `data` non può contenere createdBy/updatedBy: lo schema Zod li esclude.
    const result = await db.update(notificationTemplates)
      .set({ ...data, updatedBy: updatedBy ?? null, updatedAt: new Date() })
      .where(eq(notificationTemplates.id, id))
      .returning();
    return result[0];
  }

  async deleteTemplate(id: number): Promise<boolean> {
    const result = await db.delete(notificationTemplates).where(eq(notificationTemplates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async setDefaultTemplate(id: number, tipoTemplate: string): Promise<void> {
    await db.update(notificationTemplates)
      .set({ isDefault: false })
      .where(eq(notificationTemplates.tipoTemplate, tipoTemplate));
    await db.update(notificationTemplates)
      .set({ isDefault: true })
      .where(eq(notificationTemplates.id, id));
  }

  // Notifications
  async getAllNotifications(): Promise<NotificationWithStats[]> {
    const notifs = await db.select().from(notifications).orderBy(desc(notifications.createdAt));
    const result: NotificationWithStats[] = [];
    for (const n of notifs) {
      const segment = n.segmentId
        ? (await db.select().from(networkSegments).where(eq(networkSegments.id, n.segmentId)))[0]
        : undefined;
      const emailOpenRate = n.emailCount > 0 ? (n.emailOpenCount / n.emailCount) * 100 : 0;
      const smsDeliveryRate = n.smsCount > 0 ? (n.smsDeliveredCount / n.smsCount) * 100 : 0;
      result.push({ ...n, segment, emailOpenRate, smsDeliveryRate });
    }
    return result;
  }

  async getNotificationById(id: number): Promise<Notification | undefined> {
    const result = await db.select().from(notifications).where(eq(notifications.id, id));
    return result[0];
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(data).returning();
    return result[0];
  }

  async updateNotificationStatus(id: number, status: string, sentAt?: Date): Promise<void> {
    const updateData: Partial<typeof notifications.$inferInsert> = { status };
    if (sentAt) updateData.sentAt = sentAt;
    await db.update(notifications).set(updateData).where(eq(notifications.id, id));
  }

  async deleteNotification(id: number): Promise<boolean> {
    const result = await db.delete(notifications).where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getPendingScheduledNotifications(): Promise<Notification[]> {
    const now = new Date();
    return await db.select().from(notifications)
      .where(and(eq(notifications.status, "scheduled"), lte(notifications.scheduledAt, now)));
  }

  // Storico Notifiche
  // I filtri su notifica (utente, tipo, date) scendono in SQL; quelli che dipendono
  // dai destinatari (roggia, destinatario) si applicano dopo il join, riusando la
  // stessa logica di MemStorage.
  async getNotificationHistory(filters: NotificationHistoryFilters): Promise<NotificationHistoryRow[]> {
    const conds = [];
    if (filters.utente) {
      conds.push(sql`lower(${notifications.createdBy}) like ${"%" + filters.utente.toLowerCase() + "%"}`);
    }
    if (filters.tipo) conds.push(eq(notifications.tipo, filters.tipo));
    if (filters.classificazione) conds.push(eq(notifications.classificazione, filters.classificazione));
    const dataRif = sql`coalesce(${notifications.sentAt}, ${notifications.createdAt})`;
    if (filters.dataInizio) {
      const inizio = new Date(`${filters.dataInizio}T00:00:00`);
      if (!Number.isNaN(inizio.getTime())) conds.push(sql`${dataRif} >= ${inizio}`);
    }
    if (filters.dataFine) {
      const fine = new Date(`${filters.dataFine}T23:59:59.999`);
      if (!Number.isNaN(fine.getTime())) conds.push(sql`${dataRif} <= ${fine}`);
    }

    const notifs = conds.length
      ? await db.select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt))
      : await db.select().from(notifications).orderBy(desc(notifications.createdAt));

    if (notifs.length === 0) return [];

    const recipients = await db.select().from(notificationRecipients)
      .where(inArray(notificationRecipients.notificationId, notifs.map(n => n.id)));

    // I filtri già applicati in SQL sono idempotenti qui: ripassarli non cambia l'esito.
    return costruisciStorico(notifs, recipients, filters);
  }

  async getNotificationHistoryDetail(id: number): Promise<NotificationHistoryDetail | undefined> {
    const n = (await db.select().from(notifications).where(eq(notifications.id, id)))[0];
    if (!n) return undefined;
    const recipients = await db.select().from(notificationRecipients)
      .where(eq(notificationRecipients.notificationId, id));
    return buildHistoryDetail(n, recipients);
  }

  // Notification Recipients
  async createNotificationRecipient(data: Partial<NotificationRecipient>): Promise<NotificationRecipient> {
    const result = await db.insert(notificationRecipients).values(data as any).returning();
    return result[0];
  }

  async getRecipientsByNotificationId(notificationId: number): Promise<NotificationRecipient[]> {
    return await db.select().from(notificationRecipients).where(eq(notificationRecipients.notificationId, notificationId));
  }

  async updateRecipientEmailStatus(id: number, status: string, openedAt?: Date): Promise<void> {
    const updateData: any = { emailStatus: status };
    if (openedAt) updateData.emailOpenedAt = openedAt;
    await db.update(notificationRecipients).set(updateData).where(eq(notificationRecipients.id, id));
  }

  async registraEsitoEmail(id: number, esito: { status: string; messageId?: string | null; sentAt?: Date }): Promise<void> {
    const updateData: any = { emailStatus: esito.status };
    if (esito.messageId !== undefined) updateData.emailMessageId = esito.messageId;
    if (esito.sentAt) updateData.sentAt = esito.sentAt;
    await db.update(notificationRecipients).set(updateData).where(eq(notificationRecipients.id, id));
  }

  async updateRecipientSmsStatus(id: number, status: string, deliveredAt?: Date): Promise<void> {
    const updateData: any = { smsStatus: status };
    if (deliveredAt) updateData.smsDeliveredAt = deliveredAt;
    await db.update(notificationRecipients).set(updateData).where(eq(notificationRecipients.id, id));
  }

  async getRecipientByEmailMessageId(messageId: string): Promise<NotificationRecipient | undefined> {
    const result = await db.select().from(notificationRecipients).where(eq(notificationRecipients.emailMessageId, messageId));
    return result[0];
  }

  // Stats
  async getStats(): Promise<{
    totalSegments: number;
    activeSegments: number;
    maintenanceSegments: number;
    totalConsorziati: number;
    totalParcels: number;
    totalNotifications: number;
    scheduledNotifications: number;
    avgEmailOpenRate: number;
  }> {
    const allSegs = await this.getAllSegments();
    const totalConsorziati = (await db.select().from(consorziati)).length;
    const totalParcels = (await db.select().from(cadastralParcels)).length;
    const allNotifs = await db.select().from(notifications);
    const sentNotifs = allNotifs.filter(n => n.status === "sent" && n.emailCount > 0);
    const avgEmailOpenRate = sentNotifs.length > 0
      ? sentNotifs.reduce((sum, n) => sum + (n.emailCount > 0 ? (n.emailOpenCount / n.emailCount) * 100 : 0), 0) / sentNotifs.length
      : 0;
    return {
      totalSegments: allSegs.length,
      activeSegments: allSegs.filter(s => s.status === "active").length,
      maintenanceSegments: allSegs.filter(s => s.status === "maintenance").length,
      totalConsorziati,
      totalParcels,
      totalNotifications: allNotifs.length,
      scheduledNotifications: allNotifs.filter(n => n.status === "scheduled").length,
      avgEmailOpenRate,
    };
  }

  // Import Logs
  async getAllImportLogs(): Promise<ImportLog[]> {
    return await db.select().from(importLogs).orderBy(desc(importLogs.importedAt));
  }

  async createImportLog(data: Partial<ImportLog>): Promise<ImportLog> {
    const result = await db.insert(importLogs).values(data as any).returning();
    return result[0];
  }

  // Consortium mirror — conduttori
  async getAllConduttori(): Promise<Conduttore[]> {
    return await db.select().from(conduttori);
  }
  async getConduttoreByKey(keykey: string): Promise<Conduttore | undefined> {
    const result = await db.select().from(conduttori).where(eq(conduttori.keykey, keykey));
    return result[0];
  }
  async replaceConduttori(rows: ConduttoreInsert[]): Promise<number> {
    return await db.transaction(async (tx) => {
      await tx.delete(conduttori);
      if (rows.length > 0) await tx.insert(conduttori).values(rows);
      return rows.length;
    });
  }

  // Registro del consorzio
  /**
   * Una transazione sola per le tre tabelle.
   *
   * L'ordine non è estetico: `tratte.codice_madre` ha una FK verso `madri`,
   * quindi si cancella dal basso (legami, tratte, madri) e si inserisce
   * dall'alto. Scrivere le tre entità separatamente lascerebbe una finestra
   * in cui una tratta punta a una madre che non esiste ancora, e la FK
   * rifiuterebbe l'inserimento.
   */
  async replaceRegistro(r: RegistroConsorzio): Promise<ConteggiRegistro> {
    return await db.transaction(async (tx) => {
      await tx.delete(legamiT);
      await tx.delete(tratteT);
      await tx.delete(madriT);
      if (r.madri.length > 0) await tx.insert(madriT).values(r.madri);
      if (r.tratte.length > 0) await tx.insert(tratteT).values(r.tratte);
      if (r.legami.length > 0) await tx.insert(legamiT).values(r.legami);
      return { madri: r.madri.length, tratte: r.tratte.length, legami: r.legami.length };
    });
  }
  async getAllMadri(): Promise<Madre[]> {
    return await db.select().from(madriT).orderBy(madriT.codice);
  }
  async getAllTratte(): Promise<Tratta[]> {
    return await db.select().from(tratteT).orderBy(tratteT.keyroggia);
  }
  async getMappaMadri(): Promise<Record<string, string>> {
    const righe = await db
      .select({ keyroggia: tratteT.keyroggia, codiceMadre: tratteT.codiceMadre })
      .from(tratteT);
    const out: Record<string, string> = {};
    for (const r of righe) out[r.keyroggia] = r.codiceMadre;
    return out;
  }
  async getMappaMadriRogge(): Promise<Record<string, string>> {
    const righe = await db
      .select({ keyroggia: tratteRoggeT.keyroggia, codiceMadre: tratteRoggeT.codiceMadre })
      .from(tratteRoggeT);
    const out: Record<string, string> = {};
    for (const r of righe) out[r.keyroggia] = r.codiceMadre;
    return out;
  }

  // Gestione Codici (issue #52)
  async getCodiciSpenti(): Promise<CodiciSpenti> {
    const righe = await db
      .select({ gerarchia: codiciSpentiT.gerarchia, codice: codiciSpentiT.codice })
      .from(codiciSpentiT)
      .orderBy(codiciSpentiT.codice);
    const out: CodiciSpenti = { impianti: [], rogge: [] };
    // Una gerarchia sconosciuta (scritta a mano nel DB) si ignora: non è un
    // codice che nessuna schermata sappia mostrare o riaccendere.
    for (const r of righe) if (r.gerarchia === "impianti" || r.gerarchia === "rogge") out[r.gerarchia].push(r.codice);
    return out;
  }
  async impostaCodiceSpento(gerarchia: GerarchiaCodice, codice: string, spento: boolean, utente: string | null): Promise<void> {
    if (spento) {
      await db.insert(codiciSpentiT)
        .values({ gerarchia, codice, spentoDa: utente })
        .onConflictDoNothing();
    } else {
      await db.delete(codiciSpentiT)
        .where(and(eq(codiciSpentiT.gerarchia, gerarchia), eq(codiciSpentiT.codice, codice)));
    }
  }

  // Seconda gerarchia (issue #49)
  /**
   * Una transazione per le due tabelle, e l'ordine non è estetico:
   * `tratte_rogge.codice_madre` ha una FK verso `madri_rogge`, quindi si
   * cancella dal basso e si inserisce dall'alto.
   */
  async replaceGerarchiaRogge(g: GerarchiaRogge): Promise<ConteggiGerarchiaRogge> {
    return await db.transaction(async (tx) => {
      await tx.delete(tratteRoggeT);
      await tx.delete(madriRoggeT);
      if (g.madri.length > 0) await tx.insert(madriRoggeT).values(g.madri);
      if (g.tratte.length > 0) await tx.insert(tratteRoggeT).values(g.tratte);
      return { madri: g.madri.length, tratte: g.tratte.length };
    });
  }

  async getRoggeMadri(): Promise<RoggiaMadreSelezionabile[]> {
    const righe = await db
      .select({ codicemadre: madriRoggeT.codice, name: madriRoggeT.name })
      .from(madriRoggeT)
      .orderBy(madriRoggeT.codice);
    return righe;
  }

  async getTratteDiRoggeMadri(codici: string[]): Promise<TrattaRoggiaSelezionabile[]> {
    if (codici.length === 0) return [];
    return await db
      .select({
        keyroggia: tratteRoggeT.keyroggia,
        name: tratteRoggeT.name,
        codicemadre: tratteRoggeT.codiceMadre,
        // LEFT JOIN e non INNER: una figlia che nessun impianto rivendica
        // (i codici con i +) deve comparire lo stesso, con l'impianto a null.
        codicemadreimpianto: tratteT.codiceMadre,
      })
      .from(tratteRoggeT)
      .leftJoin(tratteT, eq(tratteRoggeT.keyroggia, tratteT.keyroggia))
      .where(inArray(tratteRoggeT.codiceMadre, codici))
      .orderBy(tratteRoggeT.keyroggia);
  }

  async getNomiGerarchiaRogge(): Promise<NomiGerarchiaRogge> {
    const m = await db.select({ codice: madriRoggeT.codice, name: madriRoggeT.name }).from(madriRoggeT);
    const t = await db.select({ keyroggia: tratteRoggeT.keyroggia, name: tratteRoggeT.name }).from(tratteRoggeT);
    const madri: Record<string, string> = {};
    const tratte: Record<string, string> = {};
    for (const r of m) if (r.name !== "") madri[r.codice] = r.name;
    for (const r of t) if (r.name !== "") tratte[r.keyroggia] = r.name;
    return { madri, tratte };
  }

  // Anagrafiche
  async getRigheRogge(): Promise<RigaRoggia[]> {
    const righe = await db
      .select({
        codiceMadre: tratteT.codiceMadre,
        descrizioneMadre: madriT.name,
        codiceFiglia: tratteT.keyroggia,
        descrizioneFiglia: tratteT.name,
      })
      .from(tratteT)
      .leftJoin(madriT, eq(tratteT.codiceMadre, madriT.codice));
    return righe.map((r) => ({
      codiceMadre: r.codiceMadre,
      descrizioneMadre: r.descrizioneMadre ?? "",
      codiceFiglia: r.codiceFiglia,
      descrizioneFiglia: r.descrizioneFiglia,
    }));
  }

  async getRigheRoggeMadri(): Promise<RigaRoggiaMadre[]> {
    const figlie = await db
      .select({
        codiceMadre: tratteRoggeT.codiceMadre,
        codiceFiglia: tratteRoggeT.keyroggia,
        descrizioneFiglia: tratteRoggeT.name,
        // LEFT JOIN e non INNER, come in `getTratteDiRoggeMadri`: una figlia
        // che nessun impianto rivendica deve comparire lo stesso, con
        // l'impianto a null (Rilievo 2 — altrimenti questa scheda mente sullo
        // stato di una tratta chiusa solo perché è chiuso il suo impianto).
        codiceMadreImpianto: tratteT.codiceMadre,
      })
      .from(tratteRoggeT)
      .leftJoin(tratteT, eq(tratteRoggeT.keyroggia, tratteT.keyroggia));
    const madri = await db.select({ codice: madriRoggeT.codice, name: madriRoggeT.name }).from(madriRoggeT);
    return componiRigheRoggeMadri(
      figlie.map((f) => ({ ...f, codiceMadreImpianto: f.codiceMadreImpianto ?? null })),
      madri,
    );
  }

  async getRigheDestinatari(): Promise<RigaDestinatario[]> {
    const righe = await db
      .select({
        codice: conduttori.keykey,
        descrizione: conduttori.descrizione,
        numero: conduttori.cellulare,
        mail: conduttori.email,
      })
      .from(conduttori)
      // Il WS marca con flag "*" chi non è più attivo (1709 su 4963 a luglio
      // 2026). Il mirror li conserva — resta una copia fedele — ma l'elenco
      // dei destinatari è la lista di chi può ricevere una notifica, e loro
      // non ne fanno più parte. Il filtro sta qui, in lettura, non nel sync.
      .where(eq(conduttori.flagAttivo, true));
    return righe.map((r) => ({ ...r, numero: numeroDestinatario(r.numero) }));
  }

  async getRigheLegami(metodo: string): Promise<RigaLegame[]> {
    const righe = await db
      .select({
        codiceDestinatario: legamiT.keykey,
        descrizioneDestinatario: conduttori.descrizione,
        codiceFiglia: legamiT.keyroggia,
        // Il nome della roggia si cerca fra le tratte degli impianti, poi
        // nella gerarchia R; se non c'è in nessuna delle due, il codice
        // (mail del consorzio del 24/09/2026 — prima la cella restava vuota).
        descrizioneFiglia: sql<string>`coalesce(nullif(${tratteT.name}, ''), nullif(${tratteRoggeT.name}, ''), ${legamiT.keyroggia})`,
      })
      .from(legamiT)
      // INNER JOIN: un legame verso un conduttore che non è in anagrafica si
      // scarta — il consorzio non vuole un codice senza nome. Sono 2772 dei
      // legami stagione nell'export del 25/09/2026.
      .innerJoin(conduttori, eq(legamiT.keykey, conduttori.keykey))
      .leftJoin(tratteT, eq(legamiT.keyroggia, tratteT.keyroggia))
      .leftJoin(tratteRoggeT, eq(legamiT.keyroggia, tratteRoggeT.keyroggia))
      .where(and(eq(legamiT.metodo, metodo), ne(conduttori.descrizione, "")));
    return righe;
  }

  async createNotificationTargets(notificationId: number, targets: TargetNotifica[]): Promise<number> {
    if (targets.length === 0) return 0;
    await db.insert(notificationTargets).values(
      targets.map((t) => ({
        notificationId,
        codice: t.codice,
        livello: t.livello,
        descrizione: t.descrizione,
      })),
    );
    return targets.length;
  }

  /**
   * Gli eventi che muovono lo stato.
   *
   * Il filtro su `tipo` scende in SQL: "altro" resta in tabella perché serve
   * allo Storico, ma qui sarebbe solo rumore da scartare in memoria.
   */
  async getEventiStato(): Promise<EventoStato[]> {
    const righe = await db
      .select({
        id: notificationTargets.id,
        notificaId: notificationTargets.notificationId,
        codice: notificationTargets.codice,
        livello: notificationTargets.livello,
        descrizione: notificationTargets.descrizione,
        tipo: notifications.tipo,
        quando: notifications.createdAt,
      })
      .from(notificationTargets)
      .innerJoin(notifications, eq(notificationTargets.notificationId, notifications.id))
      .where(inArray(notifications.tipo, ["apertura", "chiusura"]));
    return righe.map((r) => ({
      id: r.id,
      notificaId: r.notificaId,
      codice: r.codice,
      livello: r.livello === "madre" ? "madre" : "tratta",
      tipo: r.tipo === "apertura" ? "apertura" : "chiusura",
      quando: r.quando,
      descrizione: r.descrizione,
    }));
  }

  // Invia notifica: selezione a cascata sul registro del consorzio
  async getMadriSelezionabili(): Promise<MadreSelezionabile[]> {
    const righe = await db.select().from(madriT).orderBy(madriT.codice);
    return righe.map((m) => ({
      codicemadre: m.codice,
      name: m.name,
      // Sia categoria sia origine sono colonne scritte al sync. Il ripiego
      // copre solo una riga scritta a mano nel database.
      categoria: (CATEGORIE_MADRE as readonly string[]).indexOf(m.categoria) !== -1
        ? (m.categoria as CategoriaMadre) : "rogge",
      origine: (ORIGINI_MADRE as readonly string[]).indexOf(m.origine) !== -1
        ? (m.origine as OrigineMadre) : "servizio",
    }));
  }

  async getTratteDiMadri(codicimadre: string[]): Promise<TrattaSelezionabile[]> {
    // Un elenco vuoto non merita un round-trip: drizzle lo renderizza come
    // `where false`.
    if (codicimadre.length === 0) return [];
    return await db
      .select({
        keyroggia: tratteT.keyroggia,
        name: tratteT.name,
        codicemadre: tratteT.codiceMadre,
      })
      .from(tratteT)
      .where(inArray(tratteT.codiceMadre, codicimadre))
      .orderBy(tratteT.keyroggia);
  }

  /**
   * I destinatari delle tratte scelte, **soli attivi**.
   *
   * È la richiesta esplicita del collaudo (issue #14): «non venga mai inviata
   * una notifica a un destinatario con flag non attivo». Il filtro sta qui,
   * dentro la join che l'invio usa per costruire l'elenco, e non nel sync: il
   * mirror resta una copia fedele del consorzio, e i cessati (1709 su 4963)
   * servono ancora a risolvere i legami storici nelle Anagrafiche.
   *
   * Qui passa anche il cellulare: `numeroDestinatario()` toglie lo "0" con cui
   * il WS dice "non ho il numero", così non finisce né in tabella né, quando
   * l'invio sarà cablato, in un SMS vero.
   */
  async getDestinatariPerTratte(keyroggie: string[], legame: TipoLegame): Promise<DestinatarioTratta[]> {
    const dove = this.condizioneTratte(keyroggie);
    return dove === null ? [] : this.destinatariDove(dove, legame);
  }

  /**
   * I conduttori sotto una madre: tutte le sue tratte, prese dal registro.
   *
   * Non è più `substr(keyroggia, 1, 3)`. Per i codici R la madre è l'impianto,
   * e 9 prefissi su 34 sono spalmati su più impianti — `R08` da solo ne copre
   * 13, che il prefisso fonderebbe in uno.
   */
  async getDestinatariPerMadri(codicimadre: string[], legame: TipoLegame): Promise<DestinatarioTratta[]> {
    const dove = this.condizioneMadri(codicimadre);
    return dove === null ? [] : this.destinatariDove(dove, legame);
  }

  /**
   * I destinatari sotto una roggia madre: tutte le sue figlie, prese dalla
   * seconda gerarchia. Stessa forma di `getDestinatariPerMadri`, altra tabella.
   */
  async getDestinatariPerRoggeMadri(codici: string[], legame: TipoLegame): Promise<DestinatarioTratta[]> {
    const dove = this.condizioneRoggeMadri(codici);
    return dove === null ? [] : this.destinatariDove(dove, legame);
  }

  /**
   * Le tratte spuntate, una per una.
   *
   * `separaOmnicomprensive` non serve più: «tutte le tratte della madre» ora si
   * esprime selezionando la madre, che `condizioneMadri` espande dal registro.
   * L'omnicomprensiva `S45D00000` resta una tratta come le altre — nei dati veri
   * non ha nessun legame.
   */
  private condizioneTratte(keyroggie: string[]): SQL | null {
    if (keyroggie.length === 0) return null;
    return inArray(legamiT.keyroggia, keyroggie);
  }

  /**
   * I conduttori sotto una madre: tutte le sue tratte, prese dal registro.
   *
   * Non è più `substr(keyroggia, 1, 3)`. Per i codici R la madre è l'impianto,
   * e 9 prefissi su 34 sono spalmati su più impianti — `R08` da solo ne copre
   * 13, che il prefisso fonderebbe in uno.
   *
   * Un legame la cui `keyroggia` non è in `tratte` resta fuori. Non è un caso
   * possibile: `sintetizzaServizio` (`shared/madri-servizio.ts`) crea una tratta
   * di servizio per ogni legame che il consorzio non copre. Se quell'invariante
   * saltasse, qui si perderebbe un destinatario in silenzio.
   */
  private condizioneMadri(codicimadre: string[]): SQL | null {
    if (codicimadre.length === 0) return null;
    return inArray(
      legamiT.keyroggia,
      db.select({ k: tratteT.keyroggia }).from(tratteT).where(inArray(tratteT.codiceMadre, codicimadre)),
    );
  }

  /** Le figlie di una roggia madre, per la selezione dal quarto bottone. */
  private condizioneRoggeMadri(codici: string[]): SQL | null {
    if (codici.length === 0) return null;
    return inArray(
      legamiT.keyroggia,
      db.select({ k: tratteRoggeT.keyroggia }).from(tratteRoggeT).where(inArray(tratteRoggeT.codiceMadre, codici)),
    );
  }

  async conteggiLegami(tratte: string[], madri: string[], roggeMadri: string[] = []): Promise<ConteggiLegami> {
    const out: ConteggiLegami = {
      live: { selezione: 0, mirror: 0 },
      stagione: { selezione: 0, mirror: 0 },
    };

    const totali = await db
      .select({ metodo: legamiT.metodo, quanti: sql<number>`count(*)::int` })
      .from(legamiT)
      .groupBy(legamiT.metodo);
    for (const r of totali) if (isTipoLegame(r.metodo)) out[r.metodo].mirror = r.quanti;

    const rami = [
      this.condizioneTratte(tratte),
      this.condizioneMadri(madri),
      this.condizioneRoggeMadri(roggeMadri),
    ].filter((c): c is SQL => c !== null);
    if (rami.length > 0) {
      // `count(distinct keykey)`: un conduttore raggiunto da più tratte, o da
      // una tratta e dalla sua madre insieme, resta una comunicazione sola
      // (issue #5).
      const perSelezione = await db
        .select({
          metodo: legamiT.metodo,
          quanti: sql<number>`count(distinct ${legamiT.keykey})::int`,
        })
        .from(legamiT)
        .innerJoin(conduttori, eq(legamiT.keykey, conduttori.keykey))
        .where(and(or(...rami)!, eq(conduttori.flagAttivo, true)))
        .groupBy(legamiT.metodo);
      for (const r of perSelezione) if (isTipoLegame(r.metodo)) out[r.metodo].selezione = r.quanti;
    }

    return out;
  }

  /**
   * Il corpo comune delle due selezioni: cambia solo come si sceglie la roggia.
   * I codici arrivano già canonici (trimmati e maiuscoli), come ovunque nel
   * mirror — vedi `canonico()` in `shared/ws-consorzio.ts`.
   *
   * Il filtro su `metodo` è la issue #27: fino a lì questa query prendeva
   * l'unione dei due legami del consorzio, e chi spediva non sapeva di
   * raggiungere anche l'altro elenco. L'indice `legami_roggia_metodo_idx` è
   * proprio su (keyroggia, metodo).
   */
  private async destinatariDove(rogge: SQL, legame: TipoLegame): Promise<DestinatarioTratta[]> {
    const righe = await db
      .selectDistinct({
        keykey: conduttori.keykey,
        descrizione: conduttori.descrizione,
        email: conduttori.email,
        cellulare: conduttori.cellulare,
        tipoEmail: conduttori.tipoEmail,
        keyroggia: legamiT.keyroggia,
        // leftJoin e non inner: un legame che punta a una tratta non più nel
        // mirror resta un destinatario da avvisare, con la sola descrizione
        // mancante. Il nome si cerca in tutt'e due le gerarchie: una figlia
        // che nessun impianto rivendica ce l'ha solo nella seconda.
        roggiaDescrizione: sql<string | null>`coalesce(${tratteT.name}, ${tratteRoggeT.name})`,
      })
      .from(legamiT)
      .innerJoin(conduttori, eq(legamiT.keykey, conduttori.keykey))
      .leftJoin(tratteT, eq(legamiT.keyroggia, tratteT.keyroggia))
      .leftJoin(tratteRoggeT, eq(legamiT.keyroggia, tratteRoggeT.keyroggia))
      .where(and(rogge, eq(legamiT.metodo, legame), eq(conduttori.flagAttivo, true)))
      .orderBy(conduttori.descrizione, legamiT.keyroggia);
    return righe.map((r) => ({
      conduttore: {
        keykey: r.keykey,
        descrizione: r.descrizione,
        email: r.email,
        cellulare: numeroDestinatario(r.cellulare),
        tipoEmail: r.tipoEmail,
      },
      keyroggia: r.keyroggia,
      roggiaDescrizione: r.roggiaDescrizione,
    }));
  }

  // App settings (key/value)
  async getSetting(key: string): Promise<string | undefined> {
    const result = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return result[0]?.value ?? undefined;
  }
  async getAllSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(appSettings);
    const out: Record<string, string> = {};
    for (const r of rows) if (r.value != null) out[r.key] = r.value;
    return out;
  }
  async setSetting(key: string, value: string): Promise<void> {
    await db.insert(appSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  }

  // Richieste di accesso
  async registraRichiestaAccesso(username: string): Promise<void> {
    // Deduplica per username: la tabella cresce quanto il numero di persone
    // distinte che hanno provato senza essere abilitate, cioe' una manciata.
    await db.insert(richiesteAccesso)
      .values({ username })
      .onConflictDoUpdate({
        target: richiesteAccesso.username,
        set: {
          ultimoTentativo: new Date(),
          tentativi: sql`${richiesteAccesso.tentativi} + 1`,
        },
      });
  }

  async getRichiesteAccesso(): Promise<RichiestaAccesso[]> {
    return db.select().from(richiesteAccesso).orderBy(desc(richiesteAccesso.ultimoTentativo));
  }

  async deleteRichiestaAccesso(id: number): Promise<boolean> {
    const righe = await db.delete(richiesteAccesso)
      .where(eq(richiesteAccesso.id, id))
      .returning();
    return righe.length > 0;
  }

  async deleteRichiestaAccessoPerUsername(username: string): Promise<void> {
    await db.delete(richiesteAccesso).where(eq(richiesteAccesso.username, username));
  }

  // Utenti di test degli invii
  async getUtentiTest(): Promise<UtenteTest[]> {
    return await db.select().from(utentiTest).orderBy(utentiTest.nome);
  }

  async getUtentiTestAttivi(): Promise<UtenteTest[]> {
    return await db.select().from(utentiTest).where(eq(utentiTest.attivo, true)).orderBy(utentiTest.nome);
  }

  async createUtenteTest(data: InsertUtenteTest): Promise<UtenteTest> {
    const righe = await db.insert(utentiTest).values(data).returning();
    return righe[0];
  }

  async updateUtenteTest(id: number, data: Partial<InsertUtenteTest>): Promise<UtenteTest | undefined> {
    const righe = await db.update(utentiTest).set(data).where(eq(utentiTest.id, id)).returning();
    return righe[0];
  }

  async deleteUtenteTest(id: number): Promise<boolean> {
    const righe = await db.delete(utentiTest).where(eq(utentiTest.id, id)).returning();
    return righe.length > 0;
  }

  /**
   * Le notifiche con destinatari, nessuno dei quali un conduttore vero.
   *
   * `HAVING` su due conteggi: quanti destinatari ha, e quanti di quelli sono
   * utenti di test. Uguali e diversi da zero significa «solo prove». Farlo in
   * SQL e non in memoria evita di tirarsi dentro tutti i destinatari di tutto
   * lo storico per contare una manciata di righe.
   */
  private async queryIdNotificheProva(): Promise<number[]> {
    const righe = await db
      .select({
        notificationId: notificationRecipients.notificationId,
        totale: sql<number>`count(*)::int`,
        test: sql<number>`sum(case when ${notificationRecipients.utenteTest} then 1 else 0 end)::int`,
      })
      .from(notificationRecipients)
      .groupBy(notificationRecipients.notificationId);
    return righe.filter((r) => r.totale > 0 && r.totale === r.test).map((r) => r.notificationId);
  }

  async contaNotificheProva(): Promise<number> {
    return (await this.queryIdNotificheProva()).length;
  }

  async eliminaNotificheProva(): Promise<number> {
    const ids = await this.queryIdNotificheProva();
    if (ids.length === 0) return 0;
    // Una transazione sola: destinatari e target hanno onDelete cascade sulla
    // notifica, quindi basta cancellare le notifiche. A meta' strada lo storico
    // resterebbe con notifiche senza destinatari.
    await db.transaction(async (tx) => {
      await tx.delete(notifications).where(inArray(notifications.id, ids));
    });
    return ids.length;
  }

  // Sync logs
  async createSyncLog(data: { trigger: string }): Promise<SyncLog> {
    const result = await db.insert(syncLogs).values({ trigger: data.trigger }).returning();
    return result[0];
  }
  async updateSyncLog(id: number, data: { finishedAt?: Date; status?: string; entityCounts?: string; errors?: string; skippedEntities?: string }): Promise<SyncLog | undefined> {
    const result = await db.update(syncLogs).set(data).where(eq(syncLogs.id, id)).returning();
    return result[0];
  }
  async getRecentSyncLogs(limit: number): Promise<SyncLog[]> {
    return await db.select().from(syncLogs).orderBy(desc(syncLogs.id)).limit(limit);
  }
}

export const storage: IStorage = process.env.DATABASE_URL
  ? new PostgreSQLStorage()
  : new MemStorage();
