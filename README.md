# Asakita — EMR Lite + Parent Portal

Full-stack clinic system for a child development & therapy center. One monorepo, **two frontends, one API, one SQLite schema**:

| App | Who | What |
|---|---|---|
| `apps/emr` (port 5173) | dokter / terapis / admin / owner (desktop) | patients, schedule, SOAP, therapy, growth curve (WHO/CDC), Denver checklist, billing, reports, users |
| `apps/portal` (port 5174) | parents (mobile-first) | child profile, appointments, growth charts, screening, Denver summary, home-program tracking, billing summary, education articles, reports |
| `apps/api` (port 8787) | — | Hono + `node:sqlite` stdlib (no native deps). Same SQL ships to Cloudflare D1 in prod |

Source prototypes: `asakita_emr_prototype.html`, `asakita_parent_portal_prototype.html`.
Build reference: `IMPLEMENTATION_PLAN.md` (architecture, DB schema, API contract, test plan).

> **NOTE — local containers: Podman only.** This project uses **Podman, not Docker**, for all local container work (`podman build`, `podman compose`). There is no Docker daemon requirement anywhere. The `Dockerfile`/`compose.yml` are daemon-less OCI specs and build fine under Podman. If a doc or script mentions `docker …`, read it as `podman …`.

## Prerequisites

- Node.js 22+ (uses the `node:sqlite` builtin; tested on Node 25)
- **Podman** 4+ (`podman --version`) — the only container runtime needed locally
- No other services: SQLite is a file, uploads are a directory, no Redis/Postgres

## Quickstart — Podman (recommended local run)

```powershell
# 1. Build + start (migrate + seed run automatically on first boot)
podman compose up --build -d

# 2. Open the apps
#    API:    http://localhost:8787/api/healthz
#    EMR + Portal run as Vite dev servers (see "Serving frontends"):
#    EMR:    http://localhost:5173   (npm run dev:emr)
#    Portal: http://localhost:5174   (npm run dev:portal)

# 3. Follow logs / stop
podman compose logs -f
podman compose down        # data kept in volume asakita-data
podman compose down -v     # danger: deletes the SQLite volume too
```

First boot seeds demo accounts, three children (with BB/TB/LK growth curves), appointments, therapy sessions, a home program, Denver checklist items, billing rows and 14 articles (see `apps/api/src/seed.js`; re-running is idempotent).

Bulk import real data from Excel: fill `apps/api/import-template.csv` (or Save As CSV from Excel — `,` and `;` separators both work), then:

```powershell
npm run db:import -- pasien.csv   # parents + children + links; existing mr_number rows are skipped, password defaults to `prototype` unless the column sets one
```

Data persists in the named volume `asakita-data` (`/data/asakita.db` + `/data/uploads`). To back it up:

```powershell
podman volume inspect asakita-data
podman run --rm -v asakita-data:/data -v ${PWD}:/backup alpine cp /data/asakita.db /backup/asakita-$(Get-Date -Format yyyyMMdd).db
```

## Dev without containers (hot reload)

Three terminals:

```powershell
npm install
npm run db:migrate && npm run db:seed   # one-time (./data/asakita.db)
npm run dev:api      # :8787
npm run dev:emr      # :5173
npm run dev:portal   # :5174
```

Point the frontends at the API: `apps/emr/.env` / `apps/portal/.env` → `VITE_API_URL=http://localhost:8787`.

## Clinical features

| Feature | Where | Data source |
|---|---|---|
| **Kurva tumbuh kembang** (BB / TB / LK + z-score + persentil) | EMR → Tumbuh Kembang, Portal → Grafik pertumbuhan | WHO Child Growth Standards (< 5 tahun) via `who-growth-standards` (npm, tabel LMS resmi, offline) + CDC 2000 (5–19 tahun) via `apps/api/src/reference/cdc-lms.json` (LMS resmi, di-vendor dari cdc.gov). Acuan dipilih otomatis per usia, bisa diganti manual. Tanggal selalu ditulis **DD-MM-YYYY**. |
| **Checklist Denver** (4 domain × 8 rentang usia, status lulus/belum/tidak ada info) | EMR → Tumbuh Kembang → tab **Checklist Denver**, Portal → Perkembangan (checklist usia anak + skor) | `apps/api/src/denver.js` (katalog item), skor per domain + penanda keterlambatan/lebih cepat |
| **Resep latihan + tracking harian** | EMR → Terapi (tulis resep per sesi), Portal → Resep latihan (centang per hari) | `home_programs` + `home_program_items` |
| **Billing & cetak struk** (IDR) | EMR → Data Pasien → Billing, Portal → Tagihan | `billing_items` + `service_prices` (harga default dapat diubah), struk PDF + cetak (`window.print`) |

