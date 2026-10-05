import { describe, it, expect } from "vitest";
import { therapyProgress, latestPerDomain, buildReportPreview, canAccess, containsSoapKeys } from "../src/index.js";

describe("shared", () => {
  it("therapy progress %", () => {
    expect(therapyProgress(6)).toBe(50);
    expect(therapyProgress(12)).toBe(100);
    expect(therapyProgress(20)).toBe(100);
  });
  it("latest per domain", () => {
    const m = latestPerDomain([{ domain: "bahasa", date: "2026-01-01" }, { domain: "bahasa", date: "2026-02-01" }]);
    expect(m.get("bahasa").date).toBe("2026-02-01");
  });
  it("report preview builder", () => {
    const p = buildReportPreview({ full_name: "A" }, [{}, {}], [{ weight_kg: 13 }], "2026-07-01", "2026-09-30");
    expect(p.sessions).toBe(2); expect(p.lastWeight).toBe(13);
  });
  it("role matrix: terapis/admin cannot soap-write or users-write", () => {
    expect(canAccess("terapis", "soap:write")).toBe(false);
    expect(canAccess("admin", "soap:write")).toBe(false);
    expect(canAccess("dokter", "soap:write")).toBe(true);
  });
  it("soap leak detector", () => {
    expect(containsSoapKeys({ subjective: "x" })).toBe(true);
    expect(containsSoapKeys({ summary: "ok" })).toBe(false);
  });
});
