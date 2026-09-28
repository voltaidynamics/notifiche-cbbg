import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Plus, Pencil, Trash2, ArrowUpDown, Search } from "lucide-react";
import { templatesApi } from "@/lib/api";
import { insertNotificationTemplateSchema, type InsertNotificationTemplate, type NotificationTemplate } from "@shared/schema";
import { TIPI_TEMPLATE, ETICHETTE_TIPO, COLORI_TIPO, type TipoTemplate } from "@shared/classificazione";
import {
  filtraTemplate,
  ordinaTemplate,
  utentiDeiTemplate,
  FILTRO_TUTTI,
  UTENTE_NON_INDICATO,
  type ChiaveOrdinamentoTemplate,
} from "@shared/filtro-template";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

// A schermo il campo si chiama "Tipo" e basta: `tipo_template` è il nome della
// colonna, che serve a non confonderla col `tipo` della notifica (issue #18) —
// stessi tre valori, ma qui classificano un template e non muovono nulla.
const etichettaTipo = (t: string) => ETICHETTE_TIPO[t as TipoTemplate] ?? t;

function TipoTemplateBadge({ tipo }: { tipo: string }) {
  return (
    <Badge className={`${COLORI_TIPO[tipo as TipoTemplate] ?? "bg-gray-100 text-gray-600"} hover:opacity-80`}>
      {etichettaTipo(tipo)}
    </Badge>
  );
}

