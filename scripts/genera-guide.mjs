#!/usr/bin/env node
/**
 * Genera le pagine HTML della guida a partire dai sorgenti Markdown.
 *
 *   docs/guida-utente.md      ->  client/public/guida-utente.html
 *   docs/guida-super-user.md  ->  client/public/guida-super-user.html
 *
 * Il Markdown resta l'unica fonte: l'HTML è un prodotto, e infatti porta in
 * testa un avviso a chi lo apre per modificarlo. Gira dentro `npm run build`,
 * così una guida modificata e non rigenerata non può arrivare in produzione;
 * l'output è comunque committato, perché il server di sviluppo serve
 * `client/public` così com'è, senza passare da una build.
 *
 * Uso: npm run guide:build
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const RADICE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Le due guide, e chi le legge. */
const GUIDE = [
  {
    sorgente: "docs/guida-utente.md",
    destinazione: "client/public/guida-utente.html",
    titolo: "Guida utente — Notifiche Canali Irrigui",
    occhiello: "Utente e Osservatore",
  },
  {
    sorgente: "docs/guida-super-user.md",
    destinazione: "client/public/guida-super-user.html",
    titolo: "Guida super user — Notifiche Canali Irrigui",
    occhiello: "Admin e Super Admin",
  },
];

/**
 * Lo slug di un titolo, nella forma che l'indice delle guide già usa
 * (`## 5. Invia notifica` -> `#5-invia-notifica`).
 *
 * marked non genera più gli id dei titoli per conto suo, e senza questa
 * funzione ogni voce dell'indice porterebbe a una pagina che non si muove.
 * È la stessa regola di GitHub: minuscolo, via la punteggiatura, spazi in
 * trattini — comprese le lettere accentate, che restano come sono.
 *
 * Riceve il testo **grezzo** del titolo, non l'HTML già reso: lì l'apostrofo è
 * diventato `&#39;`, e togliendo la punteggiatura resterebbe il `39` dentro
 * l'id (`l39applicazione`), che nessuna voce dell'indice sa raggiungere.
 */
function slug(testo) {
  return (
    testo
      .toLowerCase()
      .replace(/\s/g, " ")
      .replace(/[^\p{L}\p{N} -]/gu, "")
      .trim()
      // Uno spazio, un trattino: le due spaziature non si accorpano. In
      // `## 4. Impostazioni → Email` la freccia sparisce e restano due spazi,
      // quindi lo slug giusto è `4-impostazioni--email` — con `\s+` diventava
      // `4-impostazioni-email` e la voce dell'indice non trovava più il titolo.
      .replace(/ /g, "-")
  );
}

function costruisciMarked() {
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const reso = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(text)}">${reso}</h${depth}>\n`;
      },
      // I rimandi fra le due guide sono scritti in Markdown e puntano al `.md`:
      // nella pagina servita devono puntare all'HTML, o il lettore si trova
      // davanti al sorgente (o a un 404, visto che `docs/` non è pubblicato).
      link({ href, title, tokens }) {
        const testo = this.parser.parseInline(tokens);
        const destinazione = href.replace(/^(?:\.\/)?(guida-[a-z-]+)\.md(#.*)?$/, "/$1.html$2");
        const attrTitolo = title ? ` title="${title}"` : "";
        const esterno = /^https?:/.test(destinazione)
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
        return `<a href="${destinazione}"${attrTitolo}${esterno}>${testo}</a>`;
      },
    },
  });
  return marked;
}

