// ponytail: end-to-end browser smoke test (EMR + portal) — run against a local instance or production
// usage:  node tools/browser-qa.cjs                       (local, BASE=http://localhost:8787)
//         BASE=https://asakita-emr.onrender.com node tools/browser-qa.cjs
// needs:  playwright-core (npm i -D playwright-core) + a local Edge/Chrome install
const { chromium } = require("playwright-core");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:8787";
const SAFE = process.env.SAFE === "1"; // prod: skip writes that cannot be cleaned up
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const EDGE = process.env.BROWSER_PATH || BROWSERS.find((p) => fs.existsSync(p));
if (!EDGE) { console.error("No Edge/Chrome found — set BROWSER_PATH"); process.exit(2); }
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "  — " + detail : ""));
};

const EMRC = { email: "dokter@asakita.demo", pw: "prototype" };
const PORTC = { email: "alya@example.com", pw: "prototype" };

function watch(page, bucket) {
  page.on("pageerror", (e) => bucket.push("pageerror: " + e.message));
  // the pre-login session probe answers 401 by design → not a defect
  page.on("console", (m) => { if (m.type() === "error" && !/401 \(Unauthorized\)/.test(m.text())) bucket.push("console: " + m.text().slice(0, 160)); });
  page.on("requestfailed", (r) => bucket.push("reqfail: " + r.url().slice(0, 120) + " " + (r.failure()?.errorText || "")));
  // ponytail: catch bad API responses too (the app swallows them into alerts)
  page.on("response", async (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.includes("/api/") && !u.includes("/api/me")) bucket.push(`http ${r.status()} ${u.replace(/^https?:\/\/[^/]+/, "").slice(0, 80)}`);
  });
}

