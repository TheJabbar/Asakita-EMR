# Asakita — Full-Stack Implementation Plan
**Source prototypes:** `asakita_emr_prototype.html` (internal EMR Lite, desktop) + `asakita_parent_portal_prototype.html` (parent portal, mobile)
**Target stack:** Node.js + Vite + TypeScript (full-stack), SQLite, Docker, Cloudflare deploy
**Audience:** AI agent building the app in phases. Follow this file top-to-bottom. No extra frameworks unless listed.

## 0. What to build (one sentence)
One monorepo, two frontends sharing one API + one SQLite schema: (A) internal EMR for dokter/terapis/admin/owner, (B) mobile-first parent portal showing only curated data for that parent's children.

## 1. Tech decisions (locked, do not swap without asking)
| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere (`strict: true`) | One type system shared FE↔BE |
| Frontend (both apps) | Vite + React + React Router + TanStack Query + Tailwind | Matches `vite.ts` requirement; Query kills manual fetch state |
| Forms/validation | React Hook Form + Zod (shared schemas in `packages/shared`) | Single source of truth, reused server-side |
| Backend | Node 22 + Hono + `drizzle-orm` (better-sqlite3 locally) | Hono runs on Node AND Cloudflare Workers unchanged; Drizzle gives typed SQLite migrations |
| Auth | Email/password (bcrypt/s comparable `oslo/password` or `bcryptjs`) + Google OIDC + session JWT (httpOnly cookie, 7d) + RBAC middleware | Covers both prototype logins |
| DB dev/local | SQLite file `./data/asakita.db` via better-sqlite3 | Zero setup, matches requirement |
| DB prod | Cloudflare D1 (SQLite-compatible) via `drizzle-orm/d1` adapter | Only SQLite-compatible serverless option on Cloudflare; same SQL, same Drizzle schema |
| File uploads (Akte, Assessment, Rujukan) | Local `S3-compatible`: Cloudflare R2; dev = local `./data/uploads` | Same API (`PUT /api/documents/:id/file`), storage driver switch by env |
| PDF | Server-side render with `react-pdf` OR headless template → `pdf-lib`; email via Resend/SMTP env var | Covers Resume/Laporan Download + Email buttons |
| Deploy | Docker for local/preview; prod = Cloudflare Pages (both frontends) + Cloudflare Workers (API) + D1 + R2 | Requirement says Docker + Cloudflare; this is the standard split |
| Testing | Vitest + Supertest-style (`@hono/node-server` + fetch) for API; 1 happy-path test per module | Minimal, per ponytail rule |

> Env switch pattern: `db.ts` exports `getDb()` — returns better-sqlite3 client if `DATABASE_URL=file:...`, D1 client if `CF_D1_BINDING` present. All queries go through Drizzle so SQL stays identical.

## 2. Monorepo layout (fewest files that works)
```
asakita/
  package.json (workspaces: apps/*, packages/*, turbo-less: npm -w scripts)
  Dockerfile            # local full-stack preview (see §8)
  Dockerfile.api        # optional split build
  wrangler.toml         # workers + d1 + r2 bindings (see §9)
  apps/
    emr/                # Vite React — internal EMR (port 5173)
      src/pages/{Login,Dashboard,Patients,PatientDetail,Schedule,Soap,SoapNew,Therapy,Progress,Reports,Users}.tsx
    portal/             # Vite React — parent portal mobile-first (port 5174)
      src/pages/{Welcome,Dashboard,ChildProfile,Appointments,Growth,Screening,Therapy,TherapySession,Education,Reports,Stimulation,Account}.tsx
    api/                # Hono Node server (port 8787)
      src/{index.ts,routes/*.ts,middleware/{auth.ts,rbac.ts},db/{schema.ts,client.ts},lib/{pdf.ts,mail.ts,storage.ts}}
      drizzle/          # SQL migrations (generated)
  packages/
    shared/             # zod schemas + types + constants (roles, therapy types, screening domains)
      src/{schemas.ts,types.ts,constants.ts}
```

