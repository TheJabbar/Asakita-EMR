# Asakita — EMR Lite + Parent Portal

Full-stack clinic system for a child development & therapy center. One monorepo, **two frontends, one API, one SQLite schema**:

| App | Who | What |
|---|---|---|
| `apps/emr` (port 5173) | dokter / terapis / admin / owner (desktop) | patients, schedule, SOAP, therapy, growth, reports, users |
| `apps/portal` (port 5174) | parents (mobile-first) | child profile, appointments, growth charts, screening, therapy summaries, education articles, reports |
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

First boot seeds demo accounts, two children, appointments, growth data and 5 articles (see `apps/api/src/seed.js`; re-running is idempotent).

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
apps/api/test/{unit,spec}/*.mjs                           # node:test suites
apps/emr/src/App.tsx      # internal EMR (hash routes, plain fetch)
apps/portal/src/App.tsx   # parent portal (hash routes, plain fetch)
packages/shared/src/index.ts  # roles, status machines, progress calc, report builder
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

## Non-goals

SATUSEHAT integration, payments beyond the read-only Billing tab, realtime chat, native apps, multi-clinic tenancy. Add when the clinic asks post-MVP.