/** Lo stile della pagina: gli stessi colori dell'applicazione. */
const STILE = `
  :root { color-scheme: light; --verde: #16a34a; --testo: #1f2937; --grigio: #4b5563; --bordo: #e5e7eb; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f9fafb;
    color: var(--testo);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.65;
  }
  .foglio {
    max-width: 52rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 5rem;
  }
  header.intestazione {
    background: #fff;
    border-bottom: 1px solid var(--bordo);
    padding: 1.25rem;
  }
  header.intestazione .dentro {
    max-width: 52rem;
    margin: 0 auto;
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  header.intestazione strong { color: var(--verde); font-size: 1.05rem; }
  header.intestazione span { color: var(--grigio); font-size: 0.85rem; }
  h1 { font-size: 1.9rem; line-height: 1.25; margin: 1.5rem 0 0.5rem; }
  h2 {
    font-size: 1.4rem;
    margin: 2.75rem 0 0.75rem;
    padding-top: 1.25rem;
    border-top: 1px solid var(--bordo);
  }
  h3 { font-size: 1.1rem; margin: 1.75rem 0 0.5rem; }
  h4 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: var(--grigio); }
  p, li { color: var(--grigio); }
  li { margin: 0.25rem 0; }
  a { color: var(--verde); }
  strong { color: var(--testo); }
  hr { border: 0; border-top: 1px solid var(--bordo); margin: 2.5rem 0; }
  code {
    background: #f3f4f6;
    border: 1px solid var(--bordo);
    border-radius: 0.25rem;
    padding: 0.05rem 0.3rem;
    font-size: 0.85em;
  }
  pre {
    background: #fff;
    border: 1px solid var(--bordo);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
  }
  pre code { background: none; border: 0; padding: 0; font-size: 0.82rem; }
  blockquote {
    margin: 1.25rem 0;
    padding: 0.75rem 1rem;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 4px solid #f59e0b;
    border-radius: 0.375rem;
  }
  blockquote p { margin: 0.4rem 0; color: #78350f; }
  blockquote p:first-child { margin-top: 0; }
  blockquote p:last-child { margin-bottom: 0; }
  /* Le tabelle sono larghe e la pagina si legge anche da telefono: scorre la
     tabella dentro il suo contenitore, non tutto il corpo della pagina. */
  .tabella { overflow-x: auto; margin: 1.25rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; background: #fff; }
  th, td { border: 1px solid var(--bordo); padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; color: var(--testo); font-weight: 600; }
  td { color: var(--grigio); }
  footer.piede {
    max-width: 52rem;
    margin: 0 auto;
    padding: 0 1.25rem 3rem;
    color: #9ca3af;
    font-size: 0.8rem;
  }
`;

function pagina({ titolo, occhiello, corpo }) {
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titolo}</title>
    <!--
      PAGINA GENERATA — non modificarla a mano.
      La fonte è in docs/, si rigenera con: npm run guide:build
    -->
    <style>${STILE}</style>
  </head>
  <body>
    <header class="intestazione">
      <div class="dentro">
        <strong>Notifiche Canali Irrigui</strong>
        <span>Guida per ${occhiello}</span>
      </div>
    </header>
    <main class="foglio">
${corpo}
    </main>
    <footer class="piede">
      Pagina generata da <code>${"docs/"}</code> — per correggerla si modifica il Markdown e si rilancia <code>npm run guide:build</code>.
    </footer>
  </body>
</html>
`;
}

/**
 * Ogni `href="#..."` della pagina deve trovare un titolo con quell'id.
 *
 * Le guide si aprono dal loro indice, e un indice che non porta da nessuna
 * parte è il primo motivo per cui una guida smette di essere letta. Lo slug
 * qui e quello di GitHub devono restare la stessa regola — l'indice è scritto
 * a mano nel Markdown, quindi è il generatore a doversi adeguare, non
 * viceversa. Il controllo fa fallire `npm run build`: una guida con i rimandi
 * rotti non arriva in produzione.
 */
function verificaAncore(html, nome) {
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const rotte = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))].filter(
    (a) => !ids.has(a),
  );
  if (rotte.length > 0) {
    throw new Error(
      `${nome}: ${rotte.length} rimandi interni non trovano il titolo — ${rotte.join(", ")}`,
    );
  }
}

const marked = costruisciMarked();

for (const guida of GUIDE) {
  const md = readFileSync(resolve(RADICE, guida.sorgente), "utf8");
  // `<table>` avvolta in un contenitore che scorre: marked non lo fa da solo,
  // e senza è la pagina intera a scorrere in orizzontale su telefono.
  const corpo = marked
    .parse(md)
    .replace(/<table>/g, '<div class="tabella"><table>')
    .replace(/<\/table>/g, "</table></div>");

  const html = pagina({ titolo: guida.titolo, occhiello: guida.occhiello, corpo });
  verificaAncore(html, guida.sorgente);

  writeFileSync(resolve(RADICE, guida.destinazione), html, "utf8");
  console.log(`✓ ${guida.sorgente} → ${guida.destinazione}`);
}
