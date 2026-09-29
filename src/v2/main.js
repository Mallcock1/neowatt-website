import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";

import { bindEmailCaptureForm } from "../js/form-email-capture";
import { initAscent } from "./ascent";
import { unlock } from "./gate";

const NEWSLETTER_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwp6yVhEvSS5paW-viO8SgCOGNKb2QHhi27FByRXu7LCUHovFD1-ND59oTq7-cRG76EbA/exec";

const STAGE_NAMES = ["Low Earth orbit", "Low Earth orbit", "Low Earth orbit", "Very low Earth orbit", "Medium Earth orbit", "High Earth orbit", "High Earth orbit"];

// Altimeter ticks: [altitude km, label, stop index to jump to]
const TICKS = [
  [250, "250 km", 3],
  [500, "500 km", 2],
  [20000, "20,000 km", 4]
];

// Within each panel the camera is parked for the first HOLD of the scroll
// (with a slow creep so scrolling always gives feedback), then rides to the
// next stop over the remainder. Panels are tall so one wheel notch moves the
// camera only a few percent of a ride.
const HOLD = 0.45;
// Off: it moves the scroll position on its own, which makes scrolling back up feel
// different from scrolling down. The pauses and ride easing make it unnecessary.
const MAGNET = false;
const MAGNET_IDLE_MS = 350;
const MAGNET_RANGE = 0.25;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const panels = [...document.querySelectorAll(".panel")];
// A panel can shorten its own pause with data-hold (the hero leaves quickly)
const holdOf = (i) => Number(panels[i].dataset.hold ?? HOLD);
const hudAlt = document.getElementById("hud-alt");
const hudStage = document.getElementById("hud-stage");
const hudScale = document.getElementById("hud-scale");
const hudMarker = document.getElementById("hud-marker");
const dimEl = document.getElementById("dim");

const panelTop = (i) => panels[i].offsetTop;
const panelSpan = (i) => (panels[i + 1]?.offsetTop ?? panelTop(i) + 1) - panelTop(i);

// Scroll position → { key: fractional keyframe with a plateau at every stop,
// creep: 0→1 across the plateau and back to 0 across the ride }
function scrollState() {
  const y = window.scrollY;
  for (let i = panels.length - 1; i >= 0; i--) {
    if (y >= panelTop(i)) {
      const p = Math.min((y - panelTop(i)) / panelSpan(i), 1);
      if (i === panels.length - 1) return { key: i, creep: 0 };
      const hold = holdOf(i);
      const riding = Math.max(0, (p - hold) / (1 - hold));
      const creep = p < hold ? p / hold : 1 - riding;
      return { key: i + riding, creep };
    }
  }
  return { key: 0, creep: 0 };
}

// Scroll positions that put the camera exactly at stop i: the start of its plateau
// (arriving) or the end of it (before departing).
const stopStart = (i) => panelTop(i);
const stopEnd = (i) => panelTop(i) + holdOf(i) * panelSpan(i) - 2;