Build order for agent: `packages/shared` → `apps/api` → `apps/emr` → `apps/portal`. Never start FE before its API route returns 200 locally.

## 3. Roles & access matrix (enforce server-side, mirror in UI)
| Role | EMR access | Portal access |
|---|---|---|
| `owner` / `dokter` | everything | n/a (staff login only) |
| `terapis` | Dashboard(read), Schedule, Therapy+Progress (write own sessions), SOAP read-only | n/a |
| `admin` | Patients CRUD, Schedule CRUD, Documents, no SOAP write | n/a |
| `parent` | none (blocked from `/api/staff/*`) | only `children` linked via `parent_children`, sees curated views (§5) |

Middleware: `requireAuth` → `requireRole(...allowed)`. Parent endpoints additionally check `parent_children.parent_id = jwt.sub`. Audit log every SOAP/therapy/report write (`audit_logs` table).

## 4. Database schema (SQLite/D1 — Drizzle, ~15 tables, covers both prototypes)
```sql
-- ponytail: single-file schema, add indexes only if list pages slow
users(id TEXT PK, name, email UNIQUE, password_hash NULLABLE, google_sub NULLABLE, role TEXT, status TEXT DEFAULT 'active', created_at);
parents(id TEXT PK, user_id FK users, phone, address);           -- parent profile (portal Account)
children(id TEXT PK, mr_number UNIQUE, full_name, nickname, dob, gender, blood_type, birth_weight_kg, birth_length_cm, address, insurance, status DEFAULT 'active', photo_url);
parent_children(parent_id FK, child_id FK, relation TEXT);       -- PK(parent_id,child_id)
medical_history(child_id FK PK, birth_history, allergies, notes);
appointments(id PK, child_id FK, type TEXT, room, staff_id FK users, starts_at, ends_at, status TEXT); -- statuses: scheduled|confirmed|waiting|in_progress|done|cancelled
visits(id PK, child_id FK, appointment_id FK NULLABLE, date, visit_type, status TEXT DEFAULT 'draft'); -- draft|final
soap_notes(visit_id FK PK, subjective, objective, assessment, plan, created_by FK users, updated_at);
therapy_types(id PK, name UNIQUE); -- seed: Wicara, Okupasi, Sensori Integrasi
therapy_sessions(id PK, child_id FK, type_id FK, date, target, activities JSON, response, therapist_id FK users, home_recommendation);
growth_records(id PK, child_id FK, date, weight_kg, height_cm, head_cm, recorded_by FK users);
milestones(child_id FK, key TEXT, label, status TEXT, updated_at); -- PK(child_id,key); statuses: achieved|in_progress|concern
therapy_programs(child_id FK, type_id FK, frequency, status TEXT); -- PK(child_id,type_id)
screenings(id PK, child_id FK, date, domain TEXT, result TEXT, note); -- domains: motorik_kasar|motorik_halus|bahasa|sosial_emosional|kognitif
documents(id PK, child_id FK, kind TEXT, title, file_url, uploaded_by FK users, created_at);
articles(id PK, slug UNIQUE, title, category TEXT, author, body_md, age_tag, published_at); -- category: ASI|MPASI|stimulasi|perilaku
reports(id PK, child_id FK, period_start, period_end, summary, recommendations, pdf_url, created_by FK users, created_at);
home_recommendations(id PK, child_id FK, therapy_session_id FK NULLABLE, title, detail, done INTEGER DEFAULT 0);
audit_logs(id PK, actor_id FK users, action, entity, entity_id, at, meta JSON);
```
Seed on `migrate`: 4 staff users (dokter/terapis/admin/owner per prototype §akses), 1 parent `alya@example.com` + child Arslan, therapy_types, 5 articles, demo appointments/soap/therapy/growth matching prototype content.

