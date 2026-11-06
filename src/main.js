import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";

import { bindEmailCaptureForm } from "./form-email-capture";
import { initAscent } from "./scene";

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
// A ride between two stops is one continuous motion. As soon as the wheel takes the
// page out of a pause, the ride carries on by itself to the stop ahead, starting at the
// speed the page was already moving. It never halts part-way: scrolling on during a ride
// only moves it along, and scrolling the other way turns it round. So nobody is left
// between stops, and nothing ever stops and then pulls.
// However else the page ends up between stops (dragging the scrollbar, a touch that has
// come to rest), the ride sets off after this long without scrolling.
const SETTLE_IDLE_MS = 220;
// The wheel counts as still turning for this long after its last event
const WHEEL_ACTIVE_MS = 300;
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
      // The creep builds through the pause and is held as the ride sets off, so the
      // ride starts from where the pause left the camera. The scene fades it out as the
      // ride covers its distance; this lets go of it over the later part of the ride,
      // so it is back at zero well before the next stop.
      const ease = (t) => t * t * (3 - 2 * t);
      const creep = p < hold ? ease(p / hold) : 1 - ease(Math.min(Math.max((riding - 0.5) / 0.4, 0), 1));
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
let scrollAnim = null; // the one scroll animation in flight: { raf, dir }

// "push" is the starting speed as a multiple of the average speed. 0 starts from rest
// and eases in and out; 3 starts fast and only eases out; anything between is a blend,
// so an animation can pick up at whatever speed the page is already moving.
function animateScrollTo(targetY, duration = 650, push = 3) {
  cancelScrollAnim();
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 1) return;
  if (reducedMotion) {
    window.scrollTo({ top: targetY, behavior: "instant" });
    return;
  }
  const dir = Math.sign(delta);
  const ease = (t) => push * t * (1 - t) * (1 - t) + t * t * (3 - 2 * t);
  let elapsed = 0;
  let last = performance.now();
  let expected = startY;
  const anim = { dir, raf: 0 };
  function step(now) {
    elapsed += Math.max(now - last, 0);
    last = now;
    // Scrolling on during the animation puts the page ahead of it. Skip forward to where
    // the page now is, rather than pulling it back.
    if ((window.scrollY - expected) * dir > 2) {
      const done = Math.min((window.scrollY - startY) / delta, 1);
      let lo = Math.min(elapsed / duration, 1);
      let hi = 1;
      for (let n = 0; n < 20; n++) {
        const mid = (lo + hi) / 2;
        if (ease(mid) < done) lo = mid;
        else hi = mid;
      }
      elapsed = hi * duration;
    }
    const t = Math.min(elapsed / duration, 1);
    expected = startY + delta * ease(t);
    window.scrollTo({ top: expected, behavior: "instant" });
    if (t < 1) anim.raf = requestAnimationFrame(step);
    else scrollAnim = null;
  }
  anim.raf = requestAnimationFrame(step);
  scrollAnim = anim;
}

function cancelScrollAnim() {
  if (scrollAnim) cancelAnimationFrame(scrollAnim.raf);
  scrollAnim = null;
}

const clampStop = (i) => Math.min(Math.max(i, 0), panels.length - 1);
// Step to a neighbouring stop by scrolling there, so the ride plays
const goToStop = (i) => animateScrollTo(stopStart(clampStop(i)));

// Jump to any stop from a button: fade to black, move, fade back in. Scrolling there
// instead would race the camera through every stop on the way.
let snapCamera = false;
let fading = false;
function fadeToStop(i, onArrive) {
  if (fading) return;
  const y = stopStart(clampStop(i));
  if (Math.abs(window.scrollY - y) < 2) {
    onArrive?.();
    return;
  }
  cancelScrollAnim();
  if (reducedMotion) {
    snapCamera = true;
    window.scrollTo({ top: y, behavior: "instant" });
    onArrive?.();
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
      onArrive?.();
    }, 120);
  }, 380);
}

