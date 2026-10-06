import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth, requireRole, requireAdmin, soloLetturaOsservatore, apiSenzaCache } from "../auth";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    isAuthenticated: () => false,
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function mockRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe("requireAuth", () => {
  it("returns 401 when not authenticated", () => {
    const req = mockReq({ isAuthenticated: () => false });
    const { res, status, json } = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ message: "Non autenticato" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when authenticated", () => {
    const req = mockReq({
      isAuthenticated: () => true,
      user: { id: 1, username: "admin", role: "admin", isActive: true },
    });
    const { res } = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("returns 403 when role not in list", () => {
    const req = mockReq({
      isAuthenticated: () => true,
      user: { id: 1, username: "user1", role: "user", isActive: true },
    });
    const { res, status, json } = mockRes();
    const next = vi.fn();
    requireRole("superadmin", "admin")(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ message: "Accesso non autorizzato" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when role matches", () => {
    const req = mockReq({
      isAuthenticated: () => true,
      user: { id: 1, username: "admin1", role: "admin", isActive: true },
    });
    const { res } = mockRes();
    const next = vi.fn();
    requireRole("superadmin", "admin")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  it("blocks osservatore", () => {
    const req = mockReq({
      isAuthenticated: () => true,
      user: { id: 1, username: "obs1", role: "osservatore", isActive: true },
    });
    const { res, status } = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows superadmin", () => {
    const req = mockReq({
      isAuthenticated: () => true,
      user: { id: 1, username: "sa1", role: "superadmin", isActive: true },
    });
    const { res } = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("soloLetturaOsservatore", () => {
  const osservatore = { id: 7, username: "obs1", role: "osservatore", isActive: true };

  it("rifiuta con 403 le richieste che modificano", () => {
    const req = mockReq({ method: "POST", path: "/api/templates", user: osservatore } as Partial<Request>);
    const { res, status } = mockRes();
    const next = vi.fn();
    soloLetturaOsservatore(req, res, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("lascia passare le letture", () => {
    const req = mockReq({ method: "GET", path: "/api/templates", user: osservatore } as Partial<Request>);
    const { res } = mockRes();
    const next = vi.fn();
    soloLetturaOsservatore(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("lascia uscire l'osservatore (issue #73)", () => {
    // Il logout è una POST: bloccato, la sessione restava valida e il pulsante
    // «Esci» sembrava non fare niente.
    const req = mockReq({ method: "POST", path: "/api/auth/logout", user: osservatore } as Partial<Request>);
    const { res, status } = mockRes();
    const next = vi.fn();
    soloLetturaOsservatore(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it("non tocca gli altri ruoli", () => {
    const req = mockReq({
      method: "POST",
      path: "/api/templates",
      user: { id: 1, username: "u", role: "user", isActive: true },
    } as Partial<Request>);
    const { res } = mockRes();
    const next = vi.fn();
    soloLetturaOsservatore(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// Issue #122: una scheda duplicata riceveva dalla cache il `/api/auth/me` di
// chi era entrato prima nello stesso browser, e mostrava le sue pagine.
describe("apiSenzaCache", () => {
  const conSet = () => {
    const set = vi.fn();
    return { res: { set } as unknown as Response, set };
  };

  it("vieta la cache su ogni risposta /api/", () => {
    const { res, set } = conSet();
    const next = vi.fn();
    apiSenzaCache(mockReq({ path: "/api/auth/me" } as Partial<Request>), res, next);
    expect(set).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalled();
  });

  it("non tocca le pagine e i file statici", () => {
    const { res, set } = conSet();
    const next = vi.fn();
    apiSenzaCache(mockReq({ path: "/assets/index.js" } as Partial<Request>), res, next);
    expect(set).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
