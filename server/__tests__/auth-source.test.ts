import { describe, it, expect } from "vitest";
import { AUTH_SOURCES, insertAppUserSchema } from "@shared/schema";

describe("AUTH_SOURCES", () => {
  it("sono esattamente locale e ad", () => {
    expect([...AUTH_SOURCES]).toEqual(["locale", "ad"]);
  });
});

describe("insertAppUserSchema", () => {
  it("accetta authSource ad", () => {
    const r = insertAppUserSchema.safeParse({
      username: "m.rossi",
      passwordHash: null,
      role: "user",
      authSource: "ad",
    });
    expect(r.success).toBe(true);
  });

  it("rifiuta una sorgente sconosciuta", () => {
    const r = insertAppUserSchema.safeParse({
      username: "m.rossi",
      passwordHash: "x",
      role: "user",
      authSource: "ldap",
    });
    expect(r.success).toBe(false);
  });

  it("il default e' locale", () => {
    const r = insertAppUserSchema.parse({
      username: "admin",
      passwordHash: "x",
      role: "admin",
    });
    expect(r.authSource).toBe("locale");
  });
});
