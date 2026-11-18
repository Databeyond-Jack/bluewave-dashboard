// Synthetic sample data, generated in the browser with a seeded random number generator,
// so every visitor sees the same numbers. Dates are whole days since 1970-01-01 (UTC).

export const DAY_MS = 86_400_000;
export const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / DAY_MS;
export const isoDate = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {  // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = (mu = 0, sd = 1) => {
    if (spare !== null) { const s = spare; spare = null; return mu + sd * s; }
    let u, v, s;
    do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * m;
    return mu + sd * u * m;
  };
  const poisson = (lam) => {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(normal(lam, Math.sqrt(lam))));
    const limit = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= next(); } while (p > limit);
    return k - 1;
  };
  // Returns a function that picks an index with the given weights.
  const chooser = (weights) => {
    const total = weights.reduce((s, w) => s + w, 0);
    let acc = 0;
    const cum = weights.map((w) => (acc += w / total));
    return () => { const r = next(); let i = 0; while (i < cum.length - 1 && r > cum[i]) i++; return i; };
  };
  return {
    next, normal, poisson, chooser,
    lognormal: (mu, sd) => Math.exp(normal(mu, sd)),
    exponential: (mean) => -Math.log(1 - next()) * mean,
    shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  };
}

// ---------------------------------------------------------------------------
// Revenue: ~2 years of B2B transactions, stored column-wise for fast filtering
// ---------------------------------------------------------------------------
export const REGIONS = ["North America", "Europe", "APAC", "LATAM"];
export const PRODUCTS = ["Analytics", "Cloud", "Security", "Support"];
const PRODUCT_P = [0.36, 0.28, 0.21, 0.15];
export const PRODUCT_PRICE = [420, 680, 540, 160];
export const SALES_END = dayOf(2026, 11, 2);
export const SALES_START = SALES_END - 729;

function makeSales() {
  const rng = makeRng(7);
  const prefix = ["Blue", "North", "Silver", "Clear", "Harbor", "Summit", "Atlas", "Nova",
                  "Cobalt", "Pine", "Iron", "Crest", "Lumen", "Tidal"];
  const suffix = ["Labs", "Systems", "Logistics", "Health", "Partners", "Foods", "Energy",
                  "Media", "Retail", "Capital", "Works", "Dynamics"];
  const names = [];
  for (const p of prefix) suffix.forEach((s, i) => names.push(i % 3 === 0 ? p + s.toLowerCase() : `${p} ${s}`));
  const accounts = rng.shuffle(names).slice(0, 160);
  const pickRegion = rng.chooser([0.4, 0.3, 0.2, 0.1]);
  const accountRegion = accounts.map(() => pickRegion());
  const pickAccount = rng.chooser(accounts.map((_, i) => 1 / (i + 1) ** 0.8));
  const pickProduct = rng.chooser(PRODUCT_P);
  const hourW = Array.from({ length: 24 }, (_, h) =>
    0.15 + Math.exp(-((h - 10) ** 2) / 6) + 0.8 * Math.exp(-((h - 15) ** 2) / 8));
  const pickHour = rng.chooser(hourW);

  const perDay = [];
  for (let i = 0; i < 730; i++) {
    const d = new Date((SALES_START + i) * DAY_MS);
    const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY_MS;
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const lam = 70 * (1 + 0.55 * i / 730) * (1 + 0.12 * Math.sin((2 * Math.PI * (doy - 80)) / 365)) * (weekend ? 0.55 : 1);
    perDay.push(rng.poisson(lam));
  }
  const n = perDay.reduce((s, x) => s + x, 0);
  const tx = {
    n, day: new Int32Array(n), hour: new Uint8Array(n), weekday: new Uint8Array(n), account: new Uint16Array(n),
    region: new Uint8Array(n), product: new Uint8Array(n), revenue: new Float64Array(n),
  };
  let k = 0;
  perDay.forEach((count, i) => {
    const day = SALES_START + i;
    const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7;  // Mon = 0
    for (let j = 0; j < count; j++, k++) {
      const a = pickAccount(), p = pickProduct();
      tx.day[k] = day; tx.hour[k] = pickHour(); tx.weekday[k] = weekday; tx.account[k] = a;
      tx.region[k] = accountRegion[a]; tx.product[k] = p;
      tx.revenue[k] = PRODUCT_PRICE[p] * rng.lognormal(0, 0.45);
    }
  });
  return { tx, accounts, accountRegion, pickAccount, pickProduct, rng };
}

export const SALES = makeSales();

