import { SUPABASE_URL, SUPABASE_ANON_KEY, CAR_NAME, REFRESH_MINUTES } from "./config.js";

// ───────────────────────── Avvio ─────────────────────────

const params = new URLSearchParams(location.search);
const DEMO = params.has("demo") || SUPABASE_URL.includes("<");
const FUNCTION_URL = `${SUPABASE_URL.trim().replace(/\/+$/, "")}/functions/v1/polestar`;

let supabase = null;
let snapshot = null;
let lastFetch = 0;
let energyPeriod = "SinceCharge";
let map = null;
let marker = null;
let chargeLayer = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("car-name").textContent = CAR_NAME;
  wireUi();
  registerServiceWorker();

  if (DEMO) {
    showDashboard();
    showBanner(
      params.has("demo")
        ? "Modalità dimostrativa: valori di esempio, nessuna chiamata reale."
        : "Modalità dimostrativa: config.js contiene ancora i segnaposto. Inserisci SUPABASE_URL e SUPABASE_ANON_KEY per vedere i dati reali.",
    );
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
    b.addEventListener("click", () => setPeriod(b.dataset.period)),
  );

  // Aggiorna al ritorno sull'app e periodicamente mentre è visibile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastFetch > 120_000) refresh();
  });
  setInterval(() => {
    if (document.visibilityState === "visible" && !$("view-dash").hidden) refresh();
  }, REFRESH_MINUTES * 60_000);

  // Evidenzia nel menu la sezione in cui ci si trova.
  const links = [...document.querySelectorAll(".tabs a, .bottom-nav a")];
  let lockUntil = 0;
  const setActive = (id) => links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${id}`));

  links.forEach((a) =>
    a.addEventListener("click", () => {
      setActive(a.getAttribute("href").slice(1));
      lockUntil = Date.now() + 1000; // durante lo scorrimento animato vale la voce cliccata
    }),
  );

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (Date.now() < lockUntil) return;
      const offset = window.innerWidth <= 760 ? 48 : 150;
      const sections = ["panoramica", "viaggi", "salute", "clima", "ricarica", "posizione", "storico"]
        .map((id) => $(id))
        .filter((el) => el && !el.hidden && el.offsetParent)
        .map((el) => ({ id: el.id, top: Math.round(el.getBoundingClientRect().top) }))
        .sort((a, b) => a.top - b.top);
      let current = sections[0]?.id;
      let currentTop = -Infinity;
      for (const s of sections) {
        // A parità di altezza (sezioni affiancate) resta la prima.
        if (s.top <= offset && s.top > currentTop) {
          current = s.id;
          currentTop = s.top;
        }
      }
      if (current) setActive(current);
    });
  }, { passive: true });
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
  let res;
  try {
    res = await fetch(`${FUNCTION_URL}?action=snapshot`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
    });
  } catch {
    // Il browser blocca la risposta (CORS) oppure la funzione non esiste o non è raggiungibile.
    throw Object.assign(new Error("network"), { code: navigator.onLine ? "UNREACHABLE" : "OFFLINE" });
  }
  if (res.status === 401) {
    await supabase.auth.signOut();
    throw new Error("unauthorized");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error("api"), { code: body.error ?? `HTTP_${res.status}`, info: body, http: res.status });
  return body;
}

/** Traduce un errore in un messaggio che dice cosa controllare. */
function explain(e) {
  const code = String(e.code ?? "");
  const up = e.info?.upstream;
  if (code === "OFFLINE") return "Sei offline: i dati verranno aggiornati quando torna la connessione.";
  if (code === "UNREACHABLE")
    return "La funzione server non risponde al sito. Cause più probabili: funzione non pubblicata, oppure ALLOWED_ORIGINS diverso dall'indirizzo di questo sito (" + location.origin + ").";
  if (code === "CONFIG_MISSING")
    return `Configurazione incompleta della funzione: mancano ${(e.info?.missing ?? []).join(", ")}. Impostali con "supabase secrets set" e ripubblica.`;
  if (code === "NOT_OWNER") return "Il tuo utente non corrisponde a OWNER_USER_ID impostato nella funzione.";
  if (code === "HTTP_404") return "Funzione non trovata: controlla di averla pubblicata con il nome \"polestar\" e l'URL in config.js.";
  if (e.info?.stage === "token")
    return up === 401 || up === 400
      ? `Polestar ha rifiutato le credenziali (${code}). Controlla POLESTAR_CLIENT_ID e POLESTAR_CLIENT_SECRET.`
      : `Errore nel collegamento a Polestar durante l'autenticazione (${code}, ${up}).`;
  if (up === 403 || code.startsWith("AUTHZ"))
    return `Polestar nega l'accesso al veicolo (${code}). Controlla POLESTAR_ACCOUNT_ID e che la credenziale sia collegata all'auto.`;
  if (code === "NO_VEHICLES") return "La credenziale non ha veicoli associati (oppure l'auto non risulta in un mercato UE/SEE).";
  return `Errore nel recupero dei dati (${code}${up ? `, ${up}` : ""}).`;
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
      showBanner(explain(e));
      setText("freshness", "Dati non aggiornati");
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

