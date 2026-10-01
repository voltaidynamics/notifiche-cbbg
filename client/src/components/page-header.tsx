import { Link } from "wouter";
import { User, LogOut, BookOpen, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";
import StatoAnagrafiche from "@/components/stato-anagrafiche";
import { SLUG_IMPOSTAZIONI } from "@shared/permessi-pagina";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Icona a sinistra del titolo (coerenza con le intestazioni preesistenti). */
  icon?: React.ElementType;
  /** Link "indietro" a sinistra di tutto, per le pagine di dettaglio. */
  back?: { href: string; label: string };
  /** Contenuto extra a sinistra dell'area personale (badge, azioni di pagina). */
  children?: React.ReactNode;
}

/**
 * Quale delle due guide aprire.
 *
 * Si guarda il **ruolo**, non le pagine consentite del gruppo: la guida super
 * user descrive Gestione Utenti, che nessun gruppo può concedere, e le schede
 * PEC e Active Directory di Impostazioni. Un Utente a cui fosse stata data la
 * pagina Impostazioni leggerebbe comunque, per tre quarti, istruzioni per
 * operazioni che il server gli rifiuta.
 */
function guidaPer(ruolo: string | undefined): { href: string; titolo: string } {
  return ruolo === "superadmin" || ruolo === "admin"
    ? { href: "/guida-super-user.html", titolo: "Guida super user" }
    : { href: "/guida-utente.html", titolo: "Guida utente" };
}

/** Avatar, nome e ruolo di chi è entrato. */
function IdentitaUtente() {
  const { user } = useAuth();
  return (
    <>
      <span className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
        <User className="text-primary" size={14} />
      </span>
      <span className="hidden sm:block text-left leading-tight">
        <span className="block text-sm font-medium text-gray-900">{user?.username ?? "..."}</span>
        <span className="block text-xs text-gray-500">{ROLE_LABELS[user?.role ?? "user"]}</span>
      </span>
    </>
  );
}

/**
 * L'intestazione di TUTTE le sezioni (issue #13), sul modello dell'app
 * "Vasche di Laminazione": stato delle anagrafiche, Guida, area personale,
 * uscita. È una sola perché l'informazione sulla freschezza dei dati deve
 * essere sempre allo stesso posto: se ogni pagina si disegnasse la propria
 * intestazione, quella riga tornerebbe a esserci solo dove qualcuno si è
 * ricordato di metterla.
 */
export default function PageHeader({ title, subtitle, icon: Icon, back, children }: PageHeaderProps) {
  const { user, logout, canAccess } = useAuth();
  const guida = guidaPer(user?.role);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center min-w-0 gap-2 sm:gap-3">
            {back && (
              <Link
                href={back.href}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 flex-shrink-0"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">{back.label}</span>
              </Link>
            )}
            {Icon && <Icon className="text-gray-700 flex-shrink-0 hidden sm:block" size={24} />}
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">{title}</h2>
              {subtitle && <p className="text-sm sm:text-base text-gray-600 hidden sm:block">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {children}

            {/* Due guide, e il pulsante porta a quella giusta per chi sta
                guardando: un operatore non deve attraversare sei capitoli di
                configurazione per sapere come si spedisce una comunicazione, e
                chi amministra non deve cercare altrove le schede che solo lui
                vede. Le pagine sono generate da docs/ (npm run guide:build). */}
            <a
              href={guida.href}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors flex items-center"
              title={guida.titolo}
            >
              <BookOpen size={16} />
              <span className="hidden sm:inline text-xs ml-1">Guida</span>
            </a>

            {/* Il nome porta alle Impostazioni solo a chi può aprirle (issue #73):
                per gli altri sarebbe un link verso «Accesso non autorizzato». */}
            {canAccess(SLUG_IMPOSTAZIONI) ? (
              <Link
                href="/impostazioni"
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                title="Area personale"
              >
                <IdentitaUtente />
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1">
                <IdentitaUtente />
              </div>
            )}

            <button
              onClick={() => logout()}
              className="p-2 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Esci"
              aria-label="Esci"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Riga a sé, non incastrata accanto all'area personale: le due scritte
            devono restare leggibili anche quando la pagina ha già dei pulsanti
            propri qui sopra. */}
        <StatoAnagrafiche className="mt-2 sm:text-right" />
      </div>
    </header>
  );
}
