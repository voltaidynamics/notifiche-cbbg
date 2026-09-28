import "dotenv/config";
import { db } from "../server/db";
import { groups } from "@shared/schema";
import { eq } from "drizzle-orm";
import { rimappaSlugAnagrafiche } from "../server/migra-slug";

async function main() {
  const tutti = await db.select().from(groups);
  let aggiornati = 0;
  for (const g of tutti) {
    let slug: string[];
    try {
      slug = JSON.parse(g.allowedPages) as string[];
    } catch {
      console.warn(`Gruppo ${g.id} (${g.name}): allowed_pages illeggibile, saltato`);
      continue;
    }
    const nuovi = rimappaSlugAnagrafiche(slug);
    if (JSON.stringify(nuovi) === JSON.stringify(slug)) continue;
    await db.update(groups).set({ allowedPages: JSON.stringify(nuovi) }).where(eq(groups.id, g.id));
    console.log(`Gruppo ${g.id} (${g.name}): ${slug.join(",")} -> ${nuovi.join(",")}`);
    aggiornati++;
  }
  console.log(`Gruppi aggiornati: ${aggiornati} su ${tutti.length}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
