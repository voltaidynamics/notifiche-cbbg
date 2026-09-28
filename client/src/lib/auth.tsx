import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { puoAccedere } from "@shared/permessi-pagina";

export type AppRole = "superadmin" | "admin" | "user" | "osservatore";

export type AuthUser = {
  id: number;
  username: string;
  role: AppRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  canAccess: (pageSlug: string) => boolean;
  isAdmin: boolean;
  isReadOnly: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Errore nel recupero utente");
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.message ?? "Credenziali non valide");
        // Il codice distingue un rifiuto da un'informazione: «non sei
        // abilitato» non è un errore di credenziali e non va mostrato in rosso.
        (err as Error & { codice?: string }).codice = data.codice ?? "credenzialiNonValide";
        throw err;
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });

  const canAccess = (pageSlug: string): boolean => {
    if (!user) return false;
    return puoAccedere(user.role, pageSlug);
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    login: async (username, password) => {
      await loginMutation.mutateAsync({ username, password });
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    canAccess,
    isAdmin: user?.role === "superadmin" || user?.role === "admin",
    isReadOnly: user?.role === "osservatore",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro AuthProvider");
  return ctx;
}
