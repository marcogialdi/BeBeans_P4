import { SUPABASE_URL, SUPABASE_ANON_KEY, CAR_NAME, REFRESH_MINUTES } from "./config.js";

// ───────────────────────── Avvio ─────────────────────────

const params = new URLSearchParams(location.search);
const DEMO = params.has("demo") || SUPABASE_URL.includes("<");
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/polestar`;

let supabase = null;
let snapshot = null;
let lastFetch = 0;
let energyPeriod = "SinceCharge";
let map = null;
let marker = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("car-name").textContent = CAR_NAME;
  wireUi();
  registerServiceWorker();

  if (DEMO) {
    showDashboard();
    showBanner("Modalità dimostrativa: valori di esempio, nessuna chiamata reale.");
    await refresh();
    return;
  }

  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    showDashboard();
    refresh();
  } else {
    showLogin();
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") showLogin();
  });
}

function wireUi() {
  $("login-form").addEventListener("submit", onLogin);
  $("btn-refresh").addEventListener("click", () => refresh(true));
  $("btn-logout").addEventListener("click", async () => {
    if (supabase) await supabase.auth.signOut();
    snapshot = null;
    showLogin();
  });

  document.querySelectorAll(".segmented button").forEach((b) =>
    b.addEventListener("click", () => {
      energyPeriod = b.dataset.period;
      document.querySelectorAll(".segmented button").forEach((x) =>
        x.setAttribute("aria-pressed", String(x === b)),
      );
      if (snapshot) renderEnergy(snapshot.data.battery);
    }),
  );

  // Aggiorna al ritorno sull'app e periodicamente mentre è visibile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastFetch > 120_000) refresh();
  });
  setInterval(() => {
    if (document.visibilityState === "visible" && !$("view-dash").hidden) refresh();
  }, REFRESH_MINUTES * 60_000);

  // Evidenzia la sezione visibile nella navigazione.
  const links = [...document.querySelectorAll(".tabs a, .bottom-nav a")];
  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const id = `#${visible.target.id}`;
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === id));
    },
    { threshold: [0.25, 0.6] },
  );
  ["panoramica", "ricarica", "clima", "salute", "posizione", "storico"].forEach((id) => $(id) && io.observe($(id)));
}

function showLogin() {
  $("view-dash").hidden = true;
  $("view-login").hidden = false;
}

function showDashboard() {
  $("view-login").hidden = true;
  $("view-dash").hidden = false;
}

async function onLogin(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const btn = form.querySelector("button");
  const err = $("login-error");
  err.hidden = true;
  btn.disabled = true;
  const { error } = await supabase.auth.signInWithPassword({
    email: form.email.value.trim(),
    password: form.password.value,
  });
  btn.disabled = false;
  form.password.value = "";
  if (error) {
    err.textContent = "Accesso non riuscito. Controlla email e password.";
    err.hidden = false;
    return;
  }
  showDashboard();
  refresh(true);
}

// ───────────────────────── Dati ─────────────────────────

async function fetchSnapshot() {
  if (DEMO) {
    const { demoSnapshot } = await import("./demo.js");
    return demoSnapshot();
  }
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) {
    showLogin();
    throw new Error("session");
  }
  const res = await fetch(`${FUNCTION_URL}?action=snapshot`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
    cache: "no-store",
  });
  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new Error("unauthorized");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