Regenerasi tabel CDC (opsional, butuh unduhan CSV dari cdc.gov):

```powershell
node apps/api/scripts/build-cdc-data.mjs <folder-dengan-wtage.csv,statage.csv,bmiagerev.csv>
```

## Production checklist (Render)

- Deploy = push to `main` (Render Blueprint `render.yaml`, auto-deploy, health check `/api/healthz`).
- **Data persistence (check this first!).** The database must live on a Render **disk mounted at `/data`** — otherwise the SQLite file lives inside the container and *every deploy/restart wipes all records*. Attach the disk in the Render dashboard (Disk `asakita-data` → mount path `/data`), then confirm the boot log says `data directory is on a mounted volume`; if it says `NOT a mounted volume`, stop and fix the disk before using the service with real data.
- Manual backup (safe while the app runs): `npm run db:backup -w apps/api` → timestamped copy in `<db dir>/backups` via `VACUUM INTO`.
- Required env: `DATABASE_URL=file:/data/asakita.db`, `UPLOADS_DIR=/data/uploads`, `JWT_SECRET` (set in the dashboard — **not** in the repo), optional `GOOGLE_CLIENT_ID`, `FRONTEND_ORIGINS`.
- Data lives on the Render disk (`asakita-data` → `/data`); back it up with `wrangler d1`-style dumps only for the Cloudflare path — for Render use a disk snapshot or `sqlite3 .backup`.
- Schema changes must be additive: `migrate()` runs `CREATE TABLE IF NOT EXISTS` on every boot, so new tables appear on deploy; never rename or drop a column in place.
- Reference data that the API reads at boot (e.g. `apps/api/src/reference/cdc-lms.json`) **must be committed** — check with `git ls-files apps/api/src/reference`.
- After a deploy, run `BASE=https://asakita-emr.onrender.com node tools/browser-qa.cjs` (46 checks) before declaring the release good.

## Roadmap — Supabase (planned)

The app currently runs on SQLite (`node:sqlite`, file in `/data`) — fine for the demo. Moving to Supabase (Postgres) touches these places:

| Today (SQLite) | Supabase (Postgres) |
|---|---|
| `node:sqlite` + `apps/api/src/db.js` (`rows/row/run`) | `pg` pool (same three helpers → the rest of the code barely changes) |
| `INSERT OR REPLACE INTO` | `INSERT … ON CONFLICT (pk) DO UPDATE` (a dozen statements in seed/denver/home) |
| `group_concat(u.name …)` (parent names) | `string_agg(u.name …, ', ')` |
| `substr(created_at,1,7)`, `date(starts_at)` | `to_char(created_at,'YYYY-MM')`, `starts_at::date` |
| `PRAGMA foreign_keys` | real FK constraints (safe once data is clean) |
| local file uploads (`/data/uploads`) | Supabase Storage bucket + signed URLs |
| JWT cookie from `apps/api/src/auth.js` | keep as-is (simplest), or swap to Supabase Auth sessions |

Schema itself is portable — the tables are plain columns; only the dialect above changes.

## Demo accounts (password: `prototype`)

| Email | Role | Where |
|---|---|---|
| `dokter@asakita.demo` | dokter (full access) | EMR |
| `terapis@asakita.demo` | terapis (therapy write, SOAP read-only) | EMR |
| `admin@asakita.demo` | admin (patients/schedule, no SOAP write) | EMR |
| `owner@asakita.demo` | owner (full access) | EMR |
| `alya@example.com` | parent (child: Arslan) | Portal |
| `budi@example.com` | parent (child: Budi Jr — used for IDOR tests) | Portal |

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | API listen port |
| `DATABASE_URL` | `file:./data/asakita.db` | SQLite file (`file::memory:` in tests) |
| `UPLOADS_DIR` | `./data/uploads` | Document uploads (served from `/data` volume in container) |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin (never `*` with credentials) |
| `JWT_SECRET` | `dev-secret-change-me` | **Set in prod** — signs auth cookies |
| `GOOGLE_CLIENT_ID` | _(unset)_ | Google OAuth client ID — enables the real "Masuk dengan Google" button (ID token verified server-side; unset = button hidden). Create at Google Cloud Console → APIs & Services → Credentials; add the app URL under Authorized JavaScript origins |
| `LOG_LEVEL` | `info` | Log verbosity: `debug` (every request incl. pages/assets), `info` (API requests + boot, default), `warn`, `error`. Logs go to stdout → visible in Render Logs |
| `VITE_API_URL` | `http://localhost:8787` | Baked into frontend builds |

