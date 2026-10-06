import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Settings as SettingsIcon, Mail, MessageSquare, Shield, ShieldCheck, AlertTriangle, Database, RefreshCw, Upload, FlaskConical, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { messaggioErrore } from "@/lib/messaggio-errore";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSyncAnagrafiche } from "@/hooks/use-sync-anagrafiche";
import { settingsApi, utentiTestApi } from "@/lib/api";
import { WS_ENTITIES, ETICHETTE_ENTITA, PERCORSI_WS } from "@shared/wsEntities";
import { analizzaArray, analizzaConteggi, riassumiConteggi } from "@shared/esito-sync";
import { recapitoMancante } from "@shared/utenti-test";
import type { UtenteTest } from "@shared/schema";
import { SchedaAd } from "@/components/settings/scheda-ad";
import { InviaEmailProva } from "@/components/settings/invia-email-prova";
import { BadgeCanale } from "@/components/badge-canale";
import { useAuth } from "@/lib/auth";

// Email settings schema
// I segreti sono facoltativi: il server non li rimanda al client, quindi il campo
// resta vuoto anche quando una password è salvata. Vuoto = "lascia quella che c'è".
const emailSettingsSchema = z.object({
  emailService: z.enum(["gmail", "smtp"]),
  emailUser: z.string().email("Email non valida"),
  emailPassword: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.string().optional(),
  smtpSecure: z.boolean().optional(),
});

// SMS settings schema — Register.it (sfera.net)
const smsSettingsSchema = z.object({
  clientid: z.string().min(1, "Client ID richiesto"),
  // Vuota significa «tieni quella salvata»: l'interfaccia non può rimostrarla.
  password: z.string().optional(),
});

type EmailSettings = z.infer<typeof emailSettingsSchema>;
type SMSSettings = z.infer<typeof smsSettingsSchema>;

/**
 * I campi di un account di posta, condivisi dai due canali (issue #23).
 *
 * La casella ordinaria e la PEC hanno la stessa forma — servizio, indirizzo,
 * password, e i tre campi SMTP — ma credenziali distinte. Un solo blocco di
 * campi per entrambe: due copie divergerebbero alla prima aggiunta, e una
 * differenza fra i due form si scoprirebbe solo il giorno di un invio.
 */
