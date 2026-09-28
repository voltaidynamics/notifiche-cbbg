import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Bell,
  Mail,
  MessageSquare,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  CalendarClock,
  Loader2,
  Calendar,
  Send,
} from "lucide-react";
import { notificationsApi } from "@/lib/api";
import {
  COLORI_TIPO, COLORI_CLASSIFICAZIONE,
  ETICHETTE_TIPO, ETICHETTE_CLASSIFICAZIONE,
  type TipoNotifica, type ClassificazioneNotifica,
} from "@shared/classificazione";
import { COLORI_LEGAME, ETICHETTE_LEGAME, isTipoLegame } from "@shared/legame";
import { useIsMobile } from "@/hooks/use-mobile";

// I badge del tipo e della classificazione sono gli stessi dello Storico, e
// vengono dalla stessa sorgente (issue #12): due copie delle etichette e dei
// colori sarebbero due occasioni di divergere. Qui non c'è più il badge del
// tipo evento, che ammetteva cinque valori: una comunicazione ne ha tre —
// apertura, chiusura, altro — e la colonna `event_type` non esiste più
// (issue #18).
function TipoBadge({ tipo }: { tipo: string }) {
  const colore = COLORI_TIPO[tipo as TipoNotifica] ?? "bg-gray-100 text-gray-600";
  return <Badge className={`${colore} hover:opacity-80`}>{ETICHETTE_TIPO[tipo as TipoNotifica] ?? tipo}</Badge>;
}

function ClassificazioneBadge({ classificazione }: { classificazione: string }) {
  const colore = COLORI_CLASSIFICAZIONE[classificazione as ClassificazioneNotifica] ?? "bg-gray-100 text-gray-600";
  return (
    <Badge className={`${colore} hover:opacity-80`}>
      {ETICHETTE_CLASSIFICAZIONE[classificazione as ClassificazioneNotifica] ?? classificazione}
    </Badge>
  );
}