// ---------------------------------------------------------------------------
// Workforce / HR: ~1,600 staff over two years (Nov 2024 – Nov 2026)
// ---------------------------------------------------------------------------
export const AS_OF = dayOf(2026, 11, 2);
export const WINDOW_START = dayOf(2024, 11, 1);
export const DEPARTMENTS = ["Engineering", "Operations", "Sales", "Customer Success", "Finance", "People"];
const DEPT_P = [0.28, 0.24, 0.17, 0.15, 0.09, 0.07];
const DEPT_TURNOVER = [0.11, 0.16, 0.22, 0.18, 0.09, 0.12];   // chance of leaving per year
const DEPT_ABSENCE = [0.55, 1.05, 0.70, 0.90, 0.50, 0.62];    // days lost per person-month
const DEPT_ENGAGEMENT = [74, 63, 68, 66, 76, 79];
export const LOCATIONS = ["London", "Edinburgh", "Manchester", "Remote"];
const LOCATION_P = [0.38, 0.24, 0.22, 0.16];
export const GENDERS = ["Female", "Male", "Not stated"];
export const REASONS = ["Career progression", "Pay & benefits", "Work-life balance", "Relocation",
                        "End of contract", "Retirement", "Dismissal"];
const REASON_P = [0.31, 0.21, 0.16, 0.12, 0.09, 0.07, 0.04];
export const AGE_BANDS = ["<25", "25–29", "30–34", "35–39", "40–44", "45–49", "50–54", "55–59", "60+"];

// 24 complete months, Nov 2024 – Oct 2026
export const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const y = 2024 + Math.floor((10 + i) / 12), m = (10 + i) % 12;
  return { start: Date.UTC(y, m, 1) / DAY_MS, end: Date.UTC(y, m + 1, 0) / DAY_MS, month: m + 1 };
});

function ageBand(age) {
  if (age < 25) return 0;
  if (age >= 60) return 8;
  return Math.floor((age - 25) / 5) + 1;
}

function makeWorkforce() {
  const rng = makeRng(11);
  const nExisting = 1050, nNew = 540, windowDays = AS_OF - WINDOW_START;
  const pickDept = rng.chooser(DEPT_P), pickLoc = rng.chooser(LOCATION_P);
  const pickGender = rng.chooser([0.51, 0.47, 0.02]), pickReason = rng.chooser(REASON_P);
  const ptFte = [0.4, 0.5, 0.6, 0.8];

  const employees = [];
  for (let i = 0; i < nExisting + nNew; i++) {
    const existing = i < nExisting;
    let hire;
    if (existing) {
      hire = WINDOW_START - Math.floor(Math.min(Math.max(rng.exponential(5 * 365), 30), 25 * 365));
    } else {  // new hires lean later in the window: the company is growing
      const t = rng.next() < 0.6 ? rng.next() : Math.sqrt(rng.next());
      hire = WINDOW_START + Math.floor(t * windowDays);
    }
    const dept = pickDept();
    const rate = -Math.log(1 - DEPT_TURNOVER[dept]);
    let leave = Math.max(hire, WINDOW_START) + Math.floor(rng.exponential(365 / rate));
    if (leave > AS_OF) leave = null;
    const gender = pickGender();
    const age = Math.round(Math.min(Math.max(existing ? rng.normal(42, 10) : rng.normal(33, 8), 19), 66));
    const partTime = rng.next() < (gender === 0 ? 0.24 : 0.10);
    employees.push({
      dept, loc: pickLoc(), gender, age, ageBand: ageBand(age),
      fte: partTime ? ptFte[Math.floor(rng.next() * 4)] : 1,
      hire, leave,
      reason: leave === null ? null : pickReason(),
      engagement: Math.round(Math.min(Math.max(rng.normal(DEPT_ENGAGEMENT[dept], 12), 0), 100)),
    });
  }

  // Sickness absence: days lost per employee per complete month
  const absence = [];
  MONTHS.forEach((m, mi) => {
    const season = (1 + 0.35 * Math.cos((2 * Math.PI * (m.month - 1)) / 12)) * rng.normal(1, 0.08);  // winter peak
    for (const e of employees) {
      if (e.hire > m.end || (e.leave !== null && e.leave < m.start)) continue;
      absence.push({ month: mi, dept: e.dept, loc: e.loc,
                     lost: rng.poisson(DEPT_ABSENCE[e.dept] * season * e.fte), available: 21 * e.fte });
    }
  });

  const vacancies = [];
  DEPT_P.forEach((p, d) => LOCATION_P.forEach((lp, l) => vacancies.push({ dept: d, loc: l, open: rng.poisson(40 * p * lp) })));

  return { employees, absence, vacancies };
}

export const WORKFORCE = makeWorkforce();