## 5. API contract (Hono, prefix `/api`, JSON; every route Zod-validated with shared schemas)
```
POST /api/auth/login {email,password} -> {user} (sets cookie)
POST /api/auth/google {idToken} -> {user}
POST /api/auth/logout | POST /api/auth/register-parent {name,email,password} (portal Daftar)
GET  /api/me
GET  /api/dashboard/summary -> {totalPatients, monthlyNew, todayCount, waitingCount, therapyDone, followUp, todayTimeline[], monthlyChart[]}
GET  /api/search?q= -> {patients[], appointments[]}            # EMR topbar search
CRUD /api/patients + GET /:id/{history,documents} + POST /:id/documents (multipart→R2/local)
CRUD /api/appointments?from=&to=&childId= (status transitions PATCH /:id/status)
CRUD /api/visits + PUT /api/visits/:id/soap (draft|final)       # Save Draft vs Simpan & Lanjut
CRUD /api/therapy-sessions?childId=&typeId=
CRUD /api/growth?childId= + CRUD /api/milestones + /api/therapy-programs
GET  /api/reports/preview?childId=&from=&to= -> {html/json}    # feeds PDF + portal report cover
POST /api/reports {childId,period} -> {report,pdfUrl} | GET /api/reports/:id/pdf (binary)
POST /api/reports/:id/email {to}
GET  /api/users (owner/dokter only) + CRUD (Tambah User)
# Portal (all requireRole('parent'), auto-scoped to own children):
GET  /api/portal/children | GET /api/portal/children/:id (curated: no raw SOAP)
GET  /api/portal/appointments?scope=upcoming|history + POST /api/portal/appointment-requests
GET  /api/portal/growth/:childId?type=weight|height|head
GET  /api/portal/screening/:childId (5 domains latest) | GET /api/portal/therapy/:childId (progress % = done/total per type)
GET  /api/portal/sessions/:id (session detail incl. home rec)
GET  /api/articles?category=&q= | GET /api/articles/:slug
GET  /api/portal/stimulation?age=0-6|6-12|1-2|2-3
GET  /api/portal/reports?childId=&from=&to=
```
Error shape: `{error:{code,message}}`. Pagination: `?page=&limit=` → `{data,total}`. Curated-portal rule: portal therapy/session/report endpoints must never return `soap_notes.subjective/objective` verbatim — only `summary/recommendations`.

## 6. Frontend page map (prototype screen → route → API)
**EMR (`apps/emr`, desktop shell: sidebar + topbar + search):**
| Prototype | Route | Key UI + wiring |
|---|---|---|
| Login | `/login` | email/pass + Google button + Lupa Password link; `POST /auth/*`; redirect `/` |
| Dashboard | `/` | 4 stat cards, today timeline, monthly bar chart (CSS/SVG as prototype), notifications, quick actions → `GET /dashboard/summary` |
| Data Pasien | `/patients`, `/patients/:id` | table + hero header + 6 tabs (Ringkasan/Data Pribadi/Riwayat/Dokumen/Billing/Catatan); Upload → `POST patients/:id/documents`; "+ Buat Kunjungan" → `/visits/new?childId=` |
| Jadwal | `/schedule` | weekly table, Tambah Jadwal modal, status badge transitions |
| SOAP | `/visits/:id/soap` | 4 textareas S/O/A/P, visit-type select, [Simpan Draft] vs [Simpan & Lanjut ke Terapi] |
| Terapi | `/therapy` (+ `?sessionId=`) | session form: date/type/target/activities checklist/eval/home-rec → `POST /therapy-sessions` |
| Progress | `/progress/:childId` | SVG growth curve, milestone pills, program cards → growth/milestones/programs APIs |
| Laporan | `/reports` | print-card preview + [Download PDF][Email][Cetak][Simpan] → reports APIs |
| Users | `/users` | role table + Tambah User (owner/dokter only) |

