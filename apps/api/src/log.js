// ponytail: levelled stdout logs (Render captures stdout/stderr) — no dep. LOG_LEVEL=debug to verbose.
const LV = { debug: 0, info: 1, warn: 2, error: 3 };
const cur = LV[String(process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "error" : "info")).toLowerCase()] ?? 1;
function out(level, msg, meta) {
  if (LV[level] < cur) return;
  const extra = meta === undefined ? "" : ` ${typeof meta === "string" ? meta : JSON.stringify(meta)}`;
  (level === "warn" || level === "error" ? console.error : console.log)(`${new Date().toISOString()} ${level.toUpperCase()} ${msg}${extra}`);
}
export const log = {
  debug: (m, x) => out("debug", m, x),
  info: (m, x) => out("info", m, x),
  warn: (m, x) => out("warn", m, x),
  error: (m, x) => out("error", m, x),
};
