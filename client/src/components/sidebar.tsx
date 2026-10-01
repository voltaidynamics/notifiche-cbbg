import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";
import {
  Users, Bell, FileText,
  Settings, Menu, X, Waves, Shield, LogOut,
  Home, Send, ToggleRight,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ROLE_COLORS, ROLE_LABELS } from "@/lib/roles";

// Struttura di menù richiesta dalla issue #12: due gruppi, "tutte e sole" queste voci.
// `slugs` = la voce compare se l'utente può accedere ad almeno uno di questi slug.
// `matches` = prefissi di rotta aggiuntivi che tengono la voce evidenziata (deep-link).
type NavLink = {
  name: string;
  href: string;
  icon: React.ElementType;
  slugs: string[];
  matches?: string[];
};
type NavGroup = { label: string; items: NavLink[] };

const navigation: NavGroup[] = [
  {
    label: "Moduli principali",
    items: [
      { name: "Dashboard", href: "/", icon: Home, slugs: ["dashboard"] },
      { name: "Invia Notifica", href: "/invia-notifica", icon: Send, slugs: ["invia-notifica"] },
      { name: "Storico Notifiche", href: "/notifiche", icon: Bell, slugs: ["notifiche"] },
      { name: "Anagrafiche", href: "/anagrafiche", icon: Users, slugs: ["anagrafiche"] },
      { name: "Template", href: "/template", icon: FileText, slugs: ["template"] },
    ],
  },
  {
    label: "Strumenti",
    items: [
      { name: "Gestione Utenti", href: "/admin", icon: Shield, slugs: ["admin"] },
      { name: "Gestione Codici", href: "/gestione-codici", icon: ToggleRight, slugs: ["gestione-codici"] },
      { name: "Impostazioni", href: "/impostazioni", icon: Settings, slugs: ["impostazioni"] },
    ],
  },
];

/**
 * Il logo in alto a sinistra riporta alla dashboard (issue #17). Per chi non ha
 * accesso alla dashboard resta un titolo non cliccabile: mandarlo su "/" lo
 * farebbe rimbalzare da ProtectedRoute con un "Accesso non autorizzato".
 */
function Logo({ dimensione }: { dimensione: string }) {
  const { canAccess } = useAuth();
  const contenuto = (
    <>
      <Waves className="text-primary mr-2" size={24} />
      Consorzio Irriguo
    </>
  );

  return (
    <h1 className={cn("font-bold text-gray-800", dimensione)}>
      {canAccess("dashboard") ? (
        <Link
          href="/"
          className="flex items-center hover:text-primary transition-colors"
          title="Torna alla dashboard"
        >
          {contenuto}
        </Link>
      ) : (
        <span className="flex items-center">{contenuto}</span>
      )}
    </h1>
  );
}

export default function Sidebar() {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const { user, canAccess, logout } = useAuth();

  const isActive = (item: NavLink) => {
    if (item.href === "/") return location === "/";
    if (location.startsWith(item.href)) return true;
    return (item.matches ?? []).some((m) => location.startsWith(m));
  };

  const visibleNavItems = (items: NavLink[]) =>
    items.filter((item) => item.slugs.some((slug) => canAccess(slug)));

  const UserFooter = () => (
    <div className="border-t border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{user?.username}</p>
          <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium", ROLE_COLORS[user?.role ?? "user"])}>
            {ROLE_LABELS[user?.role ?? "user"]}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          className="ml-2 text-gray-500 hover:text-red-600 flex-shrink-0"
          title="Esci"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    // Stesse voci del desktop, appiattite e con etichette corte per la bottom-bar.
    const allVisibleLinks = visibleNavItems(navigation.flatMap((g) => g.items)).map((item) => ({
      ...item,
      name: item.name === "Invia Notifica" ? "Invia" : item.name === "Storico Notifiche" ? "Storico" : item.name,
    }));

    return (
      <>
        <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <Logo dimensione="text-lg" />
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(!isOpen)} className="p-2">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </Button>
        </header>

        {isOpen && (
          <div className="fixed inset-0 z-40 bg-black bg-opacity-50" onClick={() => setIsOpen(false)}>
            <div className="fixed top-16 right-0 w-64 h-full bg-white shadow-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
              <nav className="p-4 flex-1 overflow-y-auto">
                {allVisibleLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.name} href={item.href}
                      className={cn("flex items-center px-4 py-3 rounded-lg font-medium transition-colors mb-2",
                        isActive(item) ? "text-primary bg-green-50" : "text-gray-700 hover:bg-gray-50")}
                      onClick={() => setIsOpen(false)}>
                      <Icon className="mr-3" size={20} />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              <UserFooter />
            </div>
          </div>
        )}

        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 px-2 py-2">
          <div className="flex justify-around">
            {allVisibleLinks.slice(0, 5).map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.name} href={item.href}
                  className={cn("flex flex-col items-center py-2 px-3 rounded-lg transition-colors min-w-0 flex-1",
                    isActive(item) ? "text-primary bg-green-50" : "text-gray-600 hover:text-gray-800 hover:bg-gray-50")}>
                  <Icon size={20} className="mb-1" />
                  <span className="text-xs font-medium truncate">{item.name}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </>
    );
  }

  return (
    <aside className="w-64 bg-white shadow-lg h-screen flex-shrink-0 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <Logo dimensione="text-xl" />
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto">
        {navigation.map((group) => {
          const visible = visibleNavItems(group.items);
          if (visible.length === 0) return null;
          return (
            <div key={group.label} className="px-6 py-1 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-1">
                {group.label}
              </p>
              {visible.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link key={item.name} href={item.href}
                    className={cn("flex items-center px-4 py-2 rounded-lg font-medium transition-colors mt-1",
                      active ? "text-primary bg-green-50" : "text-gray-700 hover:bg-gray-50")}>
                    <Icon className="mr-3" size={18} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <UserFooter />
    </aside>
  );
}
