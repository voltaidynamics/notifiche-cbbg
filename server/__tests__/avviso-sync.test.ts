import { describe, it, expect } from "vitest";
import {
  CHIAVE_DESTINATARI, separaDestinatari, validaDestinatari, leggiDestinatari,
  inviaAvvisoSync, descriviMancatoInvio, eseguiSyncNotturno,
} from "../avviso-sync";

describe("separaDestinatari", () => {
  it("taglia su virgola, punto e virgola e a capo", () => {
    expect(separaDestinatari("a@x.it, b@x.it; c@x.it\nd@x.it")).toEqual([
      "a@x.it", "b@x.it", "c@x.it", "d@x.it",
    ]);
  });

  it("scarta spazi e voci vuote", () => {
    expect(separaDestinatari("  a@x.it ,, ; \n ")).toEqual(["a@x.it"]);
  });

  it("normalizza a minuscolo ed elimina i doppioni", () => {
    expect(separaDestinatari("A@X.it, a@x.it")).toEqual(["a@x.it"]);
  });

  it("da una stringa vuota non ricava destinatari", () => {
    expect(separaDestinatari("")).toEqual([]);
  });
});

describe("validaDestinatari", () => {
  it("separa i validi dagli scartati", () => {
    const esito = validaDestinatari(["a@x.it", "non-un-indirizzo", "b@x.it"]);
    expect(esito.validi).toEqual(["a@x.it", "b@x.it"]);
    expect(esito.invalidi).toEqual(["non-un-indirizzo"]);
  });

  it("un indirizzo malformato non finisce fra i validi", () => {
    // La regola che protegge dal refuso: salvare "mario@" al posto di
    // "mario@consorzio.it" spegnerebbe gli avvisi senza dirlo a nessuno.
    expect(validaDestinatari(["mario@"]).validi).toEqual([]);
  });
});

describe("leggiDestinatari", () => {
  it("legge e normalizza il valore salvato", () => {
    expect(leggiDestinatari({ [CHIAVE_DESTINATARI]: "A@x.it, b@x.it" })).toEqual(["a@x.it", "b@x.it"]);
  });

  it("senza la chiave restituisce una lista vuota", () => {
    expect(leggiDestinatari({})).toEqual([]);
  });
});

import type { EsitoSync } from "../sync/sync-all";
import type { SyncLog } from "@shared/schema";
import { componiAvviso, componiAvvisoGuasto, componiAvvisoDaLog, formattaIstante } from "../avviso-sync";

const INIZIO = new Date("2026-07-30T03:00:00Z");
const FINE = new Date("2026-07-30T03:01:30Z");

function esito(over: Partial<EsitoSync> = {}): EsitoSync {
  return {
    syncLogId: 1,
    status: "success",
    conteggi: { conduttori: 12000, madri: 45, tratte: 300 },
    errori: [],
    saltate: [],
    ...over,
  };
}

describe("formattaIstante", () => {
  it("formatta sull'ora italiana anche se il processo è in UTC", () => {
    // Il server gira in UTC: senza timeZone esplicito l'email direbbe 03:01 e
    // l'applicazione, che formatta nel browser, 05:01 per lo stesso caricamento.
    expect(formattaIstante(FINE)).toContain("05:01");
    expect(formattaIstante(FINE)).toContain("30/07/2026");
  });

  it("applica il fuso anche a una stringa ISO, non solo a una Date vera", () => {
    // SyncLog.startedAt/finishedAt sono tipizzati Date solo a compile time: un
    // log rehydratato da JSON li porta come stringa. Senza `new Date(d)`,
    // `"...".toLocaleString(...)` non fallisce: cade su
    // Object.prototype.toLocaleString e restituisce la stringa invariata,
    // senza applicare alcun fuso — un bug silenzioso.
    expect(formattaIstante("2026-07-30T03:01:30Z")).toContain("05:01");
  });
});