**Portal (`apps/portal`, phone frame, bottom-nav: Beranda/Jadwal/Perkembangan/Edukasi/Profil):**
| Prototype screen | Route | Key UI + wiring |
|---|---|---|
| Welcome/Login | `/welcome` | Masuk/Daftar/Tamu → guest = read-only demo child |
| Dashboard | `/` | greeting, child-card, 4 tiles, article picks → portal children/appointments/articles |
| Profil Anak | `/child/:id` | tabs Data Dasar/Riwayat/Kontak/Dokumen (read-only + Edit request → creates admin task) |
| Jadwal | `/appointments` | Akan Datang/Riwayat tabs, appt cards, "+ Buat Janji" → appointment-request, mini calendar |
| Growth | `/growth/:childId` | BB/TB/LK tabs, chart-card + note → portal growth |
| Screening | `/screening/:childId` | 5 domain rows with pills → portal screening |
| Therapy/Session | `/therapy/:childId`, `/sessions/:id` | progress bars %, home-rec list → portal therapy |
| Edukasi | `/education` | category tabs + article cards → articles API |
| Reports | `/reports` | period picker + report-cover + Download/Email |
| Stimulasi | `/stimulation` | age tabs 0–6/6–12/1–2/2–3 → stimulation API |
| Akun | `/account` | parent info-table + Keluar |

Shared: `packages/shared/constants.ts` holds statuses, roles, age bands, screening domains so badges/pills stay consistent across both apps.

## 7. Build phases (agent executes in order; each phase ends with `npm run check` green)
- **P0 Scaffold (0.5d):** monorepo + shared zod schemas + Hono `GET /healthz` + both Vite shells (login + one list page each) + SQLite migrate + seed. ✅ `docker compose up` shows both apps.
- **P1 Auth+RBAC (1d):** login/Google/guest/logout, `requireAuth/requireRole`, parent↔child scoping, Users page. ✅ terapis cannot POST SOAP; parent cannot hit `/api/patients`.
- **P2 EMR core (2d):** patients CRUD+tabs+upload, appointments CRUD+status, visits+SOAP draft/final flow. ✅ create patient → schedule → SOAP draft → finalize.
- **P3 Therapy+Growth (1.5d):** therapy sessions/programs, growth/milestones/screenings, Progress page curves. ✅ session save updates portal progress %.
- **P4 Reports+Articles (1d):** report preview/PDF/email/print, articles CRUD (admin) + education list/detail. ✅ PDF downloads, email received in Mailhog/local log.
- **P5 Portal (1.5d):** all 12 portal routes wired to portal APIs, guest mode, bottom-nav, appointment-request flow. ✅ parent sees only own child.
- **P6 Hardening+Ship (1d):** audit logs, rate-limit login, backup script (`sqlite3 .backup` cron/sidecar), Docker prod build, wrangler D1 migrate + deploy. ✅ acceptance checklist §10 all pass.
- **P7 Testing — unit + security (1d, runs AFTER dev, before deploy):** see §12. Gate: `npm run test:unit` + `npm run test:security` green in CI/Docker; no deploy on red.

Total ~8–9 dev-days for one agent; do not parallelize phases (schema churn).

## 8. Docker (local parity + preview)
```dockerfile
# Dockerfile (single preview image, ponytail: split later if cold-start matters)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # builds shared + api + emr + portal
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/apps/api/dist ./api
COPY --from=build /app/apps/emr/dist ./public/emr
COPY --from=build /app/apps/portal/dist ./public/portal
ENV DATABASE_URL=file:/data/asakita.db UPLOADS_DIR=/data/uploads PORT=8787
VOLUME ["/data"]
EXPOSE 8787
CMD ["node","api/index.js"]
```
`compose.yml`: one service + named volume `asakita-data`; `npm run db:migrate && npm run db:seed` as entrypoint pre-step. Dev override runs 3 Vite/Hono processes with hot reload.

