// ponytail: make a consistent copy of the SQLite file (VACUUM INTO — safe while the app runs)
// usage: node ./src/backup.js [target-dir]
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getDb, dbPath } from "./db.js";
import { log } from "./log.js";

export function backup(targetDir) {
  const dir = resolve(targetDir || process.env.BACKUP_DIR || join(dirname(dbPath()), "backups"));
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(dir, `asakita-${stamp}.db`);
  // VACUUM INTO needs a literal, not a bound parameter → quote it ourselves (path is ours)
  getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  log.info("backup written", { target });
  return target;
}

// ponytail: warn when the data dir is not a mounted volume — on Render that means the data
// lives inside the container and is wiped on every deploy
export function assertPersistent(path) {
  try {
    const mounts = readFileSync("/proc/mounts", "utf8").split("\n");
    const dir = resolve(dirname(path));
    const ok = mounts.some((l) => {
      const p = l.trim().split(/\s+/)[1];
      return p && (dir === p || dir.startsWith(p.replace(/\/$/, "") + "/"));
    });
    if (!ok) {
      log.error("data directory is NOT a mounted volume — every deploy/restart wipes the database", { dir, db: path });
      return false;
    }
    log.info("data directory is on a mounted volume", { dir });
    return true;
  } catch {
    return true; // not Linux (local dev / tests) → nothing to check
  }
}

// run the backup only when this file is executed directly (not when imported by the API)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) backup(process.argv[2]);