describe("componiAvviso", () => {
  it("su esito riuscito mette il totale righe nell'oggetto", () => {
    const msg = componiAvviso(esito(), INIZIO, FINE);
    expect(msg.oggetto).toContain("✅");
    expect(msg.oggetto).toContain("12.345 righe");
  });

  it("su esito parziale segnala il parziale e conta gli errori", () => {
    const msg = componiAvviso(
      esito({ status: "partial", errori: ["Comuni: 500", "Legami live: timeout"] }),
      INIZIO, FINE,
    );
    expect(msg.oggetto).toContain("⚠️");
    expect(msg.oggetto).toContain("2 errori");
    expect(msg.html).toContain("Comuni: 500");
  });

  it("su esito fallito non annuncia righe caricate", () => {
    const msg = componiAvviso(
      esito({ status: "failed", conteggi: {}, errori: ["Nessuna sorgente è configurata"] }),
      INIZIO, FINE,
    );
    expect(msg.oggetto).toContain("❌");
    expect(msg.oggetto).not.toMatch(/righe/);
  });

  it("mostra le entità saltate distinte dagli errori", () => {
    const msg = componiAvviso(esito({ saltate: ["Comuni"] }), INIZIO, FINE);
    expect(msg.html).toContain("Non configurate");
    expect(msg.html).toContain("Comuni");
  });

  it("usa le etichette leggibili delle entità, non le chiavi tecniche", () => {
    const msg = componiAvviso(esito({ conteggi: { madriImpianti: 45 } }), INIZIO, FINE);
    expect(msg.html).toContain("Impianti (aggreganti IM)");
    expect(msg.html).not.toContain("madriImpianti");
  });

  it("traduce anche le chiavi diagnostiche del registro, non solo le entità", () => {
    const msg = componiAvviso(esito({ conteggi: { tratteScartate: 373 } }), INIZIO, FINE);
    expect(msg.html).toContain("Tratte scartate (aggregazioni non IM)");
    expect(msg.html).not.toContain("tratteScartate");
  });

  it("ripiega sulla chiave quando non è un'entità né una diagnostica nota", () => {
    // "associazioni" non è più una chiave che il sync produce, ma il ripiego
    // deve valere per qualunque chiave sconosciuta: senza, la voce
    // sparirebbe dal riepilogo invece di comparire con la chiave grezza.
    const msg = componiAvviso(esito({ conteggi: { associazioni: 900 } }), INIZIO, FINE);
    expect(msg.html).toContain("associazioni");
  });

  it("il totale conta solo le righe scritte, non le diagnostiche (Parte C)", () => {
    const msg = componiAvviso(
      esito({
        conteggi: {
          conduttori: 10, madri: 5, tratte: 3, legami: 2,
          tratteScartate: 373, tratteSenzaMadre: 7, legamiScartati: 61, madriDiServizio: 20,
          tratteDiServizio: 20, madriTipoIgnoto: 4,
        },
      }),
      INIZIO, FINE,
    );
    // 10 + 5 + 3 + 2 = 20: le sei chiavi diagnostiche (tratteSenzaMadre
    // compresa) restano fuori dal totale.
    expect(msg.oggetto).toContain("20 righe");
    // Ma restano visibili nella tabella.
    expect(msg.html).toContain("Tratte scartate (aggregazioni non IM)");
    expect(msg.html).toContain("Tratte scartate (codice troppo corto)");
  });

  it("fa l'escape dell'HTML nei messaggi d'errore", () => {
    const msg = componiAvviso(
      esito({ status: "failed", conteggi: {}, errori: ['<script>alert("x")</script>'] }),
      INIZIO, FINE,
    );
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
  });

  it("chiude spiegando che l'assenza del messaggio è essa stessa un segnale", () => {
    const msg = componiAvviso(esito(), INIZIO, FINE);
    expect(msg.html).toContain("Se una notte non arriva");
  });
});

describe("componiAvvisoGuasto", () => {
  it("distingue il caricamento già in corso da un guasto vero", () => {
    const occupato = componiAvvisoGuasto("Sincronizzazione già in corso", FINE, true);
    expect(occupato.oggetto).toContain("⚠️");
    expect(occupato.oggetto).toContain("non eseguito");

    const rotto = componiAvvisoGuasto("connessione al database persa", FINE, false);
    expect(rotto.oggetto).toContain("❌");
    expect(rotto.oggetto).toContain("connessione al database persa");
  });
});

describe("componiAvvisoDaLog", () => {
  function log(over: Partial<SyncLog> = {}): SyncLog {
    return {
      id: 7,
      trigger: "notturno",
      startedAt: INIZIO,
      finishedAt: FINE,
      status: "success",
      entityCounts: JSON.stringify({ conduttori: 10 }),
      errors: JSON.stringify([]),
      skippedEntities: JSON.stringify([]),
      ...over,
    } as SyncLog;
  }

  it("ricostruisce il messaggio da un log salvato", () => {
    expect(componiAvvisoDaLog(log()).oggetto).toContain("10 righe");
  });

  it("sopravvive a campi JSON illeggibili", () => {
    // I campi di sync_logs sono testo: vanno trattati come dati esterni, non
    // come JSON garantito. Un parse fallito non deve far esplodere una rotta.
    const msg = componiAvvisoDaLog(log({ entityCounts: "{rotto", errors: "nemmeno" }));
    expect(msg.oggetto).toContain("0 righe");
  });

  it("un log ancora in corso viene trattato come non riuscito", () => {
    expect(componiAvvisoDaLog(log({ status: "running", finishedAt: null })).oggetto).toContain("❌");
  });
});

import type { ConfigEmail } from "../config-notifiche";

const CONFIG_OK: ConfigEmail = {
  service: "gmail", user: "mittente@consorzio.it", password: "segreta",
  smtpHost: null, smtpPort: null, smtpSecure: false,
};

function archivioCon(valore: string) {
  return { getAllSettings: async () => ({ [CHIAVE_DESTINATARI]: valore }) };
}

function trasportoFinto() {
  const inviati: Record<string, unknown>[] = [];
  return {
    inviati,
    sendMail: async (opzioni: Record<string, unknown>) => { inviati.push(opzioni); return {}; },
  };
}