/** Ultima modifica: utente, data e ora in una riga sola, "—" se mai modificato. */
function ultimaModifica(t: NotificationTemplate): string {
  if (!t.updatedAt) return "—";
  const quando = new Date(t.updatedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  return `${t.updatedBy ?? "—"} — ${quando}`;
}

type TemplateFormData = InsertNotificationTemplate;

interface TemplateFormProps {
  defaultValues?: Partial<TemplateFormData>;
  onSubmit: (data: TemplateFormData) => void;
  isPending: boolean;
  onCancel: () => void;
}

function TemplateForm({ defaultValues, onSubmit, isPending, onCancel }: TemplateFormProps) {
  const form = useForm<TemplateFormData>({
    resolver: zodResolver(insertNotificationTemplateSchema),
    defaultValues: {
      name: "",
      tipoTemplate: "chiusura",
      subject: "",
      bodyEmail: "",
      bodySms: "",
      variables: "",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl>
                  <Input placeholder="Es. Avviso Chiusura Estiva" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tipoTemplate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIPI_TEMPLATE.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ETICHETTE_TIPO[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Oggetto Email *</FormLabel>
              <FormControl>
                <Input placeholder="Oggetto dell'email..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bodyEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Corpo Email *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Testo dell'email. Puoi usare variabili come {{nome_tratta}}, {{data}}, ecc."
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bodySms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Testo SMS *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Messaggio SMS (max 160 caratteri consigliati)..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvataggio..." : "Salva Template"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function Templates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>(FILTRO_TUTTI);
  const [filtroUtente, setFiltroUtente] = useState<string>(FILTRO_TUTTI);
  const [chiaveOrd, setChiaveOrd] = useState<ChiaveOrdinamentoTemplate>("id");
  const [ordCrescente, setOrdCrescente] = useState(true);
  const [dettaglio, setDettaglio] = useState<NotificationTemplate | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["/api/templates"],
    queryFn: () => templatesApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertNotificationTemplate) => templatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template creato" });
      setShowCreateModal(false);
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertNotificationTemplate> }) =>
      templatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template aggiornato" });
      setEditingTemplate(null);
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => templatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template eliminato" });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      setDeleteId(null);
    },
  });

  const utenti = useMemo(() => utentiDeiTemplate(templates), [templates]);

  const visibili = useMemo(
    () => ordinaTemplate(
      filtraTemplate(templates, { ricerca, tipo: filtroTipo, utente: filtroUtente }),
      chiaveOrd,
      ordCrescente,
    ),
    [templates, ricerca, filtroTipo, filtroUtente, chiaveOrd, ordCrescente],
  );

  const filtriAttivi = ricerca.trim() !== "" || filtroTipo !== FILTRO_TUTTI || filtroUtente !== FILTRO_TUTTI;

  const ordinaPer = (k: ChiaveOrdinamentoTemplate) => {
    if (chiaveOrd === k) setOrdCrescente((v) => !v);
    else { setChiaveOrd(k); setOrdCrescente(true); }
  };

  const th = (label: string, k: ChiaveOrdinamentoTemplate, extra = "") => (
    <th
      className={`text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 border-b cursor-pointer select-none hover:bg-gray-50 ${extra}`}
      onClick={() => ordinaPer(k)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordinaPer(k); } }}
      aria-sort={chiaveOrd === k ? (ordCrescente ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown size={11} /></span>
    </th>
  );

  const templateToDelete = templates.find((t) => t.id === deleteId);

  return (
    <div className={`flex ${isMobile ? "flex-col" : ""} h-screen bg-gray-50`}>
      <Sidebar />

      <main className={`flex-1 overflow-y-auto ${isMobile ? "pt-16 pb-20" : ""}`}>
        {/* Il pulsante di creazione non sta più qui ma in fondo alla riga dei
            filtri, dove sono i comandi che agiscono sulla lista. */}
        <PageHeader
          title="Template"
          subtitle="Messaggi preimpostati da caricare in Invia notifica"
        />

        <div className={`${isMobile ? "p-4" : "p-6"}`}>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse h-32 bg-white rounded-lg shadow-sm"></div>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16">
              <FileText size={56} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">Nessun template creato.</p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus size={16} className="mr-2" />
                Crea il primo template
              </Button>
            </div>
          ) : (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-center mb-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      className="pl-8 w-56"
                      placeholder="Cerca template..."
                      value={ricerca}
                      onChange={(e) => setRicerca(e.target.value)}
                    />
                  </div>
                  <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTRO_TUTTI}>Tutti i tipi</SelectItem>
                      {TIPI_TEMPLATE.map((t) => (
                        <SelectItem key={t} value={t}>{ETICHETTE_TIPO[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filtroUtente} onValueChange={setFiltroUtente}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FILTRO_TUTTI}>Tutti gli utenti</SelectItem>
                      <SelectItem value={UTENTE_NON_INDICATO}>Non indicato</SelectItem>
                      {utenti.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="ml-auto" onClick={() => setShowCreateModal(true)}>
                    <Plus size={16} className="mr-2" />
                    Nuovo Template
                  </Button>
                </div>

                <div className="border rounded-lg overflow-x-auto max-h-[65vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr>
                        {th("ID", "id", "w-20")}
                        {th("Nome", "name")}
                        {th("Oggetto Mail", "subject")}
                        {th("Messaggio", "bodyEmail")}
                        {th("Utente", "createdBy", "w-36")}
                        {th("Tipo", "tipoTemplate", "w-40")}
                        <th className="text-center text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 border-b w-28">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibili.map((t) => (
                        // Niente role="button": per ARIA il ruolo button ha i figli
                        // presentational, quindi i due bottoni di Azioni (con i loro
                        // aria-label) e le celle sparirebbero dall'albero di accessibilità.
                        // Restano tabIndex e onKeyDown per l'attivazione da tastiera.
                        <tr
                          key={t.id}
                          className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setDettaglio(t)}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setDettaglio(t); }}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">#{t.id}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{t.name}</td>
                          <td className="px-3 py-2 text-gray-600">{t.subject}</td>
                          <td className="px-3 py-2 text-gray-500 max-w-xs truncate" title={t.bodyEmail}>{t.bodyEmail}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {t.createdBy ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2"><TipoTemplateBadge tipo={t.tipoTemplate} /></td>
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingTemplate(t)} aria-label={`Modifica ${t.name}`}>
                                <Pencil size={13} />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteId(t.id)} aria-label={`Elimina ${t.name}`}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {visibili.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                            <p className="mb-3">Nessun template corrisponde ai filtri impostati.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRicerca("");
                                setFiltroTipo(FILTRO_TUTTI);
                                setFiltroUtente(FILTRO_TUTTI);
                              }}
                            >
                              Azzera filtri
                            </Button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  {visibili.length} record{filtriAttivi && ` su ${templates.length}`}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader>
            <DialogTitle>Nuovo Template</DialogTitle>
          </DialogHeader>
          <TemplateForm
            onSubmit={(data) => createMutation.mutate(data)}
            isPending={createMutation.isPending}
            onCancel={() => setShowCreateModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader>
            <DialogTitle>Modifica Template</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <TemplateForm
              defaultValues={editingTemplate}
              onSubmit={(data) => updateMutation.mutate({ id: editingTemplate.id, data })}
              isPending={updateMutation.isPending}
              onCancel={() => setEditingTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dettaglio */}
      <Dialog open={!!dettaglio} onOpenChange={(open) => !open && setDettaglio(null)}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader>
            <DialogTitle>Dettaglio template</DialogTitle>
          </DialogHeader>
          {dettaglio && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">ID</div>#{dettaglio.id}</div>
                <div><div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Nome</div>{dettaglio.name}</div>
                <div><div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Oggetto Mail</div>{dettaglio.subject}</div>
                <div><div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Tipo</div><TipoTemplateBadge tipo={dettaglio.tipoTemplate} /></div>
                <div><div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Utente</div>{dettaglio.createdBy ?? "—"}</div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Data creazione</div>
                  {new Date(dettaglio.createdAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
                </div>
                {/* Sotto Utente e Data creazione, su tutta la riga: chi ha
                    modificato per ultimo e quando, in un campo solo. L'Utente
                    qui sopra resta l'autore e non cambia mai. */}
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Ultima modifica</div>
                  <span className={dettaglio.updatedAt ? "" : "text-gray-300"}>{ultimaModifica(dettaglio)}</span>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Corpo email</div>
                <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-800">{dettaglio.bodyEmail}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">Testo SMS</div>
                <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-800">{dettaglio.bodySms}</div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setDettaglio(null)}>Chiudi</Button>
                <Button onClick={() => { const t = dettaglio; setDettaglio(null); setEditingTemplate(t); }}>
                  <Pencil size={14} className="mr-2" />
                  Modifica
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Template</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il template <strong>{templateToDelete?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