function CampiPosta({
  form,
  servizio,
  passwordImpostata,
}: {
  form: ReturnType<typeof useForm<EmailSettings>>;
  servizio: string;
  passwordImpostata: boolean;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="emailService"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Servizio Email</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="gmail">Gmail</SelectItem>
                <SelectItem value="smtp">SMTP Personalizzato</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="emailUser"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input type="email" placeholder="esempio@gmail.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="emailPassword"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{servizio === "gmail" ? "App Password" : "Password"}</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder={
                  passwordImpostata
                    ? "••••••• (lascia vuoto per non cambiarla)"
                    : servizio === "gmail"
                      ? "App password di Gmail"
                      : "Password email"
                }
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {servizio === "smtp" && (
        <>
          <FormField
            control={form.control}
            name="smtpHost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Server SMTP</FormLabel>
                <FormControl>
                  <Input placeholder="smtp.esempio.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="smtpPort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Porta SMTP</FormLabel>
                <FormControl>
                  <Input placeholder="587" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="smtpSecure"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <FormLabel>Connessione Sicura (TLS)</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
        </>
      )}
    </>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const emailForm = useForm<EmailSettings>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      emailService: "gmail",
      emailUser: "",
      emailPassword: "",
      smtpHost: "",
      smtpPort: "587",
      smtpSecure: true,
    },
  });

  // La PEC parte con SMTP e TLS implicito: i gestori italiani (Aruba, Register,
  // Poste) espongono un server SMTP proprio sulla 465, non un servizio noto a
  // Nodemailer.
  const pecForm = useForm<EmailSettings>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      emailService: "smtp",
      emailUser: "",
      emailPassword: "",
      smtpHost: "",
      smtpPort: "465",
      smtpSecure: true,
    },
  });

  const smsForm = useForm<SMSSettings>({
    resolver: zodResolver(smsSettingsSchema),
    defaultValues: {
      clientid: "",
      password: "",
    },
  });

  const selectedEmailService = emailForm.watch("emailService");
  const selectedPecService = pecForm.watch("emailService");

  // Configurazione salvata sul server: riempie i form con i valori attivi, così
  // la pagina mostra com'è configurato davvero invece di partire sempre vuota.
  const { data: emailSalvata } = useQuery({
    queryKey: ["/api/settings/email"],
    queryFn: () => settingsApi.getEmailSettings(),
  });
  const { data: pecSalvata } = useQuery({
    queryKey: ["/api/settings/email-pec"],
    queryFn: () => settingsApi.getEmailPecSettings(),
  });
  const { data: smsSalvata } = useQuery({
    queryKey: ["/api/settings/sms"],
    queryFn: () => settingsApi.getSmsSettings(),
  });

  useEffect(() => {
    if (!emailSalvata) return;
    emailForm.reset({
      emailService: emailSalvata.emailService === "smtp" ? "smtp" : "gmail",
      emailUser: emailSalvata.emailUser,
      emailPassword: "", // il server non la rimanda: si ridigita solo per cambiarla
      smtpHost: emailSalvata.smtpHost,
      smtpPort: emailSalvata.smtpPort || "587",
      smtpSecure: emailSalvata.smtpSecure,
    });
  }, [emailSalvata]);

  useEffect(() => {
    if (!pecSalvata) return;
    pecForm.reset({
      emailService: pecSalvata.emailService === "gmail" ? "gmail" : "smtp",
      emailUser: pecSalvata.emailUser,
      emailPassword: "", // il server non la rimanda: si ridigita solo per cambiarla
      smtpHost: pecSalvata.smtpHost,
      smtpPort: pecSalvata.smtpPort || "465",
      smtpSecure: pecSalvata.smtpSecure,
    });
  }, [pecSalvata]);

  useEffect(() => {
    if (!smsSalvata) return;
    smsForm.reset({
      clientid: smsSalvata.clientid,
      password: "", // il segreto non torna mai dal server
    });
  }, [smsSalvata]);

  const testEmailMutation = useMutation({
    mutationFn: (data: EmailSettings) => settingsApi.testEmailSettings(data),
    onSuccess: () => {
      toast({ title: "Test Email Riuscito", description: "La configurazione email funziona correttamente." });
    },
    onError: (error: any) => {
      toast({ title: "Errore Test Email", description: error.message || "Impossibile connettersi al server email.", variant: "destructive" });
    },
  });

  const saveEmailMutation = useMutation({
    mutationFn: (data: EmailSettings) => settingsApi.saveEmailSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email"] });
      toast({ title: "Impostazioni Email Salvate", description: "Le configurazioni email sono state aggiornate." });
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message || "Errore nel salvataggio.", variant: "destructive" });
    },
  });

  const testPecMutation = useMutation({
    mutationFn: (data: EmailSettings) => settingsApi.testEmailPecSettings(data),
    onSuccess: () => {
      toast({ title: "Test PEC Riuscito", description: "La configurazione PEC funziona correttamente." });
    },
    onError: (error: any) => {
      toast({ title: "Errore Test PEC", description: error.message || "Impossibile connettersi al server PEC.", variant: "destructive" });
    },
  });

  const savePecMutation = useMutation({
    mutationFn: (data: EmailSettings) => settingsApi.saveEmailPecSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/email-pec"] });
      toast({ title: "Impostazioni PEC Salvate", description: "Le credenziali della PEC sono state aggiornate." });
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message || "Errore nel salvataggio.", variant: "destructive" });
    },
  });

  const testSMSMutation = useMutation({
    mutationFn: (data: SMSSettings) => settingsApi.testSMSSettings(data),
    onSuccess: () => {
      toast({ title: "Test SMS Riuscito", description: "Le credenziali Register.it sono valide." });
    },
    onError: (error: any) => {
      toast({ title: "Errore Test SMS", description: error.message || "Impossibile verificare le credenziali SMS.", variant: "destructive" });
    },
  });

  const saveSMSMutation = useMutation({
    mutationFn: (data: SMSSettings) => settingsApi.saveSMSSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/sms"] });
      toast({ title: "Impostazioni SMS Salvate", description: "Le credenziali SMS sono state aggiornate." });
    },
    onError: (error: any) => {
      toast({ title: "Errore", description: error.message || "Errore nel salvataggio.", variant: "destructive" });
    },
  });

  return (
    <div className={`flex ${isMobile ? "flex-col" : ""} h-screen bg-gray-50`}>
      <Sidebar />

      <main className={`flex-1 overflow-y-auto ${isMobile ? "pt-16 pb-20" : ""}`}>
        <PageHeader title="Impostazioni" subtitle="Configura email, PEC, SMS e sincronizzazione" icon={SettingsIcon} />

        <div className={`${isMobile ? "p-4" : "p-6"}`}>
          <Tabs defaultValue="email" className="w-full">
            {/* Non una griglia a colonne fisse: su un telefono sei celle da
                58px non contengono «Active Directory», e le etichette si
                sovrapponevano (issue #41). La barra va a capo, e `flex-1`
                tiene le schede larghe uguali su una riga sola da desktop. */}
            <TabsList
              className={`flex flex-wrap h-auto w-full gap-1 ${isMobile ? "mb-4" : "mb-6"}`}
            >
              <TabsTrigger value="email" className="flex flex-1 items-center">
                <Mail size={16} className="mr-2" />
                Email
              </TabsTrigger>
              <TabsTrigger value="pec" className="flex flex-1 items-center">
                <ShieldCheck size={16} className="mr-2" />
                PEC
              </TabsTrigger>
              <TabsTrigger value="sms" className="flex flex-1 items-center">
                <MessageSquare size={16} className="mr-2" />
                SMS
              </TabsTrigger>
              <TabsTrigger value="ws" className="flex flex-1 items-center">
                <Database size={16} className="mr-2" />
                WebService
              </TabsTrigger>
              {isSuperadmin && (
                <TabsTrigger value="ad" className="flex flex-1 items-center">
                  <ShieldCheck className="mr-1" size={16} />
                  Active Directory
                </TabsTrigger>
              )}
              {isSuperadmin && (
                <TabsTrigger value="utenti-test" className="flex flex-1 items-center">
                  <FlaskConical className="mr-1" size={16} />
                  Utenti di test
                </TabsTrigger>
              )}
            </TabsList>

            {/* Email Settings */}
            <TabsContent value="email">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Mail className="mr-2" size={20} />
                    Configurazione Email
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...emailForm}>
                    <form
                      onSubmit={emailForm.handleSubmit((data) => saveEmailMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <CampiPosta
                        form={emailForm}
                        servizio={selectedEmailService}
                        passwordImpostata={!!emailSalvata?.passwordImpostata}
                      />

                      {selectedEmailService === "gmail" && (
                        <Alert>
                          <Shield size={16} />
                          <AlertDescription>
                            Per Gmail, devi generare una App Password nelle impostazioni di sicurezza del tuo account Google e utilizzarla qui invece della password normale.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => testEmailMutation.mutate(emailForm.getValues())}
                          disabled={testEmailMutation.isPending}
                          className="flex-1"
                        >
                          {testEmailMutation.isPending ? "Testing..." : "Test Connessione"}
                        </Button>
                        <Button type="submit" disabled={saveEmailMutation.isPending} className="flex-1">
                          {saveEmailMutation.isPending ? "Salvando..." : "Salva Configurazione"}
                        </Button>
                      </div>
                    </form>
                  </Form>

                  <InviaEmailProva
                    canale="normale"
                    configurata={!!emailSalvata?.configurata}
                    modificheNonSalvate={emailForm.formState.isDirty}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* PEC: il secondo account di posta (issue #23). Metà dei conduttori
                attivi ha un indirizzo certificato, e da una casella ordinaria
                quella comunicazione non avrebbe valore legale. */}
            <TabsContent value="pec">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <ShieldCheck className="mr-2" size={20} />
                    Configurazione PEC
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...pecForm}>
                    <form
                      onSubmit={pecForm.handleSubmit((data) => savePecMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <Alert>
                        <Shield size={16} />
                        <AlertDescription>
                          Da qui partono le comunicazioni ai conduttori con indirizzo PEC
                          {pecSalvata && !pecSalvata.configurata && " — finché non è configurata, un invio che li comprende viene rifiutato"}.
                          I gestori italiani usano un server SMTP proprio (per esempio
                          <span className="font-mono"> smtps.pec.aruba.it</span>) sulla porta 465 con TLS.
                        </AlertDescription>
                      </Alert>

                      <CampiPosta
                        form={pecForm}
                        servizio={selectedPecService}
                        passwordImpostata={!!pecSalvata?.passwordImpostata}
                      />

                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => testPecMutation.mutate(pecForm.getValues())}
                          disabled={testPecMutation.isPending}
                          className="flex-1"
                        >
                          {testPecMutation.isPending ? "Testing..." : "Test Connessione"}
                        </Button>
                        <Button type="submit" disabled={savePecMutation.isPending} className="flex-1">
                          {savePecMutation.isPending ? "Salvando..." : "Salva Configurazione"}
                        </Button>
                      </div>
                    </form>
                  </Form>

                  <InviaEmailProva
                    canale="pec"
                    configurata={!!pecSalvata?.configurata}
                    modificheNonSalvate={pecForm.formState.isDirty}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* SMS Settings */}
            <TabsContent value="sms">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MessageSquare className="mr-2" size={20} />
                    Configurazione SMS (Register.it)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Alert className="mb-4">
                    <AlertTriangle size={16} />
                    <AlertDescription>
                      Le credenziali sono quelle del pannello Register.it (sfera.net).
                      La piattaforma accetta solo chiamate dagli indirizzi IP in
                      whitelist: se il test fallisce con credenziali corrette, l'IP
                      di questo server non e' ancora stato abilitato.
                    </AlertDescription>
                  </Alert>

                  <Form {...smsForm}>
                    <form
                      onSubmit={smsForm.handleSubmit((data) => saveSMSMutation.mutate(data))}
                      className="space-y-4"
                    >
                      <FormField
                        control={smsForm.control}
                        name="clientid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client ID</FormLabel>
                            <FormControl>
                              <Input placeholder="Client ID Register.it" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={smsForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder={
                                  smsSalvata?.passwordImpostata
                                    ? "••••••• (lascia vuoto per non cambiarla)"
                                    : "Password Register.it"
                                }
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => testSMSMutation.mutate(smsForm.getValues())}
                          disabled={testSMSMutation.isPending}
                          className="flex-1"
                        >
                          {testSMSMutation.isPending ? "Verifica..." : "Prova credenziali"}
                        </Button>
                        <Button type="submit" disabled={saveSMSMutation.isPending} className="flex-1">
                          {saveSMSMutation.isPending ? "Salvando..." : "Salva Configurazione"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </TabsContent>
            {/* WebService Consorzio */}
            <TabsContent value="ws">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Database className="mr-2" size={20} />
                    WebService Consorzio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SchedaWs />
                </CardContent>
              </Card>
            </TabsContent>

            {/*
              `forceMount` solo su questa scheda, e non sulle altre: Radix
              altrimenti smonta il contenuto a ogni cambio di tab. Questa e'
              l'unica che chiede di incollare un certificato PEM su piu' righe,
              e l'unica che si compila una volta sola, in sede, sotto pressione:
              perdere quel testo per aver dato un'occhiata a un'altra scheda e'
              un costo che le altre non hanno. Restando montata conserva anche
              l'esito di «Prova connessione».

              `data-[state=inactive]:hidden` non è decorativo (issue #53): con
              `forceMount` Radix non mette più `hidden` sul contenuto inattivo,
              che resta visibile sotto qualunque altra scheda — e sembrava
              attaccato a «Utenti di test», la scheda accanto.
            */}
            {isSuperadmin && (
              <TabsContent value="ad" forceMount className="data-[state=inactive]:hidden">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <ShieldCheck className="mr-2" size={20} />
                      Active Directory
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Nascondere il tab è comodità: la difesa vera è
                        requireRole("superadmin") sulle rotte. */}
                    <SchedaAd />
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {isSuperadmin && (
              <TabsContent value="utenti-test">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FlaskConical className="mr-2" size={20} />
                      Utenti di test
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SchedaUtentiTest />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function SchedaWs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sync = useSyncAnagrafiche();
  const { data } = useQuery({ queryKey: ["/api/settings/ws"], queryFn: () => settingsApi.getWs() });
  // Lo stesso caricamento a cui si riferisce la data qui sotto: riuscito o
  // parziale, mai un fallito. Letto con le funzioni condivise con Anagrafiche e
  // con l'email, così le etichette dei conteggi sono le stesse ovunque.
  const ultimoCompletato = sync.ultimoCompletato;
  const erroriUltimoCompletato = analizzaArray(ultimoCompletato?.errors);

  const [auth, setAuth] = useState("");
  const [base, setBase] = useState("");
  const [entita, setEntita] = useState<Record<string, { mode: string; url: string; path: string }>>({});
  const [esiti, setEsiti] = useState<Record<string, string>>({});
  const inizializzato = useRef(false);
  const inputFile = useRef<Record<string, HTMLInputElement | null>>({});
  // Per entità, non un flag unico: le otto entità possono essere caricate una dopo
  // l'altra senza aspettare, e un flag globale riabiliterebbe pulsanti di
  // entità il cui upload è ancora in volo.
  const [caricando, setCaricando] = useState<Record<string, boolean>>({});

  // Popola i campi la prima volta che arrivano i dati dal server, senza
  // sovrascrivere quanto l'utente ha eventualmente già digitato nel frattempo.
  useEffect(() => {
    if (data === undefined || inizializzato.current) return;
    inizializzato.current = true;
    setBase(data.base ?? "");
    const iniziale: Record<string, { mode: string; url: string; path: string }> = {};
    for (const e of WS_ENTITIES) {
      const c = data.entita[e];
      iniziale[e] = { mode: c?.mode ?? "http", url: c?.url ?? "", path: c?.path ?? "" };
    }
    setEntita(iniziale);
  }, [data]);

  const salva = useMutation({
    mutationFn: () => settingsApi.saveWs({ auth: auth || undefined, base, entita }),
    onSuccess: () => {
      setAuth("");
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ws"] });
      toast({ title: "Configurazione salvata" });
    },
    onError: (e: Error) => toast({ title: "Salvataggio fallito", description: e.message, variant: "destructive" }),
  });

  const prova = async (e: string) => {
    setEsiti((s) => ({ ...s, [e]: "Prova in corso…" }));
    try {
      const esito = await settingsApi.testWs(e);
      setEsiti((s) => ({
        ...s,
        [e]: esito.ok ? `${esito.righe} record letti` : `Errore: ${esito.errore}`,
      }));
    } catch (err) {
      // apiRequest solleva su qualunque risposta non 2xx (entità non valida,
      // utente non amministratore, rete caduta): senza questo catch il testo
      // resta bloccato su "Prova in corso…" e si genera un rifiuto non gestito.
      setEsiti((s) => ({ ...s, [e]: `Errore: ${messaggioErrore(err)}` }));
    }
  };

  const carica = async (e: string, file: File) => {
    setCaricando((s) => ({ ...s, [e]: true }));
    setEsiti((s) => ({ ...s, [e]: "Caricamento in corso…" }));
    try {
      const esito = await settingsApi.uploadWs(e, file);
      if (!esito.ok) {
        setEsiti((s) => ({ ...s, [e]: `Errore: ${esito.errore}` }));
        return;
      }
      // Il form tiene una copia locale della configurazione e "Salva
      // configurazione" la rispedisce per intero: senza questo aggiornamento un
      // salvataggio successivo riscriverebbe il percorso vecchio, disattivando
      // in silenzio il file appena caricato. Invalidare la query non basta,
      // perché `inizializzato` blocca il ripopolamento del form.
      setEntita((s) => ({ ...s, [e]: { ...s[e], mode: "file", path: esito.percorso ?? "" } }));
      setEsiti((s) => ({
        ...s,
        [e]: [`${esito.righe} righe caricate`, ...(esito.avvisi ?? [])].join(" · "),
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ws"] });
    } catch (err) {
      setEsiti((s) => ({ ...s, [e]: `Errore: ${messaggioErrore(err)}` }));
    } finally {
      setCaricando((s) => ({ ...s, [e]: false }));
    }
  };

  const aggiorna = (e: string, campo: "mode" | "url" | "path", v: string) =>
    setEntita((s) => ({ ...s, [e]: { ...s[e], [campo]: v } }));

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium">Stringa di autenticazione</label>
        <Input
          type="password"
          value={auth}
          onChange={(ev) => setAuth(ev.target.value)}
          placeholder={data?.authImpostata ? "••••••  (lascia vuoto per non modificarla)" : "Non impostata"}
          className="mt-1"
        />
        <p className="text-xs text-gray-500 mt-1">
          Inviata come intestazione Authorization a tutti gli endpoint. Per sicurezza non viene mai rimandata al browser.
        </p>
      </div>

      <div className="border rounded-lg p-3 mb-3">
        <div className="text-sm font-semibold mb-1">URL base del web service</div>
        <div className="text-xs text-muted-foreground mb-2">
          Le entità senza URL propria la ricavano da qui. Es. <code>http://192.168.0.100</code>
        </div>
        <Input placeholder="http://..." value={base} onChange={(ev) => setBase(ev.target.value)} />
      </div>

      <div className="space-y-3">
        {WS_ENTITIES.map((e) => {
          const c = entita[e] ?? { mode: "http", url: "", path: "" };
          return (
            <div key={e} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{ETICHETTE_ENTITA[e]}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => prova(e)}>Prova</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Select value={c.mode} onValueChange={(v) => aggiorna(e, "mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="file">File JSON</SelectItem>
                  </SelectContent>
                </Select>
                {c.mode === "http" ? (
                  <Input className="sm:col-span-2"
                    placeholder={base ? base.replace(/\/+$/, "") + PERCORSI_WS[e] : "http://..."}
                    value={c.url}
                    onChange={(ev) => aggiorna(e, "url", ev.target.value)} />
                ) : (
                  <div className="sm:col-span-2 flex gap-2">
                    <Input placeholder="/percorso/file.json" value={c.path}
                      onChange={(ev) => aggiorna(e, "path", ev.target.value)} />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={caricando[e]}
                      onClick={() => inputFile.current[e]?.click()}
                    >
                      <Upload size={16} className="mr-2" />
                      {caricando[e] ? "Carico…" : "Carica file"}
                    </Button>
                    <input
                      ref={(el) => { inputFile.current[e] = el; }}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        // Azzerare il value permette di ricaricare due volte di
                        // fila lo stesso file: senza, il secondo change non
                        // scatta perché il valore non cambia.
                        ev.target.value = "";
                        if (f) carica(e, f);
                      }}
                    />
                  </div>
                )}
              </div>
              {esiti[e] && <p className="text-xs mt-2 text-gray-600">{esiti[e]}</p>}
            </div>
          );
        })}
      </div>

      {/* Il caricamento a mano vive qui da quando Invia notifica e Anagrafiche
          hanno perso i loro pulsanti (issue #13): non è un'azione quotidiana —
          il cron notturno delle 03:00 fa il grosso — ma serve dopo aver toccato
          questa configurazione, ed è l'unico modo di provarla per davvero. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-xs text-gray-500 space-y-1">
          <div>
            Ultimo caricamento riuscito: <span className="font-semibold">{sync.freschezza.quando}</span>
            {sync.inCorso && <span className="text-amber-700 font-semibold"> · caricamento in corso…</span>}
          </div>
          {/* Righe scartate e righe sintetizzate davanti agli occhi di chi
              configura, non dentro un log: è un requisito della spec del modello
              a impianti. Anagrafiche li mostra solo a caricamento parziale, qui
              stanno sempre. Se il caricamento è parziale seguono i motivi,
              altrimenti un registro non scritto si leggerebbe solo nell'email. */}
          {ultimoCompletato && (
            <div data-testid="conteggi-ultimo-caricamento">
              {riassumiConteggi(analizzaConteggi(ultimoCompletato.entityCounts)) || "Nessun conteggio registrato"}
            </div>
          )}
          {ultimoCompletato?.status === "partial" && erroriUltimoCompletato.length > 0 && (
            <ul className="text-amber-700 space-y-0.5">
              {erroriUltimoCompletato.map((e) => (
                <li key={e} className="flex items-start gap-1">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{e}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={sync.avvia}
            disabled={sync.inCorso || sync.avvioInCorso}
          >
            <RefreshCw size={16} className={`mr-2 ${sync.inCorso ? "animate-spin" : ""}`} />
            Aggiorna ora
          </Button>
          <Button onClick={() => salva.mutate()} disabled={salva.isPending}>Salva configurazione</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * I destinatari di prova degli invii (issue #36).
 *
 * Solo superadmin, come Active Directory: chi aggiunge un utente qui decide che
 * a *ogni* comunicazione del consorzio parta una copia verso un indirizzo
 * scelto da lui. Nascondere la scheda e' comodita' — la difesa vera e'
 * requireRole("superadmin") sulle rotte.
 */
function SchedaUtentiTest() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const vuoto = { nome: "", email: "", tipoEmail: "normale", telefono: "", attivo: true };
  const [bozza, setBozza] = useState<typeof vuoto & { id?: number }>(vuoto);
  // Creazione e modifica in un popup, come in Gestione Utenti (issue #104).
  const [dialogAperto, setDialogAperto] = useState(false);
  const apri = (u?: UtenteTest) => {
    setBozza(u ? {
      id: u.id, nome: u.nome, email: u.email ?? "", tipoEmail: u.tipoEmail,
      telefono: u.telefono ?? "", attivo: u.attivo,
    } : vuoto);
    setDialogAperto(true);
  };
  // Le due conferme distruttive di questa scheda, con AlertDialog come nel
  // resto dell'app (admin.tsx): window.confirm non è la convenzione qui.
  const [daEliminare, setDaEliminare] = useState<UtenteTest | null>(null);
  const [confermaPulizia, setConfermaPulizia] = useState(false);

  const { data: utenti = [] } = useQuery({
    queryKey: ["/api/utenti-test"],
    queryFn: () => utentiTestApi.elenco(),
  });
  const { data: prove } = useQuery({
    queryKey: ["/api/notifiche-prova"],
    queryFn: () => utentiTestApi.contaProve(),
  });

  const aggiorna = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/utenti-test"] });
    queryClient.invalidateQueries({ queryKey: ["/api/utenti-test/attivi"] });
  };

  const salva = useMutation({
    mutationFn: () => {
      const dati = {
        nome: bozza.nome,
        email: bozza.email.trim() || null,
        tipoEmail: bozza.tipoEmail,
        telefono: bozza.telefono.trim() || null,
        attivo: bozza.attivo,
      };
      return bozza.id ? utentiTestApi.aggiorna(bozza.id, dati) : utentiTestApi.crea(dati);
    },
    onSuccess: () => {
      aggiorna();
      setDialogAperto(false);
      toast({ title: bozza.id ? "Utente di test aggiornato" : "Utente di test creato" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const elimina = useMutation({
    mutationFn: (id: number) => utentiTestApi.elimina(id),
    onSuccess: () => { aggiorna(); toast({ title: "Utente di test eliminato" }); },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const commuta = useMutation({
    mutationFn: (u: UtenteTest) =>
      utentiTestApi.aggiorna(u.id, {
        nome: u.nome, email: u.email, tipoEmail: u.tipoEmail,
        telefono: u.telefono, attivo: !u.attivo,
      }),
    onSuccess: aggiorna,
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const pulisci = useMutation({
    mutationFn: () => utentiTestApi.eliminaProve(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifiche-prova"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/storico"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      // Cancellare i target riapre le rogge che una prova aveva chiuso.
      queryClient.invalidateQueries({ queryKey: ["/api/consorzio/stato-rogge"] });
      toast({ title: `${r.eliminate} comunicazioni di prova eliminate` });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const recapitoAssente = recapitoMancante({ email: bozza.email, telefono: bozza.telefono });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => apri()}>
          <Plus size={15} className="mr-1" /> Nuovo utente di test
        </Button>
      </div>

      <Alert>
        <AlertTriangle size={16} />
        <AlertDescription>
          Un utente attivo riceve <strong>ogni</strong> comunicazione inviata, qualunque
          roggia. L'operatore può togliere la spunta a tutti i conduttori: in quel
          caso la comunicazione parte ai soli utenti di test.
        </AlertDescription>
      </Alert>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Nome", "Email", "Canale", "Telefono", "Attivo", ""].map((h) => (
                <th key={h} className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 border-b">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {utenti.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2">{u.nome}</td>
                <td className="px-3 py-2">{u.email ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2"><BadgeCanale canale={u.tipoEmail === "pec" ? "pec" : "normale"} /></td>
                <td className="px-3 py-2">{u.telefono ?? <span className="text-gray-400">—</span>}</td>
                <td className="px-3 py-2">
                  <Switch checked={u.attivo} onCheckedChange={() => commuta.mutate(u)} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" aria-label="Modifica" onClick={() => apri(u)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Elimina" className="text-red-500 hover:text-red-700" onClick={() => setDaEliminare(u)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {utenti.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                Nessun utente di test censito
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-medium text-sm">Comunicazioni di prova</div>
        <p className="text-xs text-gray-600">
          Una comunicazione è «di prova» se è andata ai soli utenti di test. Eliminarle
          ripulisce lo Storico e riapre le rogge che avevano chiuso. Una comunicazione
          con anche un solo conduttore vero non viene toccata.
        </p>
        <Button
          variant="destructive"
          disabled={!prove?.quante || pulisci.isPending}
          onClick={() => setConfermaPulizia(true)}
        >
          Elimina le comunicazioni di prova ({prove?.quante ?? 0})
        </Button>
      </div>

      <Dialog open={dialogAperto} onOpenChange={setDialogAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bozza.id ? "Modifica utente di test" : "Nuovo utente di test"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={bozza.nome} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={bozza.email} onChange={(e) => setBozza({ ...bozza, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Canale</Label>
              <Select value={bozza.tipoEmail} onValueChange={(v) => setBozza({ ...bozza, tipoEmail: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normale">Email ordinaria</SelectItem>
                  <SelectItem value="pec">PEC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Telefono</Label>
              <Input value={bozza.telefono} onChange={(e) => setBozza({ ...bozza, telefono: e.target.value })} />
            </div>
            {/* Senza recapiti non riceverebbe niente: e' una riga che promette un
                collaudo che non avviene. */}
            {recapitoAssente && (
              <div className="text-xs text-amber-700">Serve almeno un recapito: email o telefono.</div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={bozza.attivo} onCheckedChange={(v) => setBozza({ ...bozza, attivo: v })} />
              <Label>Riceve le comunicazioni</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAperto(false)}>Annulla</Button>
            <Button onClick={() => salva.mutate()} disabled={!bozza.nome.trim() || recapitoAssente || salva.isPending}>
              {salva.isPending ? "Salvo..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={() => setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina utente di test</AlertDialogTitle>
            <AlertDialogDescription>
              Eliminare l'utente di test "{daEliminare?.nome}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); setDaEliminare(null); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confermaPulizia} onOpenChange={() => setConfermaPulizia(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina comunicazioni di prova</AlertDialogTitle>
            <AlertDialogDescription>
              Eliminare {prove?.quante} comunicazioni di prova? L'operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { pulisci.mutate(); setConfermaPulizia(false); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