// Null sulle notifiche partite prima della scelta del legame (issue #27).
function LegameBadge({ legame }: { legame: string | null }) {
  if (legame === null) return <p className="font-medium text-gray-400">—</p>;
  const colore = isTipoLegame(legame) ? COLORI_LEGAME[legame] : "bg-gray-100 text-gray-600";
  return <Badge className={`${colore} hover:opacity-80`}>{isTipoLegame(legame) ? ETICHETTE_LEGAME[legame] : legame}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = { sent: "Inviata", failed: "Fallita", scheduled: "Programmata", sending: "In invio", pending: "In attesa" };
  const variants: Record<string, string> = { sent: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700", scheduled: "bg-blue-100 text-blue-700", sending: "bg-orange-100 text-orange-700", pending: "bg-gray-100 text-gray-600" };
  const icons: Record<string, React.ReactNode> = {
    sent: <CheckCircle size={13} className="text-green-600" />,
    failed: <XCircle size={13} className="text-red-500" />,
    scheduled: <CalendarClock size={13} className="text-blue-500" />,
    sending: <Loader2 size={13} className="text-orange-500 animate-spin" />,
  };
  return (
    <div className="flex items-center gap-1.5">
      {icons[status]}
      <Badge className={`${variants[status] ?? "bg-gray-100 text-gray-600"} hover:opacity-80`}>
        {labels[status] ?? status}
      </Badge>
    </div>
  );
}

function RecipientStatusBadge({ status, type }: { status: string; type: "email" | "sms" }) {
  const emailVariants: Record<string, string> = { pending: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700", failed: "bg-red-100 text-red-700", opened: "bg-green-100 text-green-700" };
  const smsVariants: Record<string, string> = { pending: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700", delivered: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700" };
  const emailLabels: Record<string, string> = { pending: "In attesa", sent: "Inviata", failed: "Fallita", opened: "Aperta" };
  const smsLabels: Record<string, string> = { pending: "In attesa", sent: "Inviato", delivered: "Consegnato", failed: "Fallito" };
  const variants = type === "email" ? emailVariants : smsVariants;
  const labels = type === "email" ? emailLabels : smsLabels;
  return (
    <Badge className={`${variants[status] ?? "bg-gray-100 text-gray-600"} hover:opacity-80 text-xs`}>
      {labels[status] ?? status}
    </Badge>
  );
}

export default function NotificationDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id, 10);
  const isMobile = useIsMobile();

  const { data: notification, isLoading } = useQuery({
    queryKey: ["/api/notifications", id],
    queryFn: () => notificationsApi.getById(id),
    enabled: !isNaN(id),
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["/api/notifications", id, "recipients"],
    queryFn: () => notificationsApi.getRecipients(id),
    enabled: !isNaN(id),
  });

  const formatDateTime = (date: any) => {
    if (!date) return "—";
    return new Date(date).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return (
      <div className={`flex ${isMobile ? "flex-col" : ""} h-screen bg-gray-50`}>
        <Sidebar />
        <main className={`flex-1 overflow-y-auto ${isMobile ? "pt-16 pb-20" : ""}`}>
          <div className="p-6 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse h-32 bg-white rounded-lg shadow-sm"></div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!notification) {
    return (
      <div className={`flex ${isMobile ? "flex-col" : ""} h-screen bg-gray-50`}>
        <Sidebar />
        <main className={`flex-1 overflow-y-auto ${isMobile ? "pt-16 pb-20" : ""}`}>
          <div className="p-6 text-center py-16">
            <Bell size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Notifica non trovata.</p>
            <Link href="/notifiche">
              <Button className="mt-4" variant="outline">
                <ArrowLeft size={16} className="mr-2" />
                Torna alle notifiche
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const emailOpenRate = notification.emailCount > 0 ? (notification.emailOpenCount / notification.emailCount) * 100 : 0;
  const smsDeliveryRate = notification.smsCount > 0 ? (notification.smsDeliveredCount / notification.smsCount) * 100 : 0;
  const hasTracking = notification.emailCount > 0 || notification.smsCount > 0;

  return (
    <div className={`flex ${isMobile ? "flex-col" : ""} h-screen bg-gray-50`}>
      <Sidebar />

      <main className={`flex-1 overflow-y-auto ${isMobile ? "pt-16 pb-20" : ""}`}>
        <PageHeader
          title={notification.subject}
          subtitle={notification.segment?.name}
          back={{ href: "/notifiche", label: "Notifiche" }}
        >
          <span className="hidden md:flex items-center gap-2 mr-2">
            <TipoBadge tipo={notification.tipo} />
            <StatusBadge status={notification.status} />
          </span>
        </PageHeader>

        <div className={`${isMobile ? "p-4" : "p-6"} space-y-6`}>
          <div className="flex flex-wrap gap-2 md:hidden">
            <TipoBadge tipo={notification.tipo} />
            <StatusBadge status={notification.status} />
          </div>

          {/* Riepilogo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Riepilogo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {notification.segment && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tratta</p>
                    <p className="font-medium">{notification.segment.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{notification.segment.code}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Tipo</p>
                  <TipoBadge tipo={notification.tipo} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Classificazione</p>
                  <ClassificazioneBadge classificazione={notification.classificazione} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Legame</p>
                  <LegameBadge legame={notification.legame} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Destinatari</p>
                  <p className="font-medium flex items-center gap-1">
                    <Users size={14} className="text-gray-400" />
                    {notification.recipientCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Creata il</p>
                  <p className="font-medium">{formatDateTime(notification.createdAt)}</p>
                </div>
                {notification.sentAt && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Inviata il</p>
                    <p className="font-medium">{formatDateTime(notification.sentAt)}</p>
                  </div>
                )}
                {notification.scheduledAt && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Programmata per</p>
                    <p className="font-medium flex items-center gap-1">
                      <CalendarClock size={14} className="text-blue-500" />
                      {formatDateTime(notification.scheduledAt)}
                    </p>
                  </div>
                )}
                {notification.createdBy && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Creata da</p>
                    <p className="font-medium">{notification.createdBy}</p>
                  </div>
                )}
              </div>

              {notification.message && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-gray-500 mb-2">Messaggio</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{notification.message}</p>
                </div>
              )}

              {/* Il testo SMS resta null sulle notifiche precedenti e su tutte
                  quelle dei percorsi legacy (issue #28): il blocco compare solo
                  dove c'è davvero. */}
              {notification.messageSms && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-gray-500 mb-2">Testo SMS</p>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{notification.messageSms}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statistiche Consegna */}
          {hasTracking && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Statistiche Consegna</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {notification.emailCount > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Mail size={15} className="text-blue-500" />
                        Email
                      </div>
                      <span className="text-sm text-gray-600">
                        {notification.emailOpenCount} / {notification.emailCount} aperte ({Math.round(emailOpenRate)}%)
                      </span>
                    </div>
                    <Progress value={emailOpenRate} className="h-2" />
                  </div>
                )}
                {notification.smsCount > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquare size={15} className="text-green-500" />
                        SMS
                      </div>
                      <span className="text-sm text-gray-600">
                        {notification.smsDeliveredCount} / {notification.smsCount} consegnati ({Math.round(smsDeliveryRate)}%)
                      </span>
                    </div>
                    <Progress value={smsDeliveryRate} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Destinatari */}
          {recipients.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Destinatari ({recipients.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {recipientsLoading ? (
                  <div className="p-6 space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="animate-pulse h-10 bg-gray-100 rounded"></div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Stato Email</TableHead>
                          <TableHead>Stato SMS</TableHead>
                          <TableHead>Apertura Email</TableHead>
                          <TableHead>Consegna SMS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipients.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {r.firstName} {r.lastName}
                            </TableCell>
                            <TableCell className="text-gray-600 text-sm">{r.email ?? "—"}</TableCell>
                            <TableCell>
                              {r.emailStatus ? <RecipientStatusBadge status={r.emailStatus} type="email" /> : "—"}
                            </TableCell>
                            <TableCell>
                              {r.smsStatus ? <RecipientStatusBadge status={r.smsStatus} type="sms" /> : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {r.emailOpenedAt ? formatDateTime(r.emailOpenedAt) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {r.smsDeliveredAt ? formatDateTime(r.smsDeliveredAt) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