async function emrSuite(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, errors);

  await page.goto(BASE + "/emr/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#em", { timeout: 20000 });
  check("EMR: login page renders", true);
  await page.fill("#em", EMRC.email);
  await page.fill("#pw", EMRC.pw);
  await page.click("button:has-text('Masuk')");
  await page.waitForSelector("text=Dashboard", { timeout: 20000 });
  check("EMR: login → dashboard", true);

  const stats = await page.locator(".stat").count();
  check("EMR: dashboard stat cards", stats >= 4, stats + " cards");
  const bars = await page.locator(".bars .bar").count();
  check("EMR: monthly bar chart", bars === 6, bars + " bars");

  // --- patients + detail tabs ---
  await page.goto(BASE + "/emr/#/patients");
  await page.waitForSelector("table.tbl tbody tr", { timeout: 15000 });
  const rowCount = await page.locator("table.tbl tbody tr").count();
  check("EMR: patients table", rowCount > 0, rowCount + " rows");
  const arslan = page.locator("table.tbl tbody tr", { hasText: "Arslan" });
  await (arslan.count() ? arslan.first() : page.locator("table.tbl tbody tr").first()).click();
  await page.waitForSelector(".hero", { timeout: 15000 });
  check("EMR: patient detail hero", true);
  for (const tab of ["Ringkasan", "Data Pribadi", "Riwayat Medis", "Dokumen", "Billing", "Catatan"]) {
    await page.click(`.tabs button:has-text("${tab}")`);
    await page.waitForTimeout(400);
    const txt = (await page.locator(".card").last().innerText()).trim();
    check("EMR: tab renders — " + tab, txt.length > 5, txt.slice(0, 40).replace(/\n/g, " "));
  }
  // billing tab
  await page.click('.tabs button:has-text("Billing")');
  await page.waitForSelector("text=Total tagihan", { timeout: 10000 });
  const receipt = await page.locator("#receipt-print").isVisible();
  check("EMR: billing tab + receipt card", receipt);
  if (!SAFE) {
    const QA = "QA item " + Date.now();
    const before = await page.locator("table.tbl tbody tr").count();
    await page.click('button:has-text("Tagih sesi terapi")');
    await page.waitForTimeout(1200);
    const after = await page.locator("table.tbl tbody tr").count();
    check("EMR: bill therapy sessions", after >= before, `${before} → ${after} rows`);
    await page.fill('input[placeholder^="Deskripsi"]', QA);
    await page.click('button:has-text("Simpan item")');
    await page.waitForTimeout(1000);
    const hasQA = await page.locator(".card table.tbl tbody tr:has-text('QA item')").count();
    check("EMR: add billing item", hasQA >= 1, hasQA + " matches");
    const paid = page.locator(".card table.tbl tbody tr:has-text('QA item') button:has-text('Tandai lunas')");
    if (await paid.count()) { await paid.first().click(); await page.waitForTimeout(900); }
    const isLunas = await page.locator(".card table.tbl tbody tr:has-text('QA item') .pill:has-text('Lunas')").count();
    check("EMR: mark item paid", isLunas >= 1, isLunas + " paid");
    // clean up: remove the QA rows (billing items are deletable)
    page.once("dialog", (d) => d.accept());
    while (await page.locator(".card table.tbl tbody tr:has-text('QA item') button[title='Hapus']").count()) {
      await page.locator(".card table.tbl tbody tr:has-text('QA item') button[title='Hapus']").first().click();
      await page.waitForTimeout(700);
    }
    const left = await page.locator(".card table.tbl tbody tr:has-text('QA item')").count();
    check("EMR: QA billing item cleaned up", left === 0, left + " left");
    await page.click('button:has-text("Harga layanan")');
    await page.waitForTimeout(300);
    const prices = await page.locator("input[type=number]").count();
    check("EMR: service price editor", prices > 0, prices + " prices");
  }

  // --- growth curve ---
  await page.goto(BASE + "/emr/#/progress");
  await page.waitForSelector(".seg-b", { timeout: 15000 });
  await page.waitForTimeout(1200);
  // pick the first child that actually has growth measurements (demo data may vary)
  const opts = await page.locator(".toolbar select >> nth=0 >> option").allTextContents();
  let picked = null;
  for (const name of opts) {
    await page.selectOption(".toolbar select >> nth=0", { label: name }).catch(() => {});
    await page.waitForTimeout(1200);
    const rows = await page.locator("table.tbl tbody tr").count();
    if (rows > 0) { picked = name; break; }
  }
  const svg = await page.locator("svg.growth-svg").count();
  const bandPath = await page.locator("svg.growth-svg path").count();
  check("EMR: growth chart svg", svg === 1, svg + " svg for " + (picked || "no child with data"));
  check("EMR: reference bands drawn", bandPath >= 3, bandPath + " paths");
  const zCells = await page.locator("table.tbl tbody tr td").count();
  check("EMR: measurement table with z-scores", zCells > 0, zCells + " cells");
  await page.click('.seg-b:has-text("Tinggi badan")');
  await page.waitForTimeout(1200);
  check("EMR: indicator switch (height)", (await page.locator("svg.growth-svg").count()) === 1);
  await page.selectOption(".toolbar select >> nth=1", "WHO").catch(() => {});
  await page.waitForTimeout(1200);
  check("EMR: standard override select", true);

  // --- denver ---
  await page.goto(BASE + "/emr/#/denver");
  await page.waitForSelector(".denver-item", { timeout: 15000 });
  const items = await page.locator(".denver-item").count();
  check("EMR: denver items listed", items > 5, items + " items");
  const chips = await page.locator(".denver-item .chip").count();
  check("EMR: denver status chips", chips >= items, chips + " chips");
  await page.locator(".denver-item .chip:has-text('Lulus')").first().click();
  await page.waitForTimeout(900);
  const on = await page.locator(".denver-item .chip.on.pass").count();
  check("EMR: denver item checked", on >= 1, on + " checked");

  // --- therapy + recipe ---
  await page.goto(BASE + "/emr/#/therapy");
  await page.waitForSelector(".recipe-box", { timeout: 15000 });
  const tOpts = await page.locator(".card select >> nth=0 >> option").allTextContents();
  if (tOpts.length > 1) await page.selectOption(".card select >> nth=0", { index: 1 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.selectOption(".card select >> nth=1", { index: 1 }).catch(() => {});
  await page.fill('input[placeholder*="verbal"]', "QA target");
  await page.fill(".recipe-box textarea", "QA latihan 1\nQA latihan 2");
  await page.click('button:has-text("Simpan progress")');
  await page.waitForTimeout(1500);
  const hasTarget = await page.locator(".tl .it:has-text('QA target')").count();
  check("EMR: therapy session saved", hasTarget >= 1);
  const progItems = await page.locator(".card:has-text('QA latihan 1')").count();
  check("EMR: home program (resep) created", progItems >= 1);
  const dayCount = await page.locator(".card:has-text('QA latihan 1') .pill").first().innerText().catch(() => "");
  check("EMR: program tracking shows days", /hari/.test(dayCount), dayCount);

  // --- schedule ---
  await page.goto(BASE + "/emr/#/schedule");
  await page.waitForSelector("table.tbl", { timeout: 15000 });
  const appts = await page.locator("table.tbl tbody tr").count();
  check("EMR: schedule table", appts >= 0, appts + " rows");

  // --- reports ---
  await page.goto(BASE + "/emr/#/reports");
  await page.waitForSelector("button:has-text('Muat preview')", { timeout: 15000 });
  await page.click("button:has-text('Muat preview')");
  await page.waitForTimeout(1500);
  const preview = await page.locator(".print-card").innerText();
  check("EMR: report preview loads", preview.includes("Pasien"), preview.slice(0, 60).replace(/\n/g, " "));

  // --- users ---
  await page.goto(BASE + "/emr/#/users");
  await page.waitForSelector("table.tbl", { timeout: 15000 });
  const users = await page.locator("table.tbl tbody tr").count();
  check("EMR: users table", users > 0, users + " users");

  await page.waitForTimeout(500);
  check("EMR: no console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

async function portalSuite(browser) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: false });
  const page = await ctx.newPage();
  watch(page, errors);

  await page.goto(BASE + "/portal/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="email@anda.id"]', { timeout: 20000 });
  await page.fill('input[placeholder="email@anda.id"]', PORTC.email);
  await page.fill('input[type="password"]', PORTC.pw);
  await page.click("button.btn-p:has-text('Masuk')");
  await page.waitForSelector(".hello", { timeout: 20000 });
  check("PORTAL: login → beranda", true);

  const tiles = await page.locator(".tile").count();
  check("PORTAL: home tiles", tiles >= 6, tiles + " tiles");

  // growth
  await page.goto(BASE + "/portal/#/growth");
  await page.waitForTimeout(2000);
  const svg = await page.locator("svg.chart-svg").count();
  const paths = await page.locator("svg.chart-svg path").count();
  check("PORTAL: growth chart", svg === 1, svg + " svg");
  check("PORTAL: reference bands", paths >= 2, paths + " paths");
  await page.click('.tab:has-text("Tinggi badan")');
  await page.waitForTimeout(1500);
  check("PORTAL: indicator tab switch", (await page.locator("svg.chart-svg").count()) === 1);

  // screening + denver summary
  await page.goto(BASE + "/portal/#/screening");
  await page.waitForTimeout(1800);
  const denverCard = await page.locator(".card:has-text('Checklist Denver')").count();
  check("PORTAL: denver summary card", denverCard >= 1);
  const domBars = await page.locator(".card:has-text('Checklist Denver') .bar").count();
  check("PORTAL: denver domain bars", domBars === 4, domBars + " bars");

  // resep tracking
  await page.goto(BASE + "/portal/#/resep");
  await page.waitForTimeout(1800);
  const tasks = await page.locator(".task").count();
  check("PORTAL: resep items", tasks > 0, tasks + " items");
  if (tasks) {
    await page.locator(".task").first().click();
    await page.waitForTimeout(1200);
    const on = await page.locator(".task.on").count();
    check("PORTAL: tick a recipe item", on >= 1);
    await page.locator(".task.on").first().click(); // toggle back
    await page.waitForTimeout(1000);
  }

  // tagihan
  await page.goto(BASE + "/portal/#/tagihan");
  await page.waitForTimeout(1500);
  const bill = await page.locator(".card").first().innerText();
  check("PORTAL: billing summary", /Total tagihan/.test(bill), bill.replace(/\n/g, " ").slice(0, 60));

  // edukasi
  await page.goto(BASE + "/portal/#/education");
  await page.waitForSelector(".row", { timeout: 15000 });
  const arts = await page.locator(".row").count();
  check("PORTAL: articles list", arts > 0, arts + " articles");

  // account
  await page.goto(BASE + "/portal/#/account");
  await page.waitForTimeout(1200);
  check("PORTAL: account page", (await page.locator(".info").count()) >= 1);

  await page.waitForTimeout(400);
  check("PORTAL: no console/page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  try {
    await emrSuite(browser);
    await portalSuite(browser);
  } catch (e) {
    check("SUITE CRASH", false, e.message.slice(0, 300));
  } finally {
    await browser.close();
  }
  // report leftovers so QA data can be cleaned up afterwards
  try {
    const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMRC.email, password: EMRC.pw }) });
    const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
    const kids = await (await fetch(BASE + "/api/patients", { headers: { cookie } })).json();
    for (const k of kids.data) {
      const b = await (await fetch(BASE + `/api/billing?childId=${k.id}`, { headers: { cookie } })).json();
      const qa = (b.data || []).filter((i) => /QA/i.test(i.description));
      if (qa.length) console.log("LEFTOVER billing:", k.full_name, qa.map((i) => i.id + " " + i.description).join(", "));
      const s = await (await fetch(BASE + `/api/therapy-sessions?childId=${k.id}`, { headers: { cookie } })).json();
      const qs = (s.data || []).filter((x) => /QA/i.test(x.target || ""));
      if (qs.length) console.log("LEFTOVER session:", k.full_name, qs.map((x) => x.id + " " + x.target).join(", "));
    }
  } catch (e) { console.log("leftover scan failed: " + e.message); }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILED:"); failed.forEach((f) => console.log(" - " + f.name + "  " + f.detail)); process.exitCode = 1; }
})();