## 9. Cloudflare deploy (prod)
- **Frontends → Pages:** `apps/emr` → `emr.asakita.id`, `apps/portal` → `portal.asakita.id` (or `/portal` route). Build cmd `npm run build --workspace=apps/emr`. Env `VITE_API_URL=https://api.asakita.id`.
- **API → Workers:** `apps/api` with `wrangler.toml`: `compatibility_date=2026-01-01`, `[[d1_databases]] binding=DB database_name=asakita-prod`, `[[r2_buckets]] binding=FILES bucket=asakita-docs`, `[vars] FRONTEND_ORIGIN`. Same Hono app, DB client auto-switches to D1 binding.
- **Steps:** `wrangler d1 create asakita-prod` → `wrangler d1 migrations apply` → `wrangler r2 bucket create` → `wrangler deploy` → Pages deploy → set `RESEND_API_KEY/GOOGLE_CLIENT_ID` secrets → smoke test §10 against prod URLs.
- Backups: nightly `wrangler d1 export` to R2 (retain 30d). SQLite file backup covers Docker/self-host fallback.

## 10. Acceptance checklist (must all pass before "done")
- [ ] Staff login/Google/guest-portal; forgot-password sends reset link (log in dev).
- [ ] RBAC: terapis blocked from Users (403), admin blocked from SOAP write (403), parent blocked from staff routes (403), parent A cannot fetch parent B child (404).
- [ ] Full EMR loop: add patient → schedule → SOAP draft → finalize → therapy session → growth entry → milestone updates → report PDF downloads + emails.
- [ ] Portal loop: parent login → sees only own child(ren) → upcoming/history correct → growth chart renders → screening 5 domains → therapy % matches EMR → session detail + home rec visible → article filter works → report PDF matches EMR preview.
- [ ] Uploads round-trip (PDF/JPG ≤10MB) locally and via R2 in staging.
- [ ] `docker compose up --build` cold start works with seed; `wrangler deploy` + D1 migrate works from clean checkout following §9 only.
- [ ] `npm run check` (tsc + vitest, ≥1 passing test per API module) green.
- [ ] `npm run test:unit` green (see §12.1) + `npm run test:security` green (see §12.2), run AFTER dev complete, before Cloudflare deploy.

## 12. Testing — unit + security (P7, post-dev gate)
Run order: `npm run test:unit` → `npm run test:security` → fix → re-run → deploy. API suites run on `node:test` stdlib (`apps/api/test/**/*.mjs`, via `app.request()` — no live port, no bundler); FE/shared pure logic stays on vitest (`packages/shared/test`). Rationale: vitest 2.1's bundler cannot load the experimental `node:sqlite` builtin (strips `node:` prefix → `Failed to load url sqlite`); `node:test` runs it natively. Do NOT move API tests back to vitest until the runner supports `node:sqlite`.

### 12.1 Unit tests (`npm run test:unit` → `vitest run apps/api/test/unit apps/portal/src packages/shared`)
- `shared.test.ts`: growth-status helper, therapy-progress % calc, screening-domain constants (5 domains), report-preview builder, role matrix.
- `patients.test.ts`: CRUD child + medical_history round-trip; mr_number unique enforced.
- `appointments.test.ts`: create → status transitions scheduled→confirmed→done; invalid transition 400.
- `soap.test.ts`: draft save → finalize; finalized visit immutable (409 on re-PUT).
- `therapy.test.ts`: session create → portal progress % increases; activities JSON round-trip.
- `growth.test.ts`: growth insert → milestone upsert → screening latest-per-domain query.
- `reports.test.ts`: preview returns summary+recs; PDF endpoint returns `%PDF` magic bytes; email logs to outbox in test env.
- `articles.test.ts`: category filter (ASI/MPASI/stimulasi/perilaku) + slug fetch.

