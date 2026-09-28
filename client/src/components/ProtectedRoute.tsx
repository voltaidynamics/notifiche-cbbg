import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Props = {
  // Un array significa "basta uno di questi slug" (es. la sezione Anagrafiche,
  // che raggruppa più sottosezioni sotto un'unica voce di menù).
  pageSlug: string | string[];
  children: React.ReactNode;
};

export default function ProtectedRoute({ pageSlug, children }: Props) {
  const { user, isLoading, canAccess } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const allowed = Array.isArray(pageSlug)
    ? pageSlug.some((slug) => canAccess(slug))
    : canAccess(pageSlug);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (!allowed) {
      toast({ title: "Accesso non autorizzato", variant: "destructive" });
      setLocation("/");
    }
  }, [isLoading, user, allowed, setLocation, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user || !allowed) return null;

  return <>{children}</>;
}