function formatKm(km) {
  if (km < 1) return `${Math.max(0, Math.round(km * 1000))} m`;
  if (km < 100) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString("en-GB")} km`;
}

// Log altimeter scale: 100 km at the bottom, high orbit at the top
const LOG_MIN = Math.log10(100);
const LOG_MAX = Math.log10(36000);
const scaleFraction = (km) => Math.min(Math.max((Math.log10(Math.max(km, 100)) - LOG_MIN) / (LOG_MAX - LOG_MIN), 0), 1);

// ---------- Scroll control: smooth jumps, idle magnet, keyboard ----------
let scrollAnim = null;

function animateScrollTo(targetY, duration = 650) {
  cancelScrollAnim();
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 1) return;
  if (reducedMotion) {
    window.scrollTo({ top: targetY, behavior: "instant" });
    return;
  }
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    window.scrollTo({ top: startY + delta * ease(t), behavior: "instant" });
    scrollAnim = t < 1 ? requestAnimationFrame(step) : null;
  }
  scrollAnim = requestAnimationFrame(step);
}

function cancelScrollAnim() {
  if (scrollAnim) cancelAnimationFrame(scrollAnim);
  scrollAnim = null;
}

const goToStop = (i) => animateScrollTo(stopStart(Math.min(Math.max(i, 0), panels.length - 1)));

let lastUserScroll = performance.now();
let magnetArmed = false;

function initScrollControl() {
  const userInput = () => {
    cancelScrollAnim();
    lastUserScroll = performance.now();
    magnetArmed = true;
  };
  ["wheel", "touchstart", "touchmove", "pointerdown"].forEach((ev) => window.addEventListener(ev, userInput, { passive: true }));
  window.addEventListener(
    "scroll",
    () => {
      // Our own animations also fire scroll events; only user-driven ones count as activity
      if (!scrollAnim) lastUserScroll = performance.now();
    },
    { passive: true }
  );

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, button, a")) return;
    const { key } = scrollState();
    const stage = Math.round(key);
    if (["ArrowDown", "PageDown", " "].includes(e.key)) {
      e.preventDefault();
      goToStop(stage + 1);
    } else if (["ArrowUp", "PageUp"].includes(e.key)) {
      e.preventDefault();
      goToStop(key < stage - 0.02 ? stage : stage - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goToStop(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goToStop(panels.length - 1);
    }
  });
}

// If the user stops mid-ride near a stop, ease the page onto its plateau
function runMagnet(key) {
  if (!MAGNET || reducedMotion || scrollAnim || !magnetArmed) return;
  if (performance.now() - lastUserScroll < MAGNET_IDLE_MS) return;
  const stage = Math.round(key);
  const off = key - stage;
  if (Math.abs(off) < 0.015 || Math.abs(off) > MAGNET_RANGE) return;
  magnetArmed = false;
  animateScrollTo(off > 0 ? stopEnd(stage) : stopStart(stage));
}

function buildScale() {
  hudScale.insertAdjacentHTML(
    "beforeend",
    TICKS.map(
      ([km, text, stop]) =>
        `<button class="hud-tick" type="button" style="bottom:${scaleFraction(km) * 100}%" data-stop="${stop}" aria-label="Go to ${text}"><em>${text}</em></button>`
    ).join("")
  );
  hudScale.addEventListener("click", (e) => {
    const tick = e.target.closest("[data-stop]");
    if (tick) goToStop(Number(tick.dataset.stop));
  });
}

function initScene() {
  const canvas = document.getElementById("scene");
  let scene;
  try {
    scene = initAscent(canvas, { reducedMotion });
  } catch (err) {
    console.warn("WebGL unavailable, using static fallback", err);
    document.body.classList.add("no-webgl");
    panels.forEach((p) => p.classList.add("is-in"));
    return;
  }

  let key = scrollState().key;
  let creep = 0;
  let lastStageText = "";
  let lastRendered = null;
  // Resizing clears the canvas and can change the framing, so force a redraw
  window.addEventListener("resize", () => (lastRendered = null));

  function frame(time) {
    const target = scrollState();
    // Light inertia so the camera glides rather than snapping to the scrollbar
    if (reducedMotion) {
      key = target.key;
      creep = target.creep;
    } else {
      key += (target.key - key) * 0.08;
      creep += (target.creep - creep) * 0.08;
      if (Math.abs(target.key - key) < 0.0005) key = target.key;
      if (Math.abs(target.creep - creep) < 0.0005) creep = target.creep;
    }

    // Nothing animates on its own, so skip frames where nothing changed
    const stamp = `${key}|${creep}`;
    if (stamp !== lastRendered) {
      lastRendered = stamp;
      const { altitude, dim } = scene.render(key, time, creep);

      hudAlt.textContent = formatKm(altitude);
      hudMarker.style.bottom = `${scaleFraction(altitude) * 100}%`;
      const stage = Math.min(Math.round(key), STAGE_NAMES.length - 1);
      const stageText = STAGE_NAMES[stage];
      if (stageText !== lastStageText) {
        hudStage.textContent = stageText;
        lastStageText = stageText;
      }
      dimEl.style.opacity = dim;

      // Copy is shown only while the camera is parked at its stop
      panels.forEach((p, i) => p.classList.toggle("is-in", Math.abs(key - i) < 0.03));
    }

    runMagnet(target.key);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initNav() {
  const nav = document.getElementById("nav");
  // Hidden on the opening screen (the logo sits in the hero); slides in once you scroll
  const update = () => nav.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.35);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

document.documentElement.classList.add("js");
// Nothing is built until the preview password has been entered
unlock().then(() => {
  window.scrollTo({ top: 0, behavior: "instant" });
  buildScale();
  initScrollControl();
  initScene();
  initNav();
  bindEmailCaptureForm(document.getElementById("email-form"), NEWSLETTER_SCRIPT_URL);
  document.getElementById("year").textContent = new Date().getFullYear();
});