async function fetchHistory() {
  if (DEMO) {
    const { demoHistory } = await import("./demo.js");
    return demoHistory();
  }
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("vehicle_snapshots")
    .select("taken_at, observed_at, soc")
    .gte("taken_at", since)
    .order("taken_at", { ascending: true })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

let refreshing = false;
async function refresh(manual = false) {
  if (refreshing) return;
  refreshing = true;
  $("btn-refresh").classList.add("spinning");
  try {
    snapshot = await fetchSnapshot();
    lastFetch = Date.now();
    if (!DEMO) hideBanner();
    render(snapshot);
    const errs = Object.keys(snapshot.errors ?? {});
    if (errs.length && !DEMO) showBanner(`Alcuni dati non sono stati aggiornati (${errs.length}). Riprova tra poco.`);
  } catch (e) {
    if (e.message !== "session" && e.message !== "unauthorized") {
      showBanner(
        navigator.onLine
          ? "Non riesco a raggiungere i dati dell'auto in questo momento."
          : "Sei offline: i dati verranno aggiornati quando torna la connessione.",
      );
    }
  } finally {
    refreshing = false;
    $("btn-refresh").classList.remove("spinning");
  }

  try {
    renderHistory(await fetchHistory());
  } catch {
    renderHistory([]);
  }
  if (manual) $("btn-refresh").blur();
}

// ───────────────────────── Formattazione ─────────────────────────

const nf = (digits = 0) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const num = (v, digits = 0) => (v == null || Number.isNaN(Number(v)) ? null : nf(digits).format(Number(v)));
const has = (v) => v !== null && v !== undefined && v !== "";

function tsDate(ts) {
  if (!ts?.seconds) return null;
  return new Date(Number(ts.seconds) * 1000 + Number(ts.nanos ?? 0) / 1e6);
}

function observedAt(d) {
  return tsDate(d?.timestamp) ?? tsDate(d?.updatedAtTimestamp) ?? (d?.metaReceivedAt ? new Date(d.metaReceivedAt) : null);
}

function ago(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const min = Math.round((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h fa`;
  return `${Math.round(h / 24)} gg fa`;
}

function duration(minutes) {
  if (!has(minutes)) return null;
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}

const hhmm = (t) => (t && has(t.hour) ? `${String(t.hour).padStart(2, "0")}:${String(t.minute ?? 0).padStart(2, "0")}` : null);

// Le enum dell'API non sono documentate: le traduciamo per suffisso, la più lunga vince.
const WORDS = {
  NOT_CHARGING: "Non in carica",
  SMART_CHARGING: "Ricarica intelligente",
  CHARGING_PAUSED: "Ricarica in pausa",
  DISCHARGING: "In scarica",
  CHARGING: "In carica",
  FULLY_CHARGED: "Carica completa",
  COMPLETED: "Completata",
  DONE: "Completata",
  SCHEDULED: "Programmata",
  IDLE: "Inattiva",
  DISCONNECTED: "Scollegato",
  CONNECTED: "Collegato",
  UNLOCKED: "Sbloccata",
  LOCKED: "Bloccata",
  AJAR: "Socchiuso",
  OPEN: "Aperto",
  CLOSED: "Chiuso",
  UNAVAILABLE: "Non disponibile",
  AVAILABLE: "Disponibile",
  NOT_RUNNING: "Spento",
  RUNNING: "In funzione",
  STOPPED: "Spento",
  STARTED: "Avviato",
  ACTIVE: "Attivo",
  INACTIVE: "Non attivo",
  ON: "Acceso",
  OFF: "Spento",
  ARMED: "Inserito",
  DISARMED: "Disinserito",
  TRIGGERED: "Scattato",
  DRIVING: "In marcia",
  PARKED: "Parcheggiata",
  ABANDONED: "Parcheggiata",
  INACTIVE_USAGE: "Inattiva",
  LOW: "Basso",
  MEDIUM: "Medio",
  HIGH: "Alto",
  ERROR: "Errore",
  FAULT: "Guasto",
  AC: "AC",
  DC: "DC",
  NO_WARNING: "Nessun avviso",
};
const WORD_KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);

function label(v) {
  if (!has(v)) return null;
  const s = String(v).toUpperCase();
  if (/UNSPECIFIED|UNKNOWN/.test(s)) return null;
  for (const k of WORD_KEYS) if (s === k || s.endsWith(`_${k}`)) return WORDS[k];
  const tail = s.split("_").slice(-2).join(" ").toLowerCase();
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

const isOk = (v) => !has(v) || /NO_WARNING|NO_ERROR|NO_FAULT|UNSPECIFIED|UNKNOWN|(^|_)OK$|NORMAL/i.test(String(v));
const isOpen = (v) => /(^|_)(OPEN|AJAR)$/i.test(String(v ?? ""));

const DAYS = { MONDAY: "Lun", TUESDAY: "Mar", WEDNESDAY: "Mer", THURSDAY: "Gio", FRIDAY: "Ven", SATURDAY: "Sab", SUNDAY: "Dom" };
function days(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const names = list.map((d) => Object.entries(DAYS).find(([k]) => String(d).toUpperCase().endsWith(k))?.[1]).filter(Boolean);
  if (names.length === 7) return "Tutti i giorni";
  if (names.join() === "Lun,Mar,Mer,Gio,Ven") return "Lun – Ven";
  if (names.join() === "Sab,Dom") return "Weekend";
  return names.join(", ");
}

// ───────────────────────── Helpers DOM ─────────────────────────

function setText(id, value, fallback = "—") {
  const el = $(id);
  if (el) el.textContent = has(value) ? value : fallback;
}

/** Riempie un <dl> con righe [etichetta, valore, classe]; salta i valori vuoti. */
function setRows(id, rows) {
  const dl = $(id);
  dl.replaceChildren();
  for (const [k, v, cls] of rows) {
    if (!has(v)) continue;
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = k;
    if (v instanceof Node) dd.append(v);
    else dd.textContent = v;
    if (cls) dd.className = cls;
    wrap.append(dt, dd);
    dl.append(wrap);
  }
  return dl.children.length;
}

function badge(text) {
  const s = document.createElement("span");
  s.className = "badge";
  s.textContent = text;
  return s;
}

function showBanner(text) {
  const b = $("banner");
  b.textContent = text;
  b.hidden = false;
}
function hideBanner() {
  $("banner").hidden = true;
}

// ───────────────────────── Rendering ─────────────────────────

function render(snap) {
  const d = snap.data ?? {};

  // Nasconde le schede per cui l'auto non fornisce alcun dato (dipende dal modello).
  document.querySelectorAll("[data-needs]").forEach((card) => {
    card.hidden = !card.dataset.needs.split(" ").some((k) => d[k]);
  });

  renderFreshness(d);
  renderHero(d.battery, d.targetSoc);
  renderStatus(d.exterior, d.availability);
  renderKpis(d);
  renderEnergy(d.battery);
  renderHealth(d.health);
  renderClimate(d.parkingClimatization, d.parkingClimateTimer, d.preCleaning);
  renderCharging(d);
  renderLocation(d.location, d.isAtChargeLocation, d.chargeLocations);
}

function renderFreshness(d) {
  const times = ["battery", "odometer", "exterior", "location"].map((k) => observedAt(d[k])).filter(Boolean);
  const newest = times.sort((a, b) => b - a)[0];
  const dot = $("fresh-dot");
  dot.className = "dot";
  if (!newest) {
    setText("freshness", "Nessun dato recente", "");
    return;
  }
  setText("freshness", `Dati di ${ago(newest)}`);
  dot.classList.add(Date.now() - newest.getTime() < 3_600_000 ? "fresh" : "stale");
}

function renderHero(b, t) {
  if (!b) return;
  const soc = b.batteryChargeLevelPercentage;
  const socEl = $("soc");
  socEl.replaceChildren();
  if (has(soc)) {
    socEl.append(num(soc));
    const pct = document.createElement("small");
    pct.textContent = "%";
    socEl.append(pct);
  } else socEl.textContent = "—";

  const C = 2 * Math.PI * 96;
  const fill = Math.max(0, Math.min(100, Number(soc) || 0)) / 100;
  requestAnimationFrame(() => ($("ring-value").style.strokeDasharray = `${(C * fill).toFixed(1)} ${C.toFixed(1)}`));
  $("ring-value").closest("svg").setAttribute("aria-label", has(soc) ? `Batteria al ${num(soc)} per cento` : "Batteria");

  const target = t?.targetSoc?.batteryChargeTargetLevel;
  const tick = $("ring-target");
  if (has(target)) {
    tick.removeAttribute("visibility");
    tick.setAttribute("transform", `rotate(${(Number(target) / 100) * 360} 110 110)`);
  } else tick.setAttribute("visibility", "hidden");

  setText("range", num(b.estimatedDistanceToEmptyKm));
  setText("hero-target", has(target) ? `${num(target)}%` : null);
  setText("hero-power", has(b.chargingPowerWatts) && b.chargingPowerWatts > 0 ? `${num(b.chargingPowerWatts / 1000, 1)} kW` : null);
  setText("hero-energy", has(b.energyAvailable ?? b.dischargeInfo?.energyAvailable)
    ? `${num(b.dischargeInfo?.energyAvailable ?? b.energyAvailable, 1)} kWh` : null);

  const status = b.chargingStatusV2 ?? b.chargingStatus;
  const charging = /(^|_)CHARGING$/i.test(String(status ?? "")) && !/NOT_CHARGING/i.test(String(status));
  const parts = [];
  if (charging) {
    parts.push("In carica");
    if (b.chargingType) parts.push(label(b.chargingType));
    if (b.chargingPowerWatts > 0) parts.push(`${num(b.chargingPowerWatts / 1000, 1)} kW`);
    const full = duration(b.estimatedChargingTimeToFullMinutes);
    if (full) parts.push(`pieno in ${full}`);
  } else {
    const st = label(status);
    if (st) parts.push(st);
    const conn = label(b.chargerConnectionStatus);
    if (conn) parts.push(`cavo ${conn.toLowerCase()}`);
  }
  $("charge-pill").hidden = !parts.length;
  setText("charge-text", parts.filter(Boolean).join(" · "));
}

function renderStatus(ext, avail) {
  const lockIcon = $("lock-closed").parentElement;
  if (ext) {
    const unlocked = /UNLOCKED/i.test(String(ext.centralLock ?? ""));
    const lockLabel = label(ext.centralLock);
    setText("lock-title", lockLabel ?? "Stato serrature n.d.");
    $("lock-closed").toggleAttribute("hidden", unlocked);
    $("lock-open").toggleAttribute("hidden", !unlocked);
    lockIcon.classList.toggle("open", unlocked);
    const alarm = label(ext.alarm);
    setText("lock-sub", alarm ? `Allarme: ${alarm.toLowerCase()}` : "", "");
  } else {
    setText("lock-title", "—");
    setText("lock-sub", "", "");
  }

  const group = (keys, closedText, names) => {
    if (!ext) return [null, null];
    const present = keys.filter((k) => has(ext[k]));
    if (!present.length) return [null, null];
    const open = present.filter((k) => isOpen(ext[k]));
    return open.length ? [`Aperti: ${open.map((k) => names[k]).join(", ")}`, "warn"] : [closedText, null];
  };

  const doors = group(
    ["frontLeftDoor", "frontRightDoor", "rearLeftDoor", "rearRightDoor"],
    "Tutte chiuse",
    { frontLeftDoor: "ant. sx", frontRightDoor: "ant. dx", rearLeftDoor: "post. sx", rearRightDoor: "post. dx" },
  );
  const windows = group(
    ["frontLeftWindow", "frontRightWindow", "rearLeftWindow", "rearRightWindow"],
    "Tutti chiusi",
    { frontLeftWindow: "ant. sx", frontRightWindow: "ant. dx", rearLeftWindow: "post. sx", rearRightWindow: "post. dx" },
  );
  const body = group(["hood", "tailgate", "tankLid"], "Chiusi", { hood: "cofano", tailgate: "bagagliaio", tankLid: "sportello" });

  const availability = [label(avail?.availabilityStatus), label(avail?.usageMode)].filter(Boolean).join(" · ");
  const unavailable = label(avail?.unavailableReason);

  setRows("status-rows", [
    ["Porte", doors[0], doors[1]],
    ["Finestrini", windows[0], windows[1]],
    ["Cofano e bagagliaio", body[0], body[1]],
    ["Tetto", label(ext?.sunroof), isOpen(ext?.sunroof) ? "warn" : null],
    ["Disponibilità", availability || null],
    ["Motivo", unavailable],
  ]);
}

function renderKpis(d) {
  const o = d.odometer;
  setText("kpi-odo", has(o?.odometerMeters) ? num(o.odometerMeters / 1000) : null);
  setText("kpi-odo-sub", has(o?.tripMeterSinceChargeKm) ? `Dall'ultima carica: ${num(o.tripMeterSinceChargeKm)} km` : "", "");

  const b = d.battery;
  const cons = b?.averageEnergyConsumptionKwhPer100KmSinceCharge ?? b?.averageEnergyConsumptionKwhPer100KmAutomatic ?? b?.averageEnergyConsumptionKwhPer100Km;
  setText("kpi-cons", num(cons, 1));
  const speed = o?.averageSpeedKmPerHourSinceCharge ?? o?.averageSpeedKmPerHourAutomatic ?? o?.averageSpeedKmPerHour;
  setText("kpi-cons-sub", has(speed) ? `Velocità media ${num(speed)} km/h` : "", "");

  const h = d.health;
  setText("kpi-service", num(h?.daysToService));
  const svc = [has(h?.distanceToServiceKm) ? `oppure tra ${num(h.distanceToServiceKm)} km` : null,
    !isOk(h?.serviceWarning) ? label(h.serviceWarning) : null].filter(Boolean).join(" · ");
  setText("kpi-service-sub", svc, "");

  const c = d.parkingClimatization;
  const p = d.preCleaning;
  setText("kpi-cabin", num(c?.currentCompartmentTemperatureCelsius, 1));
  const air = [has(p?.measuredAirQualityIndex) ? `Qualità aria (AQI) ${num(p.measuredAirQualityIndex)}` : null,
    has(p?.measuredParticulateMatter25) ? `PM2.5 ${num(p.measuredParticulateMatter25)} µg/m³` : null].filter(Boolean).join(" · ");
  setText("kpi-cabin-sub", air, "");
}

const SEGMENTS = [
  ["driving", "Guida", "var(--accent)"],
  ["climate", "Clima", "var(--seg-2)"],
  ["battery", "Batteria", "var(--seg-3)"],
  ["other", "Altro", "var(--seg-4)"],
];

function renderEnergy(b) {
  const pct = b?.[`energyConsumptionPercentage${energyPeriod}`];
  const wh = b?.[`energyConsumptionWh${energyPeriod}`];
  const bar = $("energy-bar");
  const legend = $("energy-legend");
  bar.replaceChildren();
  legend.replaceChildren();

  const values = SEGMENTS.map(([k]) => Number(pct?.[k] ?? 0));
  const total = values.reduce((a, v) => a + v, 0);
  $("energy-empty").hidden = total > 0;
  bar.hidden = legend.hidden = total <= 0;
  if (total <= 0) return;

  SEGMENTS.forEach(([k, name, color], i) => {
    const share = (values[i] / total) * 100;
    const seg = document.createElement("span");
    seg.style.width = `${share}%`;
    seg.style.background = color;
    bar.append(seg);

    const item = document.createElement("div");
    const key = document.createElement("span");
    key.className = "key";
    const sw = document.createElement("span");
    sw.className = `sw${i === 3 ? " sw-4" : ""}`;
    sw.style.background = color;
    key.append(sw, name);
    const val = document.createElement("span");
    val.className = "val";
    const kwh = has(wh?.[k]) ? ` · ${num(wh[k] / 1000, 1)} kWh` : "";
    val.textContent = `${num(share)}%${kwh}`;
    item.append(key, val);
    legend.append(item);
  });
  bar.setAttribute("aria-label", SEGMENTS.map(([, n], i) => `${n} ${num((values[i] / total) * 100)}%`).join(", "));
}

function renderHealth(h) {
  if (!h) return;
  const tyres = [
    ["fl", "frontLeft"],
    ["fr", "frontRight"],
    ["rl", "rearLeft"],
    ["rr", "rearRight"],
  ];
  for (const [id, k] of tyres) {
    setText(`tyre-${id}`, num(h[`${k}TyrePressureKpa`]));
    const w = h[`${k}TyrePressureWarning`];
    $(`tw-${id}`).setAttribute("class", `tyre ${!has(w) && !has(h[`${k}TyrePressureKpa`]) ? "" : isOk(w) ? "ok" : "warn"}`);
  }
  const ref = [h.frontTyresReferencePressureKpa, h.rearTyresReferencePressureKpa].filter(has).map((v) => num(v));
  setText("tyre-ref", ref.length ? `Rif. ${ref.join(" / ")} kPa` : "", "");

  const warnings = [];
  const add = (v, text) => { if (has(v) && !isOk(v)) warnings.push(`${text}: ${label(v)?.toLowerCase() ?? "verificare"}`); };
  add(h.brakeFluidLevelWarning, "Liquido freni");
  add(h.engineCoolantLevelWarning, "Liquido di raffreddamento");
  add(h.oilLevelWarning, "Olio");
  add(h.washerFluidLevelWarning, "Liquido lavavetri");
  add(h.lowVoltageBatteryWarning, "Batteria 12 V");
  add(h.serviceWarning, "Tagliando");
  tyres.forEach(([, k]) => add(h[`${k}TyrePressureWarning`], `Pneumatico ${k.startsWith("front") ? "ant." : "post."} ${k.endsWith("Left") ? "sx" : "dx"}`));
  const lights = Object.entries(h.lightWarnings ?? {}).filter(([, v]) => !isOk(v));
  if (lights.length) warnings.push(`Luci: ${lights.length} da controllare`);

  const ul = $("health-alerts");
  ul.replaceChildren();
  const li = (text, warn) => {
    const el = document.createElement("li");
    if (warn) el.className = "warn";
    el.textContent = text;
    ul.append(el);
  };
  if (warnings.length) warnings.forEach((w) => li(w, true));
  else li("Nessun avviso: liquidi, luci e batteria 12 V regolari", false);
}

function renderClimate(c, timers, pre) {
  setText("clim-temp", num(c?.requestedCompartmentTemperatureCelsius ?? timers?.timerSettings?.requestedCompartmentTemperatureCelsius, 1));
  const running = label(c?.runningStatus ?? c?.mainClimateRunningStatus);
  const end = tsDate(c?.endingAt);
  setText("clim-state", running ? `richiesti · ${running.toLowerCase()}${end && end > new Date() ? ` fino alle ${end.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}` : "richiesti", "");

  const rows = [];
  for (const t of timers?.parkingClimateTimers ?? []) {
    const when = hhmm(t.readyAt);
    if (!when) continue;
    rows.push([`Pronta alle ${when}`, `${t.repeat ? days(t.weekdays) ?? "Ripetuto" : "Una volta"}${t.activated ? "" : " · disattivato"}`]);
  }
  if ((timers?.pendingParkingClimateTimers ?? []).length) rows.push(["Modifiche timer", badge("In attesa di conferma")]);

  const s = timers?.timerSettings;
  const seats = s?.seatHeatingIntensity;
  const seat = label(seats?.frontRowLeftSeat ?? c?.requestedFrontLeftSeat);
  rows.push(["Sedili anteriori", seat && seat !== "Spento" ? `Riscaldamento ${seat.toLowerCase()}` : seat]);
  rows.push(["Volante", label(s?.steeringWheelHeatingIntensity ?? c?.requestedSteeringWheelHeating)]);
  rows.push(["Pre-condizionamento batteria", label(s?.batteryPreconditioning)]);
  rows.push(["Ventilazione", label(c?.ventilation)]);
  if (pre) {
    const last = tsDate(pre.lastCycleCompleted);
    rows.push(["Purificazione aria", [label(pre.runningStatus), last ? `ultima ${ago(last)}` : null].filter(Boolean).join(" · ") || null]);
  }
  for (const e of c?.errors ?? []) rows.push(["Errore clima", label(e), "warn"]);
  setRows("clim-rows", rows);
}

function renderCharging(d) {
  const t = d.targetSoc;
  const target = t?.targetSoc?.batteryChargeTargetLevel;
  $("target-block").hidden = !has(target);
  if (has(target)) {
    setText("chg-target", `${num(target)}%`);
    requestAnimationFrame(() => ($("chg-target-bar").style.width = `${Math.min(100, Number(target))}%`));
  }

  const rows = [];
  const pendingTarget = t?.pendingTargetSoc?.batteryChargeTargetLevel;
  if (has(pendingTarget) && pendingTarget !== target) rows.push(["Modifica in attesa", badge(`Obiettivo ${num(pendingTarget)}% · non confermato`)]);

  const override = d.chargeNow?.syncedOverrideChargeTimer?.override;
  if (has(override)) rows.push(["Carica ora", override ? "Attiva" : "Disattivata"]);
  if (d.chargeNow?.pendingOverrideChargeTimer) rows.push(["Carica ora", badge("In attesa di conferma")]);

  const g = d.globalChargeTimer?.globalChargeTimer;
  if (g && hhmm(g.start)) rows.push(["Timer di ricarica", `${hhmm(g.start)} – ${hhmm(g.stop)}${g.activated ? "" : " · disattivato"}`]);

  const amp = d.ampLimit?.ampLimit?.ampLimit;
  if (has(amp)) rows.push(["Limite corrente", `${num(amp)} A`]);
  const pendingAmp = d.ampLimit?.pendingAmpLimit?.ampLimit;
  if (has(pendingAmp) && pendingAmp !== amp) rows.push(["Modifica in attesa", badge(`Limite ${num(pendingAmp)} A · non confermato`)]);

  for (const loc of d.chargeLocations?.chargeLocations ?? []) {
    const name = loc.locationAlias || "Luogo di ricarica";
    const timer = (loc.chargeTimers ?? []).find((x) => x.activated);
    const bits = [
      has(loc.minimumSoc) ? `min ${num(loc.minimumSoc)}%` : null,
      has(loc.ampLimit) ? `${num(loc.ampLimit)} A` : null,
      timer ? `${hhmm(timer.start)} – ${hhmm(timer.stop)}` : null,
      loc.isOptimizedChargingEnabled ? "ottimizzata" : null,
    ].filter(Boolean);
    rows.push([name, bits.join(" · ") || "Configurato"]);
  }

  const b = d.battery;
  if (b) {
    if (b.estimatedChargingTimeMinutesToMinimumSoc > 0) rows.push(["Al minimo di carica", duration(b.estimatedChargingTimeMinutesToMinimumSoc)]);
    if (has(b.chargingCurrentAmps) && b.chargingCurrentAmps > 0) rows.push(["Corrente / tensione", `${num(b.chargingCurrentAmps)} A · ${num(b.chargingVoltageVolts)} V`]);
  }
  setRows("chg-rows", rows);
}

async function renderLocation(loc, atLoc, locs) {
  const c = loc?.coordinate;
  if (!c || !has(c.latitude) || !has(c.longitude)) {
    $("posizione").hidden = true;
    return;
  }
  setText("loc-age", ago(observedAt(loc)) ?? "", "");

  const place = atLoc?.locationId
    ? (locs?.chargeLocations ?? []).find((l) => l.locationId === atLoc.locationId)?.locationAlias ?? "Punto di ricarica"
    : null;
  setRows("loc-rows", [
    ["Presso:", place],
    ["Velocità:", has(loc.speed) ? `${num(loc.speed)} km/h` : null],
    ["Altitudine:", has(loc.altitude) ? `${num(loc.altitude)} m` : null],
  ]);

  try {
    const L = await loadLeaflet();
    const pos = [Number(c.latitude), Number(c.longitude)];
    if (!map) {
      map = L.map("map", { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(pos, 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      marker = L.marker(pos, {
        icon: L.divIcon({ className: "", html: '<div class="car-pin"></div>', iconSize: [56, 56], iconAnchor: [28, 28] }),
        keyboard: false,
      }).addTo(map);
    } else {
      marker.setLatLng(pos);
      map.setView(pos, map.getZoom());
    }
    setTimeout(() => map.invalidateSize(), 50);
  } catch {
    $("map").textContent = "Mappa non disponibile.";
  }
}

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.append(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.append(s);
  });
  return leafletPromise;
}

function renderHistory(rows) {
  const svg = $("history");
  const axis = $("history-axis");
  const NS = "http://www.w3.org/2000/svg";
  svg.replaceChildren();
  axis.replaceChildren();

  const pts = rows
    .map((r) => ({ t: new Date(r.observed_at ?? r.taken_at).getTime(), v: Number(r.soc) }))
    .filter((p) => !Number.isNaN(p.t) && !Number.isNaN(p.v));

  $("history-empty").hidden = pts.length >= 2;
  svg.style.display = pts.length >= 2 ? "" : "none";
  axis.hidden = pts.length < 2;
  setText("history-meta", pts.length >= 2 ? `${pts.length} rilevazioni` : "", "");
  if (pts.length < 2) return;

  const W = 600, H = 240, top = 16, bottom = 220;
  const end = Date.now();
  const start = end - 7 * 86_400_000;
  const x = (t) => ((t - start) / (end - start)) * W;
  const y = (v) => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top);

  const mk = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
    return el;
  };
  for (const v of [100, 50]) mk("line", { x1: 0, x2: W, y1: y(v), y2: y(v), class: "grid", "vector-effect": "non-scaling-stroke" });
  mk("line", { x1: 0, x2: W, y1: bottom, y2: bottom, class: "base", "vector-effect": "non-scaling-stroke" });

  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  mk("path", { d: `${d} L${x(pts.at(-1).t).toFixed(1)} ${bottom} L${x(pts[0].t).toFixed(1)} ${bottom} Z`, class: "area" });
  mk("path", { d, class: "line" });
  const lastP = pts.at(-1);
  mk("circle", { cx: x(lastP.t), cy: y(lastP.v), r: 4, fill: "var(--accent)" });

  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  svg.setAttribute("aria-label", `Livello batteria negli ultimi 7 giorni, tra ${num(min)} e ${num(max)} per cento, ora ${num(lastP.v)} per cento`);

  for (let i = 6; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000);
    const s = document.createElement("span");
    s.textContent = day.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "").toUpperCase();
    axis.append(s);
  }
}

// ───────────────────────── PWA ─────────────────────────

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
