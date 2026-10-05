// ponytail: pure-TS helpers so both frontends + API + tests share one logic copy
export const ROLES = ["owner", "dokter", "terapis", "admin", "parent"] as const;
export type Role = (typeof ROLES)[number];

export const APPT_STATUS = ["scheduled", "confirmed", "waiting", "in_progress", "done", "cancelled"] as const;
export const APPT_NEXT: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["waiting", "in_progress", "cancelled"],
  waiting: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [], cancelled: [],
};

export const SCREENING_DOMAINS = [
  { key: "motorik_kasar", label: "Motorik Kasar", hint: "Berjalan, berlari, melompat" },
  { key: "motorik_halus", label: "Motorik Halus", hint: "Memegang, menyusun, menulis" },
  { key: "bahasa", label: "Bahasa", hint: "Berbicara, memahami, ekspresi" },
  { key: "sosial_emosional", label: "Sosial & Emosional", hint: "Interaksi, bermain, mandiri" },
  { key: "kognitif", label: "Kognitif", hint: "Memecahkan masalah, fokus" },
] as const;

export const ARTICLE_CATS = ["ASI", "MPASI", "stimulasi", "perilaku"] as const;
export const STIM_AGES = ["0-6", "6-12", "1-2", "2-3"] as const;
export const THERAPY_TYPES = ["Terapi Wicara", "Terapi Okupasi", "Sensori Integrasi"] as const;

// therapy progress % = done sessions / target (default target 12 per prototype)
export function therapyProgress(done: number, target = 12): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((done / target) * 100));
}

// latest screening per domain
export function latestPerDomain(rows: { domain: string; date: string }[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) m.set(r.domain, r);
  return m;
}

// report preview builder (shared FE + BE so PDF matches portal cover)
export function buildReportPreview(child: any, sessions: any[], growth: any[], from: string, to: string) {
  const n = sessions.length;
  const last = growth[growth.length - 1];
  return {
    childName: child?.full_name ?? "-",
    period: `${from} – ${to}`,
    sessions: n,
    lastWeight: last?.weight_kg ?? null,
    summary: `Anak menunjukkan ${n > 0 ? `perkembangan dari ${n} sesi terapi` : "data awal"} pada periode ${from}–${to}.`,
    recommendations: ["Lanjutkan terapi sesuai jadwal", "Stimulasi kosakata 10 mnt/hari", "Evaluasi ulang 4 minggu"],
  };
}

export function canAccess(role: string, action: "soap:write" | "users:write" | "patients:write"): boolean {
  if (role === "owner" || role === "dokter") return true;
  if (action === "soap:write") return false; // terapis read-only SOAP, admin no SOAP
  if (action === "users:write") return false;
  if (action === "patients:write") return role === "admin";
  return false;
}

// deep-scan for raw SOAP leak in portal payloads (used by security test + BE guard)
export function containsSoapKeys(obj: any): boolean {
  const s = JSON.stringify(obj ?? {});
  return /"subjective"|"objective"/.test(s);
}