### 12.2 Security tests (`npm run test:security` → `vitest run apps/api/test/security`)
Must all pass; any failure blocks deploy:
1. **Auth:** wrong password 401; unauthenticated `GET /api/patients` 401; expired/tampered JWT 401.
2. **RBAC matrix:** terapis `GET /api/users` 403; admin `PUT /:id/soap` 403; parent `GET /api/patients` 403; staff token on `/api/portal/*` 403.
3. **IDOR / scoping:** parent A `GET /api/portal/children/:childOfB` 404; parent A cannot list B appointments; `POST /api/portal/appointment-requests` with foreign childId 404.
4. **Curated-portal leak:** portal therapy/session/report JSON must NOT contain keys `subjective|objective` (assert deep-scan); raw SOAP only via staff route.
5. **Injection:** `' OR '1'='1` in login + search `q` returns 401/empty, no dump; Zod rejects oversized body (>1MB) with 400.
6. **Upload abuse:** `.exe`/25MB upload 400; path-traversal filename (`../../x`) sanitized to basename.
7. **Rate-limit:** 20 rapid `POST /auth/login` from same IP → 429 on 21st (in-memory bucket, exempt in `NODE_ENV=test` except this test).
8. **Headers/CORS:** `content-security-policy`, `x-frame-options: DENY`, ` existen` present; `Access-Control-Allow-Origin` equals `FRONTEND_ORIGIN`, never `*` with credentials.
9. **Audit:** every SOAP-finalize + therapy-create + report-create writes `audit_logs` row (assert count increments).

Test accounts (seeded, passwords in `apps/api/src/seed.ts` only, never prod): `dokter@asakita.demo / prototype`, `terapis@…`, `admin@…`, `owner@…`, `alya@example.com / prototype` + second parent `budi@example.com` for IDOR tests.

## 11. Explicit non-goals (do NOT build)
SATUSEHAT integration, billing/payments beyond read-only Billing tab, realtime chat/notifications (static lists suffice), native apps, multi-clinic tenancy. Skipped → add when clinic operates ≥3 months on this MVP and asks.

