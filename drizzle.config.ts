import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // `session` è di connect-pg-simple, non di Drizzle: la crea l'app da sé
  // (`createTableIfMissing` in server/auth.ts) e non compare in shared/schema.ts.
  // Senza questa esclusione `db:push` la considera una tabella di troppo e la
  // CANCELLA, stampando "Changes applied" senza alcun avviso. Verificato su un
  // database usa e getta il 31/07/2026: con il filtro 22 tabelle e session
  // intatta, senza filtro 21 e session sparita.
  tablesFilter: ["!session"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