## Serving frontends

- Dev: Vite servers on :5173/:5174 proxy nothing — they call `VITE_API_URL` directly.
- Container/prod-preview: the API image copies both `dist/` outputs and serves them (EMR at `/`, portal at `/portal` — wiring in `apps/api/src/index.js`).

## Testing (post-dev gate — must be green before deploy)

```powershell
npm run test:unit      # API EMR loop (node:test) + shared logic (vitest)
npm run test:security  # auth, RBAC matrix, IDOR, SOAP-leak scan, injection, upload abuse, rate-limit, headers
npm run check          # tsc --noEmit
```

Browser smoke test (end-to-end, real Chromium): walks the EMR and the parent portal — login, dashboard,
patient tabs, billing + struk, growth curve with WHO/CDC bands, Denver checklist, therapy + resep,
schedule, reports, users, and the portal pages (growth, screening, resep tracking, tagihan, artikel).
Needs a local Edge/Chrome and `playwright-core` (dev-only, not a project dependency):

```powershell
npm i -D playwright-core
node tools/browser-qa.cjs                                        # local instance on :8787
BASE=https://asakita-emr.onrender.com node tools/browser-qa.cjs  # production
```

The script writes QA rows only in the browser flow it exercises (billing items are deleted again);
it prints the ids of anything left behind so it can be cleaned up.

Design note: API suites run on **`node:test` stdlib**, not vitest — vitest 2.1's bundler cannot load the experimental `node:sqlite` builtin. Don't move them back until the runner supports it (see `IMPLEMENTATION_PLAN.md` §12).

## Deploy to Cloudflare (prod)

Frontends → Pages, API → Workers, DB → D1 (SQLite-compatible), files → R2. Same Hono app, DB client switches to the D1 binding:

```powershell
wrangler d1 create asakita-prod          # put id in wrangler.toml
wrangler d1 migrations apply --remote
wrangler r2 bucket create asakita-docs
wrangler deploy
# Pages: apps/emr → emr.asakita.id, apps/portal → portal.asakita.id
# secrets: JWT_SECRET, RESEND_API_KEY, GOOGLE_CLIENT_ID
```

Nightly: `wrangler d1 export` → R2 (retain 30d).

## Project structure

```
apps/api/src/{index.js,db.js,auth.js,seed.js,migrate.js}  # Hono app, node:sqlite, scrypt+HMAC auth
apps/api/src/{guard.js,growth.js,denver.js,home.js,billing.js,pdf.js,constants.js}  # auth guards + clinical features
apps/api/src/reference/cdc-lms.json  # vendored CDC 2000 LMS tables (weight/stature/BMI, 2-20y)
apps/api/test/{unit,spec}/*.mjs                           # node:test suites
apps/emr/src/App.tsx      # internal EMR (hash routes, plain fetch)
apps/portal/src/App.tsx   # parent portal (hash routes, plain fetch)
packages/shared/src/index.ts  # roles, status machines, progress calc, report builder
packages/shared/src/growth-chart.ts  # chart geometry shared by EMR + portal
Dockerfile  compose.yml  wrangler.toml  IMPLEMENTATION_PLAN.md
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `podman compose` warns about external compose provider | Harmless on Windows — it still drives Podman containers |
| Port 8787 in use | `podman compose down` or set `PORT=8788` |
| Fresh DB wanted | `podman compose down -v && podman compose up --build -d` (deletes volume) |
| `ENOSPC` running vitest (Windows, full C: drive) | Redirect temp: `$env:TEMP="D:\temp\tmp"; $env:TMP="D:\temp\tmp"` then rerun |
| Parent sees empty portal | Log in with a parent account linked via `parent_children` (staff accounts get 403 on `/api/portal/*` by design) |
| Terapis/admin gets 403 writing SOAP | By design — only owner/dokter write SOAP (§3 of plan) |
| Render build fails with `ENOENT .../reference/cdc-lms.json` | The CDC tables must be committed: `git ls-files apps/api/src/reference` (a bare `data/` ignore rule once hid them) |
| EMR and portal log each other out in production | Both share one origin → the frontends send `X-Asakita-App: emr\|portal` and the API picks the matching cookie; don't remove that header |
| Google login button looks unstyled | CSP must allow `style-src https://accounts.google.com` (GIS injects its own stylesheet) |

## Non-goals

SATUSEHAT integration, payments beyond the read-only Billing tab, realtime chat, native apps, multi-clinic tenancy. Add when the clinic asks post-MVP.
