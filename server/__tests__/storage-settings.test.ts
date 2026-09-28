import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";

describe("MemStorage — app settings", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("sets, overwrites and reads a setting", async () => {
    await s.setSetting("ws.auth", "abc");
    expect(await s.getSetting("ws.auth")).toBe("abc");
    await s.setSetting("ws.auth", "xyz");
    expect(await s.getSetting("ws.auth")).toBe("xyz");
    expect(await s.getSetting("missing")).toBeUndefined();
  });

  it("returns all settings as a record", async () => {
    await s.setSetting("a", "1");
    await s.setSetting("b", "2");
    expect(await s.getAllSettings()).toEqual({ a: "1", b: "2" });
  });
});

describe("MemStorage — sync logs", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("creates, updates and lists sync logs newest-first", async () => {
    const l1 = await s.createSyncLog({ trigger: "manuale" });
    expect(l1.status).toBe("running");
    const updated = await s.updateSyncLog(l1.id, {
      status: "success",
      finishedAt: new Date(),
      entityCounts: JSON.stringify({ conduttori: 3 }),
    });
    expect(updated?.status).toBe("success");
    expect(updated?.entityCounts).toBe(JSON.stringify({ conduttori: 3 }));

    await s.createSyncLog({ trigger: "notturno" });
    const recent = await s.getRecentSyncLogs(10);
    expect(recent.length).toBe(2);
    expect(recent[0].trigger).toBe("notturno"); // newest first
  });
});
