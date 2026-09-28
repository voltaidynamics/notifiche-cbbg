/**
 * Carica nel database i JSON che il tester ha consegnato nel branch
 * Dylan-86-temp-files, passando dal **sync vero** in modalità file.
 *
 * Non è un importatore parallelo, ed è il punto: se i dati entrassero da una
 * strada che il collaudo non percorrerà, non avremmo testato niente. Lo script
 * si limita a scrivere le impostazioni `ws.*` e a chiamare `syncAll`.
 *
 * Idempotente: il sync sostituisce ogni entità per intero.
 */
import "dotenv/config";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { storage } from "../server/storage";
import { syncAll } from "../server/sync/sync-all";
import { chiaveSetting, CHIAVE_BASE, WS_ENTITIES, type WsEntity } from "../server/sync/config";

const CARTELLA = resolve(process.cwd(), "dati-ws/tester-2026-09");

// I file dei primi 8 sono nel branch Dylan-86-temp-files; i due della gerarchia R
// vengono consegnati dal consorzio (mail 16/09/2026) e non sono ancora arrivati.
const FILE: Record<WsEntity, string> = {
  conduttori: "ANAGRAFICA_CONDUTTORI_getconduttoriconemailetelefono.json",
  madriImpianti: "ANAGRAFICA_I_getimpianti.json",
  madriOrari: "ANAGRAFICA_S_getroggemadri_orarigruppiconsegna.json",
  tratteImpianti: "LEGAME_RDA9_MADRE_I_getimpiantirogge_all.json",
  tratteOrari: "ELENCO_SDA9_getroggeorari_S.json",
  legamiLiveImpianti: "LEGAME_LIVE_I_getconduttoriroggelive_I.json",
  legamiLiveOrari: "LEGAME_LIVE_S_getconduttoriroggelive_S.json",
  legamiStagione: "LEGAME_STAGIONE_R_getconduttoriroggecartoline_R.json",
  roggeMadri: "ANAGRAFICA_R_getroggemadri_orari.json",
  roggeFiglie: "ELENCO_RDA9_getroggeorari_R.json",
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL non è impostata: scriverebbe in MemStorage, che sparisce a fine processo.");
    process.exit(1);
  }

  for (const e of WS_ENTITIES) {
    const percorso = resolve(CARTELLA, FILE[e]);
    if (!existsSync(percorso)) {
      console.error(`Manca ${percorso}`);
      if (e === "roggeMadri" || e === "roggeFiglie") {
        console.error("I JSON della gerarchia R vengono consegnati dal consorzio (mail 16/09/2026).");
        console.error("Una volta ricevuti, salvali in dati-ws/tester-2026-09/ con i nomi sopra.");
      } else {
        console.error("I file stanno nel branch Dylan-86-temp-files. Estrarli con:");
        console.error(`  git show origin/Dylan-86-temp-files:${FILE[e]} > ${percorso}`);
      }
      process.exit(1);
    }
    await storage.setSetting(chiaveSetting(e, "mode"), "file");
    await storage.setSetting(chiaveSetting(e, "path"), percorso);
    await storage.setSetting(chiaveSetting(e, "url"), "");
  }
  // La base resta vuota: in modalità file non serve, e lasciarla scritta
  // farebbe credere che il server sia raggiungibile da qui. Non lo è.
  await storage.setSetting(CHIAVE_BASE, "");

  const esito = await syncAll("carica-dati-tester");
  console.log("stato:", esito.status);
  console.log("conteggi:", JSON.stringify(esito.conteggi, null, 2));
  if (esito.errori.length > 0) console.log("errori:", esito.errori);
  if (esito.saltate.length > 0) console.log("saltate:", esito.saltate);
  process.exit(esito.status === "success" ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
