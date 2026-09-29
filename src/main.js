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
// If scrolling stops part-way through a ride, carry on to the stop the visitor was
// heading for, so nobody is left between stops with nothing on screen. It always
// follows the direction of the last scroll, so down and up behave the same way.
const SETTLE_IDLE_MS = 220;
// Menu: [label, panel to jump to]
const MENU = [
  ["Home", 0],
  ["Vision", 4],
  ["Team", 5],
  ["Contact", 6]
];

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
      // Eases in and out, so the slow dolly never reverses abruptly where a pause
      // turns into a ride
      const ease = (t) => t * t * (3 - 2 * t);
      const creep = p < hold ? ease(p / hold) : 1 - ease(Math.min(riding / 0.3, 1));
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

function animateScrollTo(targetY, duration = 650, inOut = false) {
  cancelScrollAnim();
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 1) return;
  if (reducedMotion) {
    window.scrollTo({ top: targetY, behavior: "instant" });
    return;
  }
  const t0 = performance.now();
  const ease = inOut ? (t) => t * t * (3 - 2 * t) : (t) => 1 - Math.pow(1 - t, 3);
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

const clampStop = (i) => Math.min(Math.max(i, 0), panels.length - 1);
// Step to a neighbouring stop by scrolling there, so the ride plays
const goToStop = (i) => animateScrollTo(stopStart(clampStop(i)));

// Jump to any stop from a button: fade to black, move, fade back in. Scrolling there
// instead would race the camera through every stop on the way.
let snapCamera = false;
let fading = false;
function fadeToStop(i) {
  if (fading) return;
  const y = stopStart(clampStop(i));
  if (Math.abs(window.scrollY - y) < 2) return;
  cancelScrollAnim();
  if (reducedMotion) {
    snapCamera = true;
    window.scrollTo({ top: y, behavior: "instant" });
    return;
  }
  fading = true;
  document.documentElement.classList.add("is-fading");
  setTimeout(() => {
    snapCamera = true;
    window.scrollTo({ top: y, behavior: "instant" });
    // Let the scene draw at the new stop before the fade lifts
    setTimeout(() => {
      document.documentElement.classList.remove("is-fading");
      fading = false;
    }, 120);
  }, 380);
}

let lastUserScroll = performance.now();
let lastScrollY = 0;
let lastDirection = 1;
let settleArmed = false;
let touching = false;

function initScrollControl() {
  const userInput = () => {
    cancelScrollAnim();
    lastUserScroll = performance.now();
  };
  ["wheel", "touchstart", "touchmove", "pointerdown"].forEach((ev) => window.addEventListener(ev, userInput, { passive: true }));
  window.addEventListener("touchstart", () => (touching = true), { passive: true });
  ["touchend", "touchcancel"].forEach((ev) =>
    window.addEventListener(ev, () => {
      touching = false;
      lastUserScroll = performance.now();
    })
  );
  lastScrollY = window.scrollY;
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      // Our own animations also fire scroll events; only user-driven ones count
      if (!scrollAnim) {
        if (y !== lastScrollY) lastDirection = y > lastScrollY ? 1 : -1;
        lastUserScroll = performance.now();
        settleArmed = true;
      }
      lastScrollY = y;
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
      fadeToStop(0);
    } else if (e.key === "End") {
      e.preventDefault();
      fadeToStop(panels.length - 1);
    }
  });
}

function runSettle(key) {
  if (reducedMotion || scrollAnim || !settleArmed || touching) return;
  if (performance.now() - lastUserScroll < SETTLE_IDLE_MS) return;
  settleArmed = false;
  const i = Math.floor(key);
  const along = key - i;
  if (along < 0.004 || i >= panels.length - 1) return; // parked at a stop already
  const remaining = lastDirection > 0 ? 1 - along : along;
  animateScrollTo(lastDirection > 0 ? stopStart(i + 1) : stopEnd(i), 700 + 900 * remaining, true);
}

function buildMenu() {
  const button = document.getElementById("menu-button");
  const menu = document.getElementById("menu");
  menu.innerHTML = MENU.map(([name, stop]) => `<li><button type="button" data-stop="${stop}">${name}</button></li>`).join("");
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[data-stop]");
    if (!item) return;
    setOpen(false);
    fadeToStop(Number(item.dataset.stop));
  });
  document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !e.target.closest("#menu, #menu-button")) setOpen(false);
  });
}

// A panel whose copy is taller than the screen (small phones) scrolls normally
// instead of being pinned, so none of it is cut off
function markTallPanels() {
  const room = window.innerHeight - document.getElementById("nav").offsetHeight - 16;
  panels.forEach((panel) => {
    if (panel.classList.contains("panel-contact")) return;
    panel.classList.remove("is-tall");
    panel.classList.toggle("is-tall", panel.querySelector(".panel-copy").offsetHeight > room);
  });
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
    if (tick) fadeToStop(Number(tick.dataset.stop));
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
  let lastTime = null;
  // Resizing clears the canvas and can change the framing, so force a redraw
  window.addEventListener("resize", () => (lastRendered = null));

  function frame(time) {
    const target = scrollState();
    // Light inertia so the camera glides rather than snapping to the scrollbar
    if (reducedMotion || snapCamera) {
      key = target.key;
      creep = target.creep;
      snapCamera = false;
    } else {
      // Glide towards the scroll position at the same rate whatever the screen's refresh rate
      const dt = lastTime === null ? 16.7 : Math.min(time - lastTime, 100);
      const blend = 1 - Math.exp(-dt / 190);
      key += (target.key - key) * blend;
      creep += (target.creep - creep) * blend;
      if (Math.abs(target.key - key) < 0.0005) key = target.key;
      if (Math.abs(target.creep - creep) < 0.0005) creep = target.creep;
    }

    // Nothing animates on its own, so skip frames where nothing changed
    const stamp = `${key}|${creep}`;
    if (stamp !== lastRendered || scene.takeDirty()) {
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

    lastTime = time;
    runSettle(target.key);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initNav() {
  const nav = document.getElementById("nav");
  // The nav bar and the altitude readout are hidden on the opening screen, and appear
  // once you scroll
  const update = () => {
    const scrolled = window.scrollY > window.innerHeight * 0.35;
    nav.classList.toggle("is-visible", scrolled);
    document.documentElement.classList.toggle("is-scrolled", scrolled);
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}

document.documentElement.classList.add("js");
// Nothing is built until the preview password has been entered
unlock().then(() => {
  window.scrollTo({ top: 0, behavior: "instant" });
  buildScale();
  buildMenu();
  // Links to a section (Contact, the logo) fade there too
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const panel = document.querySelector(link.getAttribute("href"));
    const stop = panels.indexOf(panel);
    if (stop < 0) return;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      fadeToStop(stop);
    });
  });
  markTallPanels();
  window.addEventListener("resize", markTallPanels);
  window.addEventListener("load", markTallPanels);
  initScrollControl();
  initScene();
  initNav();
  bindEmailCaptureForm(document.getElementById("email-form"), NEWSLETTER_SCRIPT_URL);
  document.getElementById("year").textContent = new Date().getFullYear();
});
