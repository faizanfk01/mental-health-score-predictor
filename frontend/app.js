/* MindScore — form logic. Plain ES2020, no dependencies. */

const API_BASE_URL = "https://mental-health-score-predictor-xpug.onrender.com";

/* Interpretation bands, cut on the training-data quartiles. */
const BANDS = [
  { max: 5.1,      key: "low",     label: "Lower" },
  { max: 6.1,      key: "midlow",  label: "Mid-low" },
  { max: 7.1,      key: "midhigh", label: "Upper-mid" },
  { max: Infinity, key: "high",    label: "Upper" },
];

const SELECTS = ["gender", "academic_level", "most_used_platform", "purpose_of_use"];
const HOURS   = ["avg_daily_usage_hours", "study_hours", "physical_activity_hours", "sleep_hours_per_night"];

const LABELS = {
  age: "Age",
  country: "Country",
  gender: "Gender",
  academic_level: "Academic level",
  most_used_platform: "Most used platform",
  purpose_of_use: "Purpose of use",
  avg_daily_usage_hours: "Daily social media use",
  daily_unlocks: "Phone unlocks per day",
  study_hours: "Study Hours",
  physical_activity_hours: "Physical Activity",
  sleep_hours_per_night: "Sleep",
  stress_level: "Stress level",
};

const $ = (id) => document.getElementById(id);
const form = $("form");
const stressRadios = () => document.querySelectorAll('input[name="stress_level"]');

/* ---------- ring geometry, derived from the SVG itself ---------- */
const ringValue = $("ring-value");
const CIRCUMFERENCE = 2 * Math.PI * ringValue.r.baseVal.value;
ringValue.style.strokeDasharray = String(CIRCUMFERENCE);

function resetRing() {
  ringValue.style.strokeDashoffset = String(CIRCUMFERENCE);
}
resetRing();

/* ---------- reading values ---------- */
function readValue(name) {
  if (name === "stress_level") {
    const checked = document.querySelector('input[name="stress_level"]:checked');
    return checked ? checked.value : "";
  }
  return $(name).value;
}

/* ---------- selects: dim the "Select" placeholder ---------- */
function syncSelects() {
  SELECTS.forEach((name) => {
    const select = $(name);
    select.classList.toggle("is-empty", select.value === "");
  });
}
SELECTS.forEach((name) => $(name).addEventListener("change", syncSelects));
syncSelects();

/* ---------- sliders: live readout + filled track ---------- */
function syncSlider(input) {
  const value = Number(input.value);
  const min = Number(input.min);
  const max = Number(input.max);
  $(`${input.id}-out`).textContent = `${value.toFixed(1)} hrs`;
  input.style.setProperty("--fill", `${((value - min) / (max - min)) * 100}%`);
}

function syncSliders() {
  HOURS.forEach((name) => syncSlider($(name)));
}

HOURS.forEach((name) => $(name).addEventListener("input", () => syncSlider($(name))));
syncSliders();