// Going to Contact puts the cursor in the email box, so writing can start at once
const CONTACT_STOP = panels.indexOf(document.getElementById("contact"));
const focusEmail = () => document.getElementById("email")?.focus({ preventScroll: true });
const goToPanel = (stop) => fadeToStop(stop, stop === CONTACT_STOP ? focusEmail : undefined);

let lastUserScroll = performance.now();
let lastWheel = -Infinity;
let lastScrollY = 0;
let lastScrollTime = 0;
let scrollSpeed = 0; // px per ms, signed, from the visitor's own scrolling
let lastDirection = 1;
let touching = false;

function initScrollControl() {
  // A finger or a press takes over from any animation
  const userInput = () => {
    cancelScrollAnim();
    lastUserScroll = performance.now();
  };
  ["touchstart", "touchmove", "pointerdown"].forEach((ev) => window.addEventListener(ev, userInput, { passive: true }));
  // The wheel does not interrupt an animation going its way. Against it, the animation
  // stops and the ride sets off the other way on the next frame.
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || !e.deltaY) return; // pinch zoom, sideways scroll
      const dir = Math.sign(e.deltaY);
      if (scrollAnim && scrollAnim.dir !== dir) cancelScrollAnim();
      lastDirection = dir;
      lastWheel = lastUserScroll = performance.now();
    },
    { passive: true }
  );
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
      const now = performance.now();
      if (!scrollAnim) {
        // The wheel says which way it is turning. Otherwise go by which way the page
        // moved. (A scroll event from an animation's last step can arrive after the
        // wheel has turned it round, and must not turn it back.)
        if (now - lastWheel > WHEEL_ACTIVE_MS && y !== lastScrollY) lastDirection = y > lastScrollY ? 1 : -1;
        scrollSpeed = (y - lastScrollY) / Math.max(now - lastScrollTime, 1);
        lastUserScroll = now;
      }
      lastScrollY = y;
      lastScrollTime = now;
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

// Between stops with nothing driving the page: set off for the stop ahead
function runSettle(key) {
  if (reducedMotion || scrollAnim || touching) return;
  const i = Math.floor(key);
  const along = key - i;
  if (along < 0.004 || i >= panels.length - 1) return; // parked at a stop already
  const now = performance.now();
  const wheeling = now - lastWheel < WHEEL_ACTIVE_MS;
  if (!wheeling && now - lastUserScroll < SETTLE_IDLE_MS) return;
  const targetY = lastDirection > 0 ? stopStart(i + 1) : stopEnd(i);
  const distance = Math.abs(targetY - window.scrollY);
  const duration = 700 + 1100 * (lastDirection > 0 ? 1 - along : along);
  // Pick up at the speed the page is moving, if it is moving our way. Under the wheel
  // start at least at the average speed, so the ride answers the scroll at once.
  const speed = now - lastScrollTime < 100 ? scrollSpeed * lastDirection : 0;
  const push = Math.min(Math.max((speed * duration) / Math.max(distance, 1), wheeling ? 1 : 0), 2);
  animateScrollTo(targetY, duration, push);
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
    goToPanel(Number(item.dataset.stop));
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
buildScale();
buildMenu();
// Links to a section (Contact, the logo) fade there too
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  const panel = document.querySelector(link.getAttribute("href"));
  const stop = panels.indexOf(panel);
  if (stop < 0) return;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    goToPanel(stop);
  });
});
// The invitation to scroll rides to the first stop
document.getElementById("scroll-hint").addEventListener("click", () => goToStop(1));
markTallPanels();
window.addEventListener("resize", markTallPanels);
window.addEventListener("load", markTallPanels);
initScrollControl();
initScene();
initNav();
bindEmailCaptureForm(document.getElementById("email-form"), NEWSLETTER_SCRIPT_URL);
document.getElementById("year").textContent = new Date().getFullYear();
