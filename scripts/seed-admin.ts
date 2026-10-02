import "dotenv/config";
import { db } from "../server/db";
import { appUsers } from "../shared/schema";
import { errorePasswordLocale, LUNGHEZZA_MINIMA_PASSWORD } from "../shared/password";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import * as readline from "readline/promises";

const BCRYPT_ROUNDS = 12;

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME ?? await prompt("Username superadmin: ");
  const password = process.env.SEED_ADMIN_PASSWORD ?? await prompt(`Password superadmin (almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri, maiuscola, minuscola, numero e carattere speciale): `);

  if (!username || username.length < 3) {
    console.error("Errore: username deve essere almeno 3 caratteri");
    process.exit(1);
  }
  // Stessa regola di Gestione Utenti (issue #99): il superadmin creato qui è
  // locale, ed è l'account che entra quando Active Directory non risponde.
  const errorePassword = errorePasswordLocale(password ?? "");
  if (errorePassword) {
    console.error(`Errore: ${errorePassword}`);
    process.exit(1);
  }

  const existing = await db.select().from(appUsers).where(eq(appUsers.role, "superadmin")).limit(1);
  if (existing.length > 0) {
    console.error("Errore: esiste già un superadmin. Questo script può essere eseguito solo quando non ci sono superadmin.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [created] = await db
    .insert(appUsers)
    .values({ username, passwordHash, role: "superadmin", isActive: true })
    .returning({ id: appUsers.id, username: appUsers.username, role: appUsers.role });

  console.log(`✓ Superadmin creato: id=${created.id} username="${created.username}"`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore:", err);
  process.exit(1);
});