/* ---------- inline errors ---------- */
function setError(name, message) {
  const el = $(`${name}-err`);
  if (!el) return;

  if (name === "stress_level") {
    $("stress_level-group").classList.toggle("is-invalid", Boolean(message));
  } else {
    const input = $(name);
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  el.textContent = message;
  el.hidden = !message;
}

function clearErrors() {
  Object.keys(LABELS).forEach((name) => setError(name, ""));
}

function focusField(name) {
  if (name === "stress_level") stressRadios()[0].focus();
  else $(name).focus();
}

/* Clear a field's error as soon as it is edited. */
Object.keys(LABELS).forEach((name) => {
  if (name === "stress_level") {
    stressRadios().forEach((radio) => radio.addEventListener("change", () => setError(name, "")));
    return;
  }
  const input = $(name);
  input.addEventListener(input.tagName === "SELECT" ? "change" : "input", () => setError(name, ""));
});

/* ---------- validation ---------- */
/** @returns {string[]} names of the fields that failed */
function validate(raw) {
  const failed = [];
  const add = (name, message) => { failed.push(name); setError(name, message); };

  const age = Number(raw.age);
  if (!raw.age.trim()) add("age", "Enter your age.");
  else if (!Number.isInteger(age) || age < 10 || age > 100) add("age", "Must be a whole number from 10 to 100.");

  if (!raw.country.trim()) add("country", "Enter your country.");

  const unlocks = Number(raw.daily_unlocks);
  if (!raw.daily_unlocks.trim()) add("daily_unlocks", "Enter a number.");
  else if (!Number.isInteger(unlocks) || unlocks < 0) add("daily_unlocks", "Must be a whole number, 0 or more.");

  HOURS.forEach((name) => {
    const hours = Number(raw[name]);
    if (!raw[name].trim()) add(name, "Required.");
    else if (!Number.isFinite(hours) || hours < 0 || hours > 24) add(name, "Must be 0–24 hrs.");
  });

  SELECTS.forEach((name) => {
    if (!raw[name]) add(name, "Please choose an option.");
  });

  if (!raw.stress_level) add("stress_level", "Pick a stress level.");

  return failed;
}

function buildPayload(raw) {
  const payload = {
    age: parseInt(raw.age, 10),
    country: raw.country.trim(),
    daily_unlocks: parseInt(raw.daily_unlocks, 10),
    stress_level: raw.stress_level,
  };
  SELECTS.forEach((name) => { payload[name] = raw[name]; });
  HOURS.forEach((name) => { payload[name] = Number(raw[name]); });
  return payload;
}

/* ---------- panel: exactly one state visible ---------- */
const STATES = ["empty", "loading", "error", "result"];

function showState(which) {
  STATES.forEach((key) => { $(`state-${key}`).hidden = key !== which; });
}

function showError(text) {
  $("error-text").textContent = text;
  showState("error");
}

function render(score) {
  const band = BANDS.find((b) => score < b.max);
  const clamped = Math.min(Math.max(score, 0), 10);

  $("score").textContent = String(Math.round(score * 100) / 100);
  $("band").textContent = band.label;
  $("band").dataset.band = band.key;

  const ring = $("ring");
  ring.dataset.band = band.key;
  ring.setAttribute("aria-valuenow", String(score));
  ring.setAttribute("aria-valuetext", `${score} out of 10, ${band.label}`);

  showState("result");
  // Set the offset once the ring is visible so it sweeps from empty.
  requestAnimationFrame(() => {
    ringValue.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - clamped / 10));
  });
}

/** Map a FastAPI 422 body onto the fields it refers to. */
function showServerErrors(detail) {
  let first = null;
  (Array.isArray(detail) ? detail : []).forEach((item) => {
    const name = (item.loc || []).find((part) => part in LABELS);
    if (name) {
      setError(name, item.msg || "Invalid value.");
      first = first || name;
    }
  });
  showError(first ? "Please fix the highlighted fields." : "The server rejected the submission.");
  if (first) focusField(first);
}

/* ---------- submit ---------- */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearErrors();

  const raw = {};
  Object.keys(LABELS).forEach((name) => { raw[name] = readValue(name); });

  const failed = validate(raw);
  if (failed.length) {
    showError(`Please complete ${failed.length} field${failed.length > 1 ? "s" : ""} in the form.`);
    focusField(failed[0]);
    return;
  }

  $("submit").disabled = true;
  resetRing();
  showState("loading");

  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(raw)),
      signal: AbortSignal.timeout(60000),
    });

    if (response.status === 422) {
      const detail = await response.json().then((body) => body.detail).catch(() => null);
      showServerErrors(detail);
      return;
    }

    if (response.status === 429) {
      showError("Too many requests — please wait a minute and try again.");
      return;
    }

    if (!response.ok) {
      showError("Something went wrong on the server. Please try again in a moment.");
      return;
    }

    const data = await response.json();
    const score = Number(data.predicted_mental_health_score);
    if (!Number.isFinite(score)) {
      showError("The server did not return a score.");
      return;
    }

    render(score);
  } catch {
    showError("Could not reach the server. It may be waking up — please try again in a minute.");
  } finally {
    $("submit").disabled = false;
  }
});

/* ---------- start over ---------- */
$("restart").addEventListener("click", () => form.reset());

form.addEventListener("reset", () => {
  // Let the browser restore the markup defaults first.
  requestAnimationFrame(() => {
    clearErrors();
    syncSelects();
    syncSliders();
    resetRing();
    showState("empty");
    $("age").focus();
  });
});
