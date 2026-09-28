import "dotenv/config";
import { db } from "../server/db";
import { appUsers } from "../shared/schema";
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
  const password = process.env.SEED_ADMIN_PASSWORD ?? await prompt("Password superadmin (min 8 caratteri): ");

  if (!username || username.length < 3) {
    console.error("Errore: username deve essere almeno 3 caratteri");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("Errore: password deve essere almeno 8 caratteri");
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