const MSG = { oggetto: "oggetto", html: "<p>corpo</p>" };

describe("inviaAvvisoSync", () => {
  it("invia un solo messaggio a tutti i destinatari", async () => {
    const trasporto = trasportoFinto();
    const esito = await inviaAvvisoSync(MSG, {
      archivio: archivioCon("a@x.it, b@x.it"), config: CONFIG_OK, trasporto,
    });
    expect(esito).toEqual({ inviato: true, destinatari: 2 });
    expect(trasporto.inviati).toHaveLength(1);
    expect(trasporto.inviati[0].to).toBe("a@x.it, b@x.it");
    expect(trasporto.inviati[0].subject).toBe("oggetto");
    expect(trasporto.inviati[0].from).toBe("mittente@consorzio.it");
  });

  it("senza destinatari non invia e non solleva", async () => {
    const trasporto = trasportoFinto();
    const esito = await inviaAvvisoSync(MSG, { archivio: archivioCon(""), config: CONFIG_OK, trasporto });
    expect(esito).toEqual({ inviato: false, motivo: "nessun destinatario" });
    expect(trasporto.inviati).toHaveLength(0);
  });

  it("senza configurazione email non invia e non solleva", async () => {
    const trasporto = trasportoFinto();
    const esito = await inviaAvvisoSync(MSG, {
      archivio: archivioCon("a@x.it"),
      config: { ...CONFIG_OK, password: "" },
      trasporto,
    });
    expect(esito).toEqual({ inviato: false, motivo: "email non configurata" });
    expect(trasporto.inviati).toHaveLength(0);
  });

  it("un guasto SMTP non solleva: l'avviso non deve poter far cadere il cron", async () => {
    const esito = await inviaAvvisoSync(MSG, {
      archivio: archivioCon("a@x.it"),
      config: CONFIG_OK,
      trasporto: { sendMail: async () => { throw new Error("connessione rifiutata"); } },
    });
    expect(esito).toEqual({ inviato: false, motivo: "errore", dettaglio: "connessione rifiutata" });
  });

  it("un guasto nella lettura delle impostazioni non solleva", async () => {
    const esito = await inviaAvvisoSync(MSG, {
      archivio: { getAllSettings: async () => { throw new Error("database irraggiungibile"); } },
      config: CONFIG_OK,
      trasporto: trasportoFinto(),
    });
    expect(esito).toEqual({ inviato: false, motivo: "errore", dettaglio: "database irraggiungibile" });
  });
});

describe("descriviMancatoInvio", () => {
  it("spiega il motivo in italiano", () => {
    expect(descriviMancatoInvio({ inviato: false, motivo: "nessun destinatario" }))
      .toMatch(/destinatario/i);
    expect(descriviMancatoInvio({ inviato: false, motivo: "errore", dettaglio: "SMTP giù" }))
      .toBe("SMTP giù");
  });
});

import { SyncGiaInCorso } from "../sync/sync-all";

describe("eseguiSyncNotturno", () => {
  function raccoglitore() {
    const messaggi: { oggetto: string; html: string }[] = [];
    return {
      messaggi,
      invia: async (m: { oggetto: string; html: string }) => {
        messaggi.push(m);
        return { inviato: true as const, destinatari: 1 };
      },
    };
  }

  it("a caricamento riuscito manda il riepilogo di successo", async () => {
    const r = raccoglitore();
    await eseguiSyncNotturno({ sync: async () => esito(), invia: r.invia });
    expect(r.messaggi).toHaveLength(1);
    expect(r.messaggi[0].oggetto).toContain("✅");
  });

  it("a caricamento parziale manda il riepilogo parziale", async () => {
    const r = raccoglitore();
    await eseguiSyncNotturno({
      sync: async () => esito({ status: "partial", errori: ["Comuni: 500"] }),
      invia: r.invia,
    });
    expect(r.messaggi[0].oggetto).toContain("⚠️");
  });

  it("se il caricamento era già in corso lo dice, invece di tacere", async () => {
    const r = raccoglitore();
    await eseguiSyncNotturno({
      sync: async () => { throw new SyncGiaInCorso(); },
      invia: r.invia,
    });
    expect(r.messaggi[0].oggetto).toContain("non eseguito");
  });

  it("se syncAll solleva manda comunque un avviso di guasto", async () => {
    const r = raccoglitore();
    await eseguiSyncNotturno({
      sync: async () => { throw new Error("database irraggiungibile"); },
      invia: r.invia,
    });
    expect(r.messaggi[0].oggetto).toContain("❌");
    expect(r.messaggi[0].oggetto).toContain("database irraggiungibile");
  });

  it("un invio che solleva non propaga: il callback del cron non ha chi lo ascolti", async () => {
    const esitoInvio = await eseguiSyncNotturno({
      sync: async () => esito(),
      invia: async () => { throw new Error("SMTP giù"); },
    });
    expect(esitoInvio).toEqual({ inviato: false, motivo: "errore", dettaglio: "SMTP giù" });
  });
});
