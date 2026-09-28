import { parse } from "csv-parse/sync";
import { z } from "zod";
import { storage } from "./storage";

// ---- CSV templates ----

export const CSV_TEMPLATE_CONSORZIATI =
  "codice_consorzio,cognome,nome,email,telefono,tipo,indirizzo,codice_fiscale\n" +
  "CON-001,Rossi,Mario,mario@example.com,+393331234567,agricoltore,\"Via Roma 1, Lodi\",RSSMRA80A01F205Z\n";

export const CSV_TEMPLATE_PARCELS =
  "codice_comune,foglio,mappale,sezione,area_m2,note\n" +
  "F205,15,123,,5000,\n";

// ---- Validation schemas ----

const consorziatiRowSchema = z.object({
  codice_consorzio: z.string().min(1).optional(),
  cognome: z.string().min(1, "Cognome richiesto"),
  nome: z.string().min(1, "Nome richiesto"),
  email: z.string().email("Email non valida"),
  telefono: z.string().optional(),
  tipo: z.enum(["privato", "agricoltore", "cooperativa", "ente"]).default("privato"),
  indirizzo: z.string().optional(),
  codice_fiscale: z.string().optional(),
});

const parcelRowSchema = z.object({
  codice_comune: z.string().min(1, "Codice comune richiesto"),
  foglio: z.string().min(1, "Foglio richiesto"),
  mappale: z.string().min(1, "Mappale richiesto"),
  sezione: z.string().optional(),
  area_m2: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().positive().optional()),
  note: z.string().optional(),
});

export interface ImportResult {
  filename: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errorRows: number;
  errors: Array<{ row: number; message: string }>;
  status: "success" | "partial" | "failed";
}

export async function importConsorziati(csvContent: string, filename: string): Promise<ImportResult> {
  const result: ImportResult = {
    filename,
    totalRows: 0,
    importedRows: 0,
    skippedRows: 0,
    errorRows: 0,
    errors: [],
    status: "success",
  };

  let records: Record<string, string>[];
  try {
    records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    result.status = "failed";
    result.errors.push({ row: 0, message: `Errore parsing CSV: ${e.message}` });
    await storage.createImportLog({
      filename,
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      errors: JSON.stringify(result.errors),
      status: "failed",
    });
    return result;
  }

  result.totalRows = records.length;

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2; // header = row 1
    const raw = records[i];

    const parsed = consorziatiRowSchema.safeParse({
      codice_consorzio: raw.codice_consorzio || undefined,
      cognome: raw.cognome,
      nome: raw.nome,
      email: raw.email,
      telefono: raw.telefono || undefined,
      tipo: raw.tipo || "privato",
      indirizzo: raw.indirizzo || undefined,
      codice_fiscale: raw.codice_fiscale || undefined,
    });

    if (!parsed.success) {
      result.errorRows++;
      result.errors.push({
        row: rowNum,
        message: parsed.error.errors.map((e) => e.message).join("; "),
      });
      continue;
    }

    const data = parsed.data;

    try {
      // Upsert: try to find existing by email
      const all = await storage.getAllConsorziati();
      const existing = all.find((c) => c.email === data.email);

      if (existing) {
        await storage.updateConsorziato(existing.id, {
          firstName: data.nome,
          lastName: data.cognome,
          email: data.email,
          phone: data.telefono || existing.phone,
          userType: data.tipo,
          address: data.indirizzo || existing.address,
          codiceFiscale: data.codice_fiscale || existing.codiceFiscale,
          codiceConsorzio: data.codice_consorzio || existing.codiceConsorzio,
        });
        result.skippedRows++; // updated, not newly created
      } else {
        await storage.createConsorziato({
          firstName: data.nome,
          lastName: data.cognome,
          email: data.email,
          phone: data.telefono,
          userType: data.tipo,
          address: data.indirizzo,
          codiceFiscale: data.codice_fiscale,
          codiceConsorzio: data.codice_consorzio,
        });
        result.importedRows++;
      }
    } catch (e: any) {
      result.errorRows++;
      result.errors.push({ row: rowNum, message: e.message || "Errore database" });
    }
  }

  result.status =
    result.errorRows === result.totalRows
      ? "failed"
      : result.errorRows > 0
      ? "partial"
      : "success";

  await storage.createImportLog({
    filename,
    totalRows: result.totalRows,
    importedRows: result.importedRows,
    skippedRows: result.skippedRows,
    errorRows: result.errorRows,
    errors: JSON.stringify(result.errors),
    status: result.status,
  });

  return result;
}

export async function importParcels(csvContent: string, filename: string): Promise<ImportResult> {
  const result: ImportResult = {
    filename,
    totalRows: 0,
    importedRows: 0,
    skippedRows: 0,
    errorRows: 0,
    errors: [],
    status: "success",
  };

  let records: Record<string, string>[];
  try {
    records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e: any) {
    result.status = "failed";
    result.errors.push({ row: 0, message: `Errore parsing CSV: ${e.message}` });
    await storage.createImportLog({
      filename,
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      errors: JSON.stringify(result.errors),
      status: "failed",
    });
    return result;
  }

  result.totalRows = records.length;

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    const raw = records[i];

    const parsed = parcelRowSchema.safeParse({
      codice_comune: raw.codice_comune,
      foglio: raw.foglio,
      mappale: raw.mappale,
      sezione: raw.sezione || undefined,
      area_m2: raw.area_m2 || undefined,
      note: raw.note || undefined,
    });

    if (!parsed.success) {
      result.errorRows++;
      result.errors.push({
        row: rowNum,
        message: parsed.error.errors.map((e) => e.message).join("; "),
      });
      continue;
    }

    const data = parsed.data;

    try {
      const all = await storage.getAllParcels();
      const existing = all.find(
        (p) =>
          p.codiceComune === data.codice_comune &&
          p.foglio === data.foglio &&
          p.mappale === data.mappale &&
          (p.sezione ?? "") === (data.sezione ?? "")
      );

      if (existing) {
        await storage.updateParcel(existing.id, {
          areaM2: data.area_m2 ?? existing.areaM2,
          notes: data.note ?? existing.notes,
        });
        result.skippedRows++;
      } else {
        await storage.createParcel({
          comune: raw.comune || data.codice_comune,
          codiceComune: data.codice_comune,
          foglio: data.foglio,
          mappale: data.mappale,
          sezione: data.sezione,
          areaM2: data.area_m2,
          notes: data.note,
        });
        result.importedRows++;
      }
    } catch (e: any) {
      result.errorRows++;
      result.errors.push({ row: rowNum, message: e.message || "Errore database" });
    }
  }

  result.status =
    result.errorRows === result.totalRows
      ? "failed"
      : result.errorRows > 0
      ? "partial"
      : "success";

  await storage.createImportLog({
    filename,
    totalRows: result.totalRows,
    importedRows: result.importedRows,
    skippedRows: result.skippedRows,
    errorRows: result.errorRows,
    errors: JSON.stringify(result.errors),
    status: result.status,
  });

  return result;
}
