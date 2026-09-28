// Etichette e colori dei ruoli applicativi, condivisi fra sidebar e topbar.
export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  user: "Utente",
  osservatore: "Osservatore",
};

export const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-red-100 text-red-800",
  admin: "bg-blue-100 text-blue-800",
  user: "bg-green-100 text-green-800",
  osservatore: "bg-gray-100 text-gray-800",
};