/** Orario di un istante: "14:20" se è oggi, altrimenti "15/10 14:20". */
function clock(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })} ${time}`;
}

/** Punto cardinale a partire dai gradi rispetto al nord. */
const POINTS = ["Nord", "Nord-est", "Est", "Sud-est", "Sud", "Sud-ovest", "Ovest", "Nord-ovest"];
const compass = (deg) => (has(deg) ? POINTS[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8] : null);

/** Energia in kWh partendo da un valore in Wh. */
const kwh = (wh, digits = 1) => (has(wh) ? `${num(Number(wh) / 1000, digits)} kWh` : null);

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
  NOT_PROVIDING_POWER: "Nessuna corrente",
  PROVIDING_POWER: "Eroga corrente",
  TIMER: "Da timer",
  MANUAL: "Manuale",
  REMOTE: "Da remoto",
  APP: "Da app",
  HOME: "Casa",
  WORK: "Lavoro",
  PUBLIC: "Pubblico",
  OTHER: "Altro",
};
// Parole tecniche che non aggiungono significato nelle etichette di ripiego.
const GENERIC = new Set(["STATUS", "TYPE", "REASON", "MODE", "STATE", "LEVEL", "INTENSITY", "SETTING"]);
const WORD_KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length);

function label(v) {
  if (!has(v)) return null;
  const s = String(v).toUpperCase();
  if (/UNSPECIFIED|UNKNOWN/.test(s)) return null;
  for (const k of WORD_KEYS) if (s === k || s.endsWith(`_${k}`)) return WORDS[k];
  const words = s.split("_").filter((w) => w && !GENERIC.has(w));
  const tail = (words.length ? words : s.split("_")).slice(-2).join(" ").toLowerCase();
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
  renderTrips(d.odometer, d.battery);
  renderEnergy(d.battery);
  renderHealth(d.health);
  renderClimate(d.parkingClimatization, d.parkingClimateTimer, d.preCleaning, d.battery);
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

  // Dettaglio di ogni apertura, nel pannello espandibile.
  const PARTS = [
    ["frontLeftDoor", "Porta anteriore sinistra"],
    ["frontRightDoor", "Porta anteriore destra"],
    ["rearLeftDoor", "Porta posteriore sinistra"],
    ["rearRightDoor", "Porta posteriore destra"],
    ["frontLeftWindow", "Finestrino anteriore sinistro"],
    ["frontRightWindow", "Finestrino anteriore destro"],
    ["rearLeftWindow", "Finestrino posteriore sinistro"],
    ["rearRightWindow", "Finestrino posteriore destro"],
    ["hood", "Cofano"],
    ["tailgate", "Portellone"],
    ["tailgateLock", "Serratura portellone"],
    ["tankLid", "Sportello di ricarica"],
    ["sunroof", "Tetto"],
    ["alarm", "Allarme"],
  ];
  const detail = PARTS.map(([k, name]) => [name, label(ext?.[k]), isOpen(ext?.[k]) || /UNLOCKED|TRIGGERED/i.test(String(ext?.[k] ?? "")) ? "warn" : null]);
  $("ext-details").hidden = !setRows("ext-rows", detail);
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

// ─── Viaggi ───
// I tre contachilometri parziali e i relativi consumi usano gli stessi tre periodi dell'API.
const TRIPS = [
  { period: "SinceCharge", title: "Dall'ultima carica", km: "tripMeterSinceChargeKm", speed: "averageSpeedKmPerHourSinceCharge",
    cons: "averageEnergyConsumptionKwhPer100KmSinceCharge", total: "totalEnergyConsumptionWhSinceCharge" },
  { period: "Automatic", title: "Ultimo viaggio", km: "tripMeterAutomaticKm", speed: "averageSpeedKmPerHourAutomatic",
    cons: "averageEnergyConsumptionKwhPer100KmAutomatic", total: "totalEnergyConsumptionWhAutomatic" },
  { period: "Manual", title: "Parziale manuale", km: "tripMeterManualKm", speed: "averageSpeedKmPerHour",
    cons: "averageEnergyConsumptionKwhPer100Km", total: "totalEnergyConsumptionWh" },
];

function setPeriod(period) {
  energyPeriod = period;
  document.querySelectorAll(".segmented button, .trip").forEach((x) =>
    x.setAttribute("aria-pressed", String(x.dataset.period === period)),
  );
  if (snapshot) renderEnergy(snapshot.data.battery);
}

function renderTrips(o, b) {
  const box = $("trips");
  box.replaceChildren();
  for (const t of TRIPS) {
    const km = o?.[t.km];
    const rows = [
      ["Velocità media", has(o?.[t.speed]) ? `${num(o[t.speed])} km/h` : null],
      ["Consumo medio", has(b?.[t.cons]) ? `${num(b[t.cons], 1)} kWh/100 km` : null],
      ["Energia totale", kwh(b?.[t.total])],
    ].filter(([, v]) => has(v));
    if (!has(km) && !rows.length) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "trip";
    btn.dataset.period = t.period;
    btn.setAttribute("aria-pressed", String(t.period === energyPeriod));
    btn.addEventListener("click", () => setPeriod(t.period));

    const title = document.createElement("span");
    title.className = "eyebrow";
    title.textContent = t.title;
    const big = document.createElement("span");
    big.className = "trip-km";
    big.append(has(km) ? num(km, km < 100 ? 1 : 0) : "—");
    const unit = document.createElement("small");
    unit.textContent = " km";
    big.append(unit);

    const dl = document.createElement("dl");
    for (const [k, v] of rows) {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      row.append(dt, dd);
      dl.append(row);
    }
    btn.append(title, big, dl);
    box.append(btn);
  }
  $("viaggi").hidden = !box.children.length;
}

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

  // Pannello espandibile: ogni controllo, compresi quelli regolari.
  const status = (v) => (has(v) ? (isOk(v) ? ["Regolare", null] : [label(v) ?? "Da verificare", "warn"]) : [null, null]);
  const checks = [
    ["Liquido freni", h.brakeFluidLevelWarning],
    ["Liquido di raffreddamento", h.engineCoolantLevelWarning],
    ["Olio", h.oilLevelWarning],
    ["Liquido lavavetri", h.washerFluidLevelWarning],
    ["Batteria 12 V", h.lowVoltageBatteryWarning],
  ].map(([name, v]) => [name, ...status(v)]);

  const lightRows = Object.entries(h.lightWarnings ?? {})
    .map(([k, v]) => [lightName(k), ...status(v)])
    .filter(([, v]) => has(v))
    .sort((a, b) => (a[2] === "warn" ? -1 : 0) - (b[2] === "warn" ? -1 : 0) || a[0].localeCompare(b[0], "it"));

  const count = setRows("check-rows", [...checks, ...lightRows]);
  $("check-details").hidden = !count;
  setText("check-summary", lightRows.length ? `Dettaglio liquidi e luci (${lightRows.length} luci)` : "Dettaglio controlli");
}

// Nomi delle luci: tipo + posizione, ricavati dal nome del campo (es. brakeLightLeft).
// [prefisso del campo, nome, genere]; "fogLightRear" va prima di "fogLight" perché più specifico.
const LIGHT_TYPES = [
  ["turnIndicator", "Indicatore di direzione", "m"],
  ["lowBeam", "Anabbagliante", "m"],
  ["highBeam", "Abbagliante", "m"],
  ["fogLightRear", "Retronebbia", "m"],
  ["fogLight", "Fendinebbia", "m"],
  ["brakeLight", "Luce stop", "f"],
  ["positionLight", "Luce di posizione", "f"],
  ["daytimeRunningLight", "Luce diurna", "f"],
  ["registrationPlateLight", "Luce targa", "f"],
  ["sideMarkerLight", "Luce d'ingombro", "f"],
  ["reverseLight", "Luce di retromarcia", "f"],
  ["corneringLight", "Luce di svolta", "f"],
];
const LIGHT_PLACES = {
  FrontLeft: ["anteriore sinistro", "anteriore sinistra"], FrontRight: ["anteriore destro", "anteriore destra"],
  RearLeft: ["posteriore sinistro", "posteriore sinistra"], RearRight: ["posteriore destro", "posteriore destra"],
  SideLeft: ["laterale sinistro", "laterale sinistra"], SideRight: ["laterale destro", "laterale destra"],
  Left: ["sinistro", "sinistra"], Right: ["destro", "destra"],
  Front: ["anteriore", "anteriore"], Rear: ["posteriore", "posteriore"], Center: ["centrale", "centrale"],
  Any: ["(complessivo)", "(complessivo)"], "": ["", ""],
};
function lightName(key) {
  const type = LIGHT_TYPES.find(([p]) => key.startsWith(p));
  if (!type) return key;
  const suffix = key.slice(type[0].length);
  const place = LIGHT_PLACES[suffix]?.[type[2] === "m" ? 0 : 1] ?? suffix;
  return `${type[1]} ${place}`.trim();
}

const isRunning = (v) => /(^|_)(RUNNING|STARTED|ACTIVE|ON)$/i.test(String(v ?? "")) && !/NOT_RUNNING|INACTIVE/i.test(String(v));
const heating = (v) => {
  const l = label(v);
  return l && l !== "Spento" ? `Riscaldamento ${l.toLowerCase()}` : l;
};

function renderClimate(c, timers, pre, battery) {
  setText("clim-temp", num(c?.requestedCompartmentTemperatureCelsius ?? timers?.timerSettings?.requestedCompartmentTemperatureCelsius, 1));
  const status = c?.runningStatus ?? c?.mainClimateRunningStatus;
  const running = label(status);
  const end = tsDate(c?.endingAt);
  setText("clim-state", running ? `richiesti · ${running.toLowerCase()}${end && end > new Date() ? ` fino alle ${clock(end)}` : ""}` : "richiesti", "");

  const rows = [];
  if (isRunning(status)) {
    rows.push(["Avviato", [clock(tsDate(c?.startedAt)), label(c?.startReason)?.toLowerCase()].filter(Boolean).join(" · ") || null]);
  } else if (has(c?.startReason)) {
    rows.push(["Ultimo avvio", label(c.startReason)]);
  }

  // Pre-condizionamento manuale (dal dominio batteria).
  const mp = battery?.manualPreconditioning;
  if (mp) {
    const mpEnd = tsDate(mp.endingAt);
    const mpStart = tsDate(mp.startedAt);
    const active = isRunning(mp.preconditioningStatus);
    rows.push(["Pre-condizionamento manuale", [label(mp.preconditioningStatus),
      active && mpEnd ? `fino alle ${clock(mpEnd)}` : null,
      !active && mpStart ? `ultimo ${ago(mpStart)}` : null].filter(Boolean).join(" · ") || null]);
    if (has(mp.unavailableReason)) rows.push(["Non disponibile perché", label(mp.unavailableReason), "warn"]);
  }

  for (const t of timers?.parkingClimateTimers ?? []) {
    const when = hhmm(t.readyAt);
    if (!when) continue;
    const sd = t.startDate;
    const onDate = has(sd?.day) ? `il ${String(sd.day).padStart(2, "0")}/${String(sd.month).padStart(2, "0")}` : "una volta";
    rows.push([`Pronta alle ${when}`, `${t.repeat ? days(t.weekdays) ?? "Ripetuto" : onDate}${t.activated ? "" : " · disattivato"}`]);
  }
  if ((timers?.pendingParkingClimateTimers ?? []).length) rows.push(["Modifiche timer", badge("In attesa di conferma")]);
  if ((timers?.pendingDeleteParkingClimateTimers ?? []).length) rows.push(["Timer da eliminare", badge("In attesa di conferma")]);
  if (timers?.pendingTimerSettings) rows.push(["Impostazioni timer", badge("Modifica non confermata")]);

  const s = timers?.timerSettings;
  const seats = s?.seatHeatingIntensity;
  rows.push(["Sedili anteriori", heating(seats?.frontRowLeftSeat ?? c?.requestedFrontLeftSeat)]);
  rows.push(["Sedili posteriori", heating(seats?.rearRowLeftSeat ?? c?.requestedRearLeftSeat)]);
  rows.push(["Volante", heating(s?.steeringWheelHeatingIntensity ?? c?.requestedSteeringWheelHeating)]);
  rows.push(["Pre-condizionamento batteria", label(s?.batteryPreconditioning)]);
  rows.push(["Ventilazione", label(c?.ventilation)]);

  if (pre) {
    const last = tsDate(pre.lastCycleCompleted);
    const preRunning = isRunning(pre.runningStatus);
    rows.push(["Purificazione aria", [label(pre.runningStatus),
      preRunning && has(pre.runtimeLeftMinutes) ? `ancora ${duration(pre.runtimeLeftMinutes)}` : null,
      !preRunning && last ? `ultima ${ago(last)}` : null].filter(Boolean).join(" · ") || null]);
    if (pre.lastCycleValid === false) rows.push(["Ultimo ciclo", "Non completato correttamente", "warn"]);
    const measured = tsDate(pre.measurementDate);
    if (measured) rows.push(["Misurazione aria", ago(measured)]);
    if (has(pre.error) && !isOk(pre.error)) rows.push(["Errore purificazione", label(pre.error), "warn"]);
  }
  for (const w of c?.warnings ?? []) rows.push(["Avviso clima", label(w), "warn"]);
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
  const pg = d.globalChargeTimer?.pendingGlobalChargeTimer;
  if (pg && hhmm(pg.start)) rows.push(["Modifica in attesa", badge(`Timer ${hhmm(pg.start)} – ${hhmm(pg.stop)} · non confermato`)]);

  const amp = d.ampLimit?.ampLimit?.ampLimit;
  if (has(amp)) rows.push(["Limite corrente", `${num(amp)} A`]);
  const pendingAmp = d.ampLimit?.pendingAmpLimit?.ampLimit;
  if (has(pendingAmp) && pendingAmp !== amp) rows.push(["Modifica in attesa", badge(`Limite ${num(pendingAmp)} A · non confermato`)]);

  for (const loc of d.chargeLocations?.chargeLocations ?? []) {
    const name = loc.locationAlias || "Luogo di ricarica";
    const timer = (loc.chargeTimers ?? []).find((x) => x.activated);
    const departure = (loc.departureTimes ?? []).find((x) => x.activated);
    const type = label(loc.locationType);
    const bits = [
      type !== name ? type : null,
      has(loc.minimumSoc) ? `min ${num(loc.minimumSoc)}%` : null,
      has(loc.ampLimit) ? `${num(loc.ampLimit)} A` : null,
      timer ? `${hhmm(timer.start)} – ${hhmm(timer.stop)}` : null,
      departure ? `partenza ${hhmm(departure.departureTime)}${days(departure.activeDays) ? ` (${days(departure.activeDays)})` : ""}` : null,
      loc.isOptimizedChargingEnabled ? "ottimizzata" : null,
      loc.isBidirectionalChargingEnabled ? "bidirezionale" : null,
    ].filter(Boolean);
    rows.push([name, bits.join(" · ") || "Configurato"]);
  }
  if ((d.chargeLocations?.pendingChargeLocations ?? []).length) rows.push(["Luoghi di ricarica", badge("Modifiche non confermate")]);
  if ((d.chargeLocations?.pendingDeleteChargeLocations ?? []).length) rows.push(["Luoghi da eliminare", badge("In attesa di conferma")]);

  const b = d.battery;
  if (b) {
    rows.push(["Alimentazione caricatore", label(b.chargerPowerStatus)]);
    if (b.estimatedChargingTimeMinutesToMinimumSoc > 0) rows.push(["Al minimo di carica", duration(b.estimatedChargingTimeMinutesToMinimumSoc)]);
    if (b.estimatedChargingTimeMinutesToTargetDistance > 0) rows.push(["All'autonomia desiderata", duration(b.estimatedChargingTimeMinutesToTargetDistance)]);
    if (has(b.chargingCurrentAmps) && b.chargingCurrentAmps > 0) rows.push(["Corrente / tensione", `${num(b.chargingCurrentAmps)} A · ${num(b.chargingVoltageVolts)} V`]);
    // L'unità del limite di potenza non è documentata: valori grandi sono W, piccoli kW.
    const pl = b.dischargeInfo?.powerLimit;
    if (has(pl) && pl > 0) rows.push(["Limite di potenza", `${num(pl > 1000 ? pl / 1000 : pl, 1)} kW`]);
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

  const saved = locs?.chargeLocations ?? [];
  const here = atLoc?.locationId ? saved.find((l) => l.locationId === atLoc.locationId) : null;
  const arrived = tsDate(atLoc?.arrivedAtTimestamp) ?? (atLoc?.arrivedAt ? new Date(atLoc.arrivedAt) : null);
  const place = atLoc?.locationId
    ? `${here?.locationAlias ?? "Punto di ricarica"}${clock(arrived) ? ` · dalle ${clock(arrived)}` : ""}`
    : null;
  const heading = Number(loc.heading);
  const moving = Number(loc.speed) > 0;
  setRows("loc-rows", [
    ["Presso:", place],
    ["Velocità:", has(loc.speed) ? `${num(loc.speed)} km/h` : null],
    ["Direzione:", has(loc.heading) ? `${compass(heading)} (${num(heading)}°)` : null],
    ["Altitudine:", has(loc.altitude) ? `${num(loc.altitude)} m` : null],
  ]);

  try {
    const L = await loadLeaflet();
    const pos = [Number(c.latitude), Number(c.longitude)];
    // Solo numeri nell'HTML del segnaposto: nessun testo proveniente dall'API.
    const arrow = has(loc.heading) && Number.isFinite(heading)
      ? `<span class="heading" style="transform:rotate(${heading.toFixed(0)}deg)${moving ? "" : ";opacity:.55"}"></span>` : "";
    const icon = L.divIcon({ className: "", html: `<div class="car-pin">${arrow}</div>`, iconSize: [56, 56], iconAnchor: [28, 28] });
    if (!map) {
      map = L.map("map", { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView(pos, 15);
      // Stile scuro CARTO "Dark Matter" (dati OpenStreetMap). Il servizio richiede di sapere da quale
      // sito arriva la richiesta: inviamo solo l'origine (es. https://utente.github.io), mai il percorso.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
        subdomains: "abcd",
        referrerPolicy: "strict-origin",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      chargeLayer = L.layerGroup().addTo(map);
      marker = L.marker(pos, { icon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      marker.setLatLng(pos);
      marker.setIcon(icon);
      map.setView(pos, map.getZoom());
    }

    // Luoghi di ricarica salvati (solo i modelli che li forniscono).
    chargeLayer.clearLayers();
    for (const l of saved) {
      const lat = Number(l.coordinate?.latitude);
      const lon = Number(l.coordinate?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const pin = L.divIcon({
        className: "",
        html: '<div class="charge-pin"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2 L5 14 h6 l-1 8 l8-12 h-6 z"/></svg></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const tip = document.createElement("span");
      tip.textContent = l.locationAlias || "Luogo di ricarica"; // testo, mai HTML
      L.marker([lat, lon], { icon: pin, keyboard: false }).bindTooltip(tip, { direction: "top", offset: [0, -10] }).addTo(chargeLayer);
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