## 13. Build log — post-plan changes (as-built; deploy target in §9 superseded)
- **Deploy: Cloudflare (§9) → Render.** Fly.io tried first, abandoned (provisioned `fly.dev` hostname never got DNS). Prod = Render Blueprint (`render.yaml`: Docker, Singapore, 1GB disk at `/data`, healthcheck `/api/healthz`, auto-deploy on push to `main`).
- **Single-image serving.** The API serves both frontends: EMR at `/emr/`, portal at `/portal/`, `/` → `/emr/`, uploads at `/uploads/:fn` (manual fs serve in `apps/api/src/index.js`, no new dep). `Dockerfile` bakes `node_modules` (no runtime `npm install`); `CMD` runs `seed.js` (idempotent) then the server.
- **Vite base paths.** `base: "/emr/"` + `base: "/portal/"` so hashed assets resolve under the mount path (absolute `/assets/*` 404'd when pages are served from subpaths → blank pages despite 200 HTML).
- **Same-origin API.** `VITE_API_URL` defaults to `""` (same host, no prod CORS config); dev uses vite `proxy: {"/api": "http://localhost:8787"}`.
- **CSP fix.** API sends `default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com`. Required because both apps inject all CSS via a JS-created `<style>` tag, which bare `default-src 'self'` blocks (page rendered as raw unstyled text; invisible under vite dev, which sends no CSP).
- **CSV bulk import.** `apps/api/src/import-csv.js` + `apps/api/import-template.csv`, run via `npm run db:import -- file.csv`. CSV-only (no `xlsx` dep — Excel users Save As CSV). Handles `,`/`;` separators, quotes, BOM, ID decimal commas (`3,1`→`3.1`); one row = parent user + `parents` row + child + history + link; `mr_number`-keyed idempotent re-runs; parent password defaults to `prototype` unless the column sets one.
- **Login hardening.** Demo credential prefills removed from both logins (were `useState("dokter@asakita.demo"/"prototype")` and `("alya@example.com"/"prototype")`); EMR demo-password banner replaced with neutral text. `autoComplete="username"/"current-password"` kept (password-manager/a11y best practice, unrelated to the hardcoded values).
- **SOAP nav removed.** The sidebar SOAP entry was a dead end (notes need a visit context); notes are opened from Data Pasien → Catatan. Route kept for deep links.
- **Production copy pass.** Removed demo-flavored text: footer "bukan demo statis" clause, "Contoh terkurasi" pill, demo emails/names in login placeholders, false "backup aktif" status claim. Replaced fake dashboard numbers with real queries: notification card now shows actual draft-SOAP count, "follow-up" stat counts actionable upcoming appointments. Known remainder (needs schema work, not done): monthly new-patient count and monthly chart are still static — `children` has no `created_at` to aggregate by.
- **Parent↔child linking UI.** New parents self-register (portal Daftar / Google) with zero children linked, and CSV import skips existing `mr_number` rows — so nothing could link them after the fact. Added `POST /api/parent-links {email, child_id, relation?}` (owner/dokter/admin only, `INSERT OR IGNORE` idempotent, audited) + a "🔗 Hubungkan ortu" control on the EMR patient Ringkasan tab. Unknown email → 404 telling staff the parent must register first. Linked parents are now visible: `GET /api/patients` inlines `parent_names` (single-query `group_concat`, no N+1) shown as the Ortu column, and `GET /api/patients/:id` returns a `parents[]` array shown on the Ringkasan tab.
- **Child data editing.** The portal is read-only by design ("via front office" wording stays), but staff also had no edit UI (Data Pribadi tab was a static table; PUT only covered 4 fields). Extended `PUT /api/patients/:id` to 10 allowlisted fields (incl. `mr_number` with 409 on conflict, numeric guard on weights) and made the Data Pribadi tab an edit form for owner/dokter/admin (terapis keeps the read-only table). "Role & User" nav item now only renders for owner/dokter, matching the API's 403 — terapis/admin no longer see a dead menu.
- **Child field validation.** The edit form accepted anything, so: server-side `childFieldError` validator on PUT (required name, `mr_number` charset, real-calendar `dob` not in future, gender/blood allowlists, weight 0.3–10 kg / length 20–70 cm with ID comma-decimal tolerance, length caps) + mirrored instant checks in the form with gender/blood as dropdowns. Covered by security test 13 (12 invalid shapes → 400, `"3,1"` → stored as 3.1).
- **Edit-form fixes.** Birth date uses a native calendar picker (`type="date"`, no date library). Save button was white because `btn-p btn-s` was never a valid combo (`.btn-s` is declared later with equal specificity, so its `background:#fff` wins) — small primary buttons in this codebase are `btn btn-s` + inline `#2c5545` style (same as Tambah pasien/user), so the save button follows that convention.
- **Levelled logging.** `apps/api/src/log.js` (no dep): `debug/info/warn/error` to stdout with timestamps, level from `LOG_LEVEL` (`info` default, `error` under test). Request middleware logs `METHOD path status ms` — `/api/*` at info, pages/assets at debug, 5xx at error; bodies/tokens never logged. Boot line reports port, db path, dist dirs, and whether Google login is configured. Visible in Render Dashboard → Logs (set `LOG_LEVEL=debug` there for full verbosity).
- **Actual test files** (vs §12.1 sketch): `apps/api/test/unit/{api,portal,import}.test.mjs` on `node:test` + `packages/shared` on vitest; security suite unchanged. All green.
- **Real Google login.** `/api/auth/google` stub (trusted any client-sent email — anyone could mint accounts) replaced with RS256 ID-token verification in stdlib `node:crypto` (Google JWKS cached 1h; checks `iss`/`aud`/`exp`/verified email; fails closed without `GOOGLE_CLIENT_ID`). Links `google_sub` to existing users by email (staff keep their role); unknown addresses self-register as `parent`. Frontends render the real GIS button only when `/api/config` reports a client id (no frontend rebuild needed to enable); CSP extended with `script/frame/connect-src` for `accounts.google.com`.
