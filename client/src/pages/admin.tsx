import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { adminUsersApi, type SafeAppUser } from "@/lib/api";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Shield, Users } from "lucide-react";
import { RichiesteAccesso } from "@/components/admin/richieste-accesso";
import { RequisitiPassword } from "@/components/admin/requisiti-password";
import { requisitiMancanti } from "@shared/password";

const ROLE_OPTIONS = [
  { value: "osservatore", label: "Osservatore" },
  { value: "user", label: "Utente" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Super Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-100 text-red-800",
  admin: "bg-blue-100 text-blue-800",
  user: "bg-green-100 text-green-800",
  osservatore: "bg-gray-100 text-gray-800",
};

// ---- User Modal ----

type UserFormData = {
  username: string;
  password: string;
  role: string;
  authSource: "locale" | "ad";
  isActive: boolean;
};

function UserModal({
  open,
  onClose,
  editing,
  usernamePrecompilato,
}: {
  open: boolean;
  onClose: () => void;
  editing: SafeAppUser | null;
  usernamePrecompilato?: string;
}) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<UserFormData>({
    username: editing?.username ?? usernamePrecompilato ?? "",
    password: "",
    role: editing?.role ?? "user",
    authSource: (editing?.authSource as "locale" | "ad" | undefined) ?? (usernamePrecompilato ? "ad" : "locale"),
    isActive: editing?.isActive ?? true,
  });

  const mutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const payload = {
        username: data.username,
        ...(data.password ? { password: data.password } : {}),
        role: data.role,
        authSource: data.authSource,
        isActive: data.isActive,
      };
      if (editing) return adminUsersApi.update(editing.id, payload);
      // Non ripescare data.password qui: per un utente Active Directory è "" e
      // riaggiungerla annullerebbe l'omissione fatta sopra, facendo fallire il
      // parse lato server prima ancora che authSource venga letto.
      return adminUsersApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "richieste-accesso"] });
      toast({ title: editing ? "Utente aggiornato" : "Utente creato" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Issue #99: una password locale nuova deve rispettare i requisiti di
  // shared/password.ts. In modifica il campo vuoto vuol dire «tieni quella di
  // prima», che non si ricontrolla; passando da AD a locale invece serve.
  const passwordObbligatoria =
    form.authSource === "locale" && (!editing || editing.authSource === "ad");
  const passwordNonValida =
    form.authSource === "locale" &&
    (form.password.length > 0
      ? requisitiMancanti(form.password).length > 0
      : passwordObbligatoria);

  const roleOptions = currentUser?.role === "superadmin" ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value !== "superadmin");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica utente" : "Nuovo utente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Username</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Sorgente credenziali</Label>
            <Select
              value={form.authSource}
              onValueChange={(v) => setForm({ ...form, authSource: v as "locale" | "ad", password: "" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="locale">Locale (password nell'app)</SelectItem>
                <SelectItem value="ad">Active Directory</SelectItem>
              </SelectContent>
            </Select>
            {form.authSource === "ad" && (
              <p className="text-xs text-gray-500">
                Lo username deve coincidere esattamente con quello di dominio.
              </p>
            )}
          </div>
          {form.authSource === "locale" && (
            <div className="space-y-1">
              <Label>{passwordObbligatoria ? "Password" : "Nuova password (lascia vuoto per non cambiare)"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              {(passwordObbligatoria || form.password.length > 0) && (
                <RequisitiPassword password={form.password} />
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label>Ruolo</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {editing && (
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>Account attivo</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || passwordNonValida}>
            {mutation.isPending ? "Salvo..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main Admin Page ----

export default function Admin() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users = [] } = useQuery<SafeAppUser[]>({
    queryKey: ["admin", "users"],
    queryFn: adminUsersApi.getAll,
  });

  const [userModal, setUserModal] = useState<{ open: boolean; editing: SafeAppUser | null }>({ open: false, editing: null });
  const [usernamePrecompilato, setUsernamePrecompilato] = useState<string | undefined>(undefined);
  const [deleteUser, setDeleteUser] = useState<SafeAppUser | null>(null);

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => adminUsersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "Utente eliminato" });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminUsersApi.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const canManage = (targetRole: string) => {
    if (currentUser?.role === "superadmin") return true;
    return targetRole !== "superadmin";
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <PageHeader title="Gestione Utenti" subtitle="Pannello di amministrazione" icon={Shield} />

        <div className="max-w-5xl mx-auto p-6">
          <Tabs defaultValue="utenti">
            <TabsList className="mb-4">
              <TabsTrigger value="utenti" className="flex items-center gap-1">
                <Users size={15} /> Utenti
              </TabsTrigger>
              <TabsTrigger value="richieste" className="flex items-center gap-1">
                Richieste di accesso
              </TabsTrigger>
            </TabsList>

            {/* ---- Utenti Tab ---- */}
            <TabsContent value="utenti">
              <div className="flex justify-end mb-3">
                <Button size="sm" onClick={() => setUserModal({ open: true, editing: null })}>
                  <Plus size={15} className="mr-1" /> Nuovo utente
                </Button>
              </div>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Username</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Ruolo</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Sorgente</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Stato</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Ultima login</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{u.username}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_COLORS[u.role]}`}>
                            {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {/* Chi ha una password locale è chi il consorzio non può bloccare
                              disabilitando l'account sul dominio: l'informazione che un giorno
                              servirà in fretta. */}
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            u.authSource === "ad"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-slate-100 text-slate-700"
                          }`}>
                            {u.authSource === "ad" ? "Active Directory" : "Locale"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {canManage(u.role) && currentUser?.id !== u.id ? (
                            <Switch
                              checked={u.isActive}
                              onCheckedChange={(v) => toggleActiveMutation.mutate({ id: u.id, isActive: v })}
                            />
                          ) : (
                            <Badge variant={u.isActive ? "default" : "secondary"}>
                              {u.isActive ? "Attivo" : "Disattivo"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("it-IT") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {canManage(u.role) && (
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => setUserModal({ open: true, editing: u })}>
                                <Pencil size={14} />
                              </Button>
                              {currentUser?.id !== u.id && (
                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteUser(u)}>
                                  <Trash2 size={14} />
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* ---- Richieste di accesso Tab ---- */}
            <TabsContent value="richieste">
              <Card>
                <CardHeader>
                  <CardTitle>Richieste di accesso</CardTitle>
                </CardHeader>
                <CardContent>
                  <RichiesteAccesso
                    onAbilita={(username) => {
                      setUsernamePrecompilato(username);
                      setUserModal({ open: true, editing: null });
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Modals */}
      {userModal.open && (
        <UserModal
          open={userModal.open}
          onClose={() => {
            setUserModal({ open: false, editing: null });
            setUsernamePrecompilato(undefined);
          }}
          editing={userModal.editing}
          usernamePrecompilato={usernamePrecompilato}
        />
      )}

      {/* Delete user confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina utente</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l'utente "{deleteUser?.username}"? L'operazione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleteUser) deleteUserMutation.mutate(deleteUser.id); setDeleteUser(null); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
