// Lock screen for the preview page.
//
// This runs in the browser, so it keeps casual visitors out but is not real security:
// the page's text and images are still in the published files for anyone who looks.
// Only a hash of the password is stored here, never the password itself.

const SALT = "neowatt-v2-preview";
const ROUNDS = 20000;
const EXPECTED = "9e71a41f27f83f4b56b1c940acf558b1ed736b1d52b8975dd9cff6f74f1ac863";
const REMEMBER_KEY = "neowatt-v2-unlocked";

// Plain-JS SHA-256 (the built-in crypto.subtle is unavailable on http:// addresses,
// such as the dev server on a local network)
const K = new Uint32Array(64);
{
  let n = 0;
  for (let c = 2; n < 64; c++) {
    let prime = true;
    for (let d = 2; d * d <= c; d++) if (c % d === 0) prime = false;
    if (prime) K[n++] = (Math.cbrt(c) % 1) * 2 ** 32;
  }
}

function sha256(bytes) {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);

  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((v, i) => outView.setUint32(i * 4, v));
  return out;
}

export function hashPassword(password) {
  let digest = sha256(new TextEncoder().encode(`${SALT}:${password}`));
  for (let i = 1; i < ROUNDS; i++) digest = sha256(digest);
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function remembered() {
  try {
    return sessionStorage.getItem(REMEMBER_KEY) === EXPECTED;
  } catch {
    return false;
  }
}

function remember() {
  try {
    sessionStorage.setItem(REMEMBER_KEY, EXPECTED);
  } catch {
    // Private windows may block storage; the visitor just re-enters the password
  }
}

// Resolves once the right password has been entered (or was entered earlier in this tab)
export function unlock() {
  const gate = document.getElementById("gate");
  const open = () => {
    document.documentElement.classList.remove("locked");
    gate.remove();
  };
  if (remembered()) {
    open();
    return Promise.resolve();
  }

  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-password");
  const status = document.getElementById("gate-status");
  input.focus();

  return new Promise((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (hashPassword(input.value) === EXPECTED) {
        remember();
        open();
        resolve();
      } else {
        status.textContent = "That password isn’t right.";
        input.select();
      }
    });
  });
}
