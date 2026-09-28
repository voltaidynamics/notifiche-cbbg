import { describe, it, expect, vi, afterEach } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { creaSource, estraiArray, SorgenteNonConfigurata } from "../sync/source";
import { leggiConfigWs } from "../sync/config";

afterEach(() => { vi.unstubAllGlobals(); });

describe("estraiArray", () => {
  it("accetta un array diretto", () => {
    expect(estraiArray([1, 2])).toEqual([1, 2]);
  });
  it("accetta un oggetto che contiene un array", () => {
    expect(estraiArray({ data: [1, 2] })).toEqual([1, 2]);
  });
  it("restituisce array vuoto per null", () => {
    expect(estraiArray(null)).toEqual([]);
  });
  it("solleva per una forma non riconoscibile", () => {
    expect(() => estraiArray("pippo")).toThrow(/non riconosciuta/i);
  });
});

describe("creaSource — modalità file", () => {
  it("legge il JSON dal percorso configurato", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-"));
    const file = join(dir, "conduttori.json");
    writeFileSync(file, JSON.stringify([{ keykey: "1" }]));

    const source = creaSource(leggiConfigWs({
      "ws.conduttori.mode": "file",
      "ws.conduttori.path": file,
    }));
    expect(await source.fetchRaw("conduttori")).toEqual([{ keykey: "1" }]);
  });

  it("solleva un errore leggibile se il file non esiste", async () => {
    const source = creaSource(leggiConfigWs({
      "ws.conduttori.mode": "file",
      "ws.conduttori.path": "/percorso/inesistente.json",
    }));
    await expect(source.fetchRaw("conduttori")).rejects.toThrow(/inesistente\.json/);
  });
});

describe("creaSource — modalità http", () => {
  it("chiama l'url configurato passando l'autenticazione", async () => {
    const fetchFinto = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [{ keykey: "1" }],
    });
    vi.stubGlobal("fetch", fetchFinto);

    const source = creaSource(leggiConfigWs({
      "ws.auth": "segreto",
      "ws.conduttori.mode": "http",
      "ws.conduttori.url": "https://ws/conduttori",
    }));
    const out = await source.fetchRaw("conduttori");

    expect(out).toEqual([{ keykey: "1" }]);
    const [url, opzioni] = fetchFinto.mock.calls[0];
    expect(url).toBe("https://ws/conduttori");
    expect(opzioni.headers.Authorization).toBe("segreto");
  });

  it("aggiunge i parametri alla query string", async () => {
    const fetchFinto = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetchFinto);

    const source = creaSource(leggiConfigWs({
      "ws.tratteOrari.mode": "http",
      "ws.tratteOrari.url": "https://ws/figlie",
    }));
    await source.fetchRaw("tratteOrari", { codicemadre: "R01" });

    expect(fetchFinto.mock.calls[0][0]).toBe("https://ws/figlie?codicemadre=R01");
  });

  it("solleva se la risposta non è ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    const source = creaSource(leggiConfigWs({
      "ws.conduttori.mode": "http",
      "ws.conduttori.url": "https://ws/conduttori",
    }));
    await expect(source.fetchRaw("conduttori")).rejects.toThrow(/503/);
  });
});

describe("creaSource — entità non configurata", () => {
  it("solleva SorgenteNonConfigurata con l'etichetta italiana", async () => {
    const source = creaSource(leggiConfigWs({}));
    await expect(source.fetchRaw("conduttori")).rejects.toBeInstanceOf(SorgenteNonConfigurata);
    await expect(source.fetchRaw("conduttori")).rejects.toThrow(/Destinatari/);
  });
});

describe("creaSource — timeout HTTP", () => {
  it("passa un AbortSignal a fetch", async () => {
    const fetchFinto = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => [{ id: 1 }],
    });
    vi.stubGlobal("fetch", fetchFinto);

    const source = creaSource(leggiConfigWs({
      "ws.conduttori.mode": "http",
      "ws.conduttori.url": "https://ws/conduttori",
    }));
    await source.fetchRaw("conduttori");

    const [, opzioni] = fetchFinto.mock.calls[0];
    expect(opzioni.signal).toBeInstanceOf(AbortSignal);
  });

  it("ripulisce il timer sia al successo che all'errore", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    try {
      const fetchFinto = vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => [{ id: 1 }],
      });
      vi.stubGlobal("fetch", fetchFinto);

      const source = creaSource(leggiConfigWs({
        "ws.conduttori.mode": "http",
        "ws.conduttori.url": "https://ws/conduttori",
      }));
      await source.fetchRaw("conduttori");

      expect(clearTimeoutSpy).toHaveBeenCalled();

      // Resetta lo spy per il secondo test
      clearTimeoutSpy.mockClear();

      // Test percorso errore: fetch fallisce
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
      await expect(source.fetchRaw("conduttori")).rejects.toThrow();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
