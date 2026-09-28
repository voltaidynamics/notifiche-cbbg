// client/src/components/data-table.tsx
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";
import { filtraRighe, ordinaRighe, type Colonna } from "@/lib/data-table";

interface DataTableProps<T> {
  righe: T[];
  colonne: Colonna<T>[];
  chiaveRiga: (riga: T, indice: number) => string;
  caricamento?: boolean;
  messaggioVuoto?: string;
}

/**
 * Tabella di sola lettura con ricerca per colonna e ordinamento, usata da tutte
 * le schede della sezione Anagrafiche. Filtra e ordina nel browser: i volumi
 * attesi sono di poche migliaia di righe per tabella.
 */
export default function DataTable<T extends Record<string, unknown>>({
  righe,
  colonne,
  chiaveRiga,
  caricamento = false,
  messaggioVuoto = "Nessun dato presente",
}: DataTableProps<T>) {
  const [filtri, setFiltri] = useState<Record<string, string>>({});
  const [chiaveOrdine, setChiaveOrdine] = useState<string | null>(null);
  const [crescente, setCrescente] = useState(true);

  const visibili = useMemo(
    () => ordinaRighe(filtraRighe(righe, filtri), chiaveOrdine, crescente),
    [righe, filtri, chiaveOrdine, crescente],
  );

  const ordina = (chiave: string) => {
    if (chiaveOrdine === chiave) setCrescente((c) => !c);
    else { setChiaveOrdine(chiave); setCrescente(true); }
  };

  return (
    <div>
      <div className="max-h-[560px] overflow-y-auto border rounded-lg scrollbar-visibile">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              {colonne.map((c) => (
                <th
                  key={c.chiave}
                  scope="col"
                  aria-sort={chiaveOrdine === c.chiave ? (crescente ? "ascending" : "descending") : "none"}
                  className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 pt-3 pb-2"
                >
                  {/* `uppercase` è ripetuto qui e non solo sul <th>: gli user agent
                      azzerano `text-transform` sui form control, quindi il valore
                      ereditato dal <th> non raggiunge il testo dentro il <button>.
                      Senza questa riga le intestazioni restano minuscole mentre
                      quelle delle altre sezioni — <th> con role="button", nessun
                      form control di mezzo — sono maiuscole (issue #20). */}
                  <button
                    type="button"
                    onClick={() => ordina(c.chiave)}
                    className="inline-flex items-center gap-1 w-full text-left uppercase cursor-pointer select-none hover:bg-gray-50"
                  >
                    {c.etichetta}
                    <ArrowUpDown size={11} className={cn(chiaveOrdine === c.chiave && "text-primary")} />
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {colonne.map((c) => (
                <th key={c.chiave} scope="col" className="px-3 pb-3 border-b-2 bg-white">
                  <Input
                    value={filtri[c.chiave] ?? ""}
                    onChange={(e) => setFiltri((f) => ({ ...f, [c.chiave]: e.target.value }))}
                    placeholder="Cerca..."
                    aria-label={`Cerca in ${c.etichetta}`}
                    className="h-8 text-xs font-normal"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {caricamento && (
              <tr>
                <td colSpan={Math.max(1, colonne.length)} className="px-3 py-8 text-center text-gray-400">Caricamento…</td>
              </tr>
            )}
            {!caricamento && visibili.map((riga, i) => (
              <tr key={chiaveRiga(riga, i)} className="border-b last:border-0 hover:bg-gray-50">
                {colonne.map((c) => (
                  <td key={c.chiave} className="px-3 py-2">
                    {riga[c.chiave] === null || riga[c.chiave] === undefined || riga[c.chiave] === ""
                      ? <span className="text-gray-400">—</span>
                      : String(riga[c.chiave])}
                  </td>
                ))}
              </tr>
            ))}
            {!caricamento && visibili.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, colonne.length)} className="px-3 py-8 text-center text-gray-400">
                  {righe.length === 0 ? messaggioVuoto : "Nessun risultato per la ricerca impostata"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-gray-500">
        {visibili.length} di {righe.length} record
      </div>
    </div>
  );
}
