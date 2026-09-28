// Le dieci entità del WebService consorzio, condivise fra server e client.
//
// Corrispondono una a una agli endpoint della tabella che il consorzio ci ha
// consegnato (`Tabella_Endpoint_Notifiche.xlsx`, 2026-09). I nomi dicono cosa
// portano, non da quale metodo arrivano: `madriImpianti` e `madriOrari`
// riempiono la stessa tabella, e così le due `tratte*` e le tre `legami*`.
// Le ultime due entità (`roggeMadri`, `roggeFiglie`) alimentano la seconda
// gerarchia delle rogge madri `R`.

export const WS_ENTITIES = [
  "conduttori",
  "madriImpianti",
  "madriOrari",
  "tratteImpianti",
  "tratteOrari",
  "legamiLiveImpianti",
  "legamiLiveOrari",
  "legamiStagione",
  "roggeMadri",
  "roggeFiglie",
] as const;

export type WsEntity = typeof WS_ENTITIES[number];

export const ETICHETTE_ENTITA: Record<WsEntity, string> = {
  conduttori: "Destinatari",
  madriImpianti: "Impianti (aggreganti IM)",
  madriOrari: "Impianti a orari (S)",
  tratteImpianti: "Tratte e loro impianto",
  tratteOrari: "Tratte a orari (S)",
  legamiLiveImpianti: "Legami live — tratte R",
  legamiLiveOrari: "Legami live — tratte S",
  legamiStagione: "Legami stagione irrigua — tratte R",
  roggeMadri: "Rogge madri (codici R da 3)",
  roggeFiglie: "Tratte delle rogge madri (R)",
};

/**
 * Il percorso di ciascuna entità sotto la URL base.
 *
 * L'Excel del consorzio elenca otto IP diversi (`192.168.0.100`…`.107`) per
 * otto endpoint che condividono lo stesso percorso: quasi certamente un
 * segnaposto per un host solo. Non potendolo verificare da qui, la base copre
 * il caso probabile e la URL propria per entità copre l'altro.
 */
export const PERCORSI_WS: Record<WsEntity, string> = {
  conduttori: "/RestTabelle/RestTabelle.svc/getconduttoriconemailetelefono/-",
  madriImpianti: "/RestTabelle/RestTabelle.svc/getimpianti/-",
  madriOrari: "/RestTabelle/RestTabelle.svc/getroggemadri/orarigruppiconsegna",
  tratteImpianti: "/RestTabelle/RestTabelle.svc/getimpiantirogge/all",
  tratteOrari: "/RestTabelle/RestTabelle.svc/getroggeorari/S",
  legamiLiveImpianti: "/RestTabelle/RestTabelle.svc/getconduttoriroggelive/I",
  legamiLiveOrari: "/RestTabelle/RestTabelle.svc/getconduttoriroggelive/S",
  legamiStagione: "/RestTabelle/RestTabelle.svc/getconduttoriroggecartoline/R",
  // `orarirogge`, non `orari`: il consorzio ha cambiato il metodo con la
  // tabella endpoint del 22/09/2026, e l'elenco è passato da 26 a 69 righe
  // (64 codici distinti, 5 ripetuti). `orari` risponderebbe ancora, ma con
  // l'elenco vecchio.
  roggeMadri: "/RestTabelle/RestTabelle.svc/getroggemadri/orarirogge",
  roggeFiglie: "/RestTabelle/RestTabelle.svc/getroggeorari/R",
};
