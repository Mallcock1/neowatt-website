import * as THREE from "three";

// World units are kilometres. Earth's surface sits at the origin with "up" = +y.
const R_EARTH = 6371;
const EARTH_C = new THREE.Vector3(0, -R_EARTH, 0);
const UP = new THREE.Vector3(0, 1, 0);

// Sun direction (from Earth outward). The transmitter sits in sunlight; the
// satellites further along the orbit are in Earth's shadow.
const SUN = new THREE.Vector3(0.35, -0.2, 0.9).normalize();
const W = new THREE.Vector3(-SUN.x, 0, -SUN.z).normalize(); // orbit travel, away from the sun
const U = new THREE.Vector3().crossVectors(W, UP).normalize();

const BEAM = new THREE.Color("#cfc8ff");
const EDGE = new THREE.Color("#cdd2e4");
const HULL = new THREE.Color("#0b1020");

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Point `alt` km up, `thetaDeg` along the orbit from the origin, `lateral` km sideways
function orbitPos(thetaDeg, lateral, alt) {
  const th = (thetaDeg * Math.PI) / 180;
  const r = R_EARTH + alt;
  return UP.clone()
    .multiplyScalar(Math.cos(th))
    .addScaledVector(W, Math.sin(th))
    .addScaledVector(U, lateral / r)
    .normalize()
    .multiplyScalar(r)
    .add(EARTH_C);
}

// Point on the far side, looking back at the whole planet
const FAR_DIR = v3(0.3, 0.75, 0.6).normalize();
const farPos = (alt) => FAR_DIR.clone().multiplyScalar(R_EARTH + alt).add(EARTH_C);

// 0..1: how deep `p` is inside Earth's shadow cylinder (soft 80 km edge)
function shadowFrac(p) {
  const d = p.clone().sub(EARTH_C);
  const along = d.dot(SUN);
  if (along >= 0) return 0;
  const lateral = Math.sqrt(Math.max(d.lengthSq() - along * along, 0));
  return 1 - smoothstep(R_EARTH - 40, R_EARTH + 40, lateral);
}

// Offset a look-at target along the camera's screen axes (right, up), in km
function framed(pos, lookAt, right, up) {
  const fwd = lookAt.clone().sub(pos).normalize();
  const r = new THREE.Vector3().crossVectors(fwd, UP).normalize();
  const u = new THREE.Vector3().crossVectors(r, fwd).normalize();
  return lookAt.clone().addScaledVector(r, right).addScaledVector(u, up);
}

// Unit vectors around a beam from `a` to `b`: along, sideways, and outward from Earth
function beamFrame(a, b) {
  const along = b.clone().sub(a).normalize();
  const radial = a.clone().sub(EARTH_C).normalize();
  const side = new THREE.Vector3().crossVectors(along, radial).normalize();
  return { along, side, radial };
}

// ---------- Places ----------
const NODES = [orbitPos(4, 150, 600), orbitPos(-3, -120, 500), orbitPos(-9, 200, 560), orbitPos(-15, -60, 530), orbitPos(-21, 90, 500)];
// Links between the background grid nodes. Node 0 (the transmitter) only fires the beam we follow.
const NODE_LINKS = [[1, 2], [1, 3], [2, 3], [3, 4]];
const TX = NODES[0]; // the transmitter we start behind
const SAT = orbitPos(16, 0, 500); // receiver, in Earth's shadow
const VLEO = orbitPos(24, 40, 250); // relay target, skimming the atmosphere
const F1 = beamFrame(TX, SAT);
const F2 = beamFrame(SAT, VLEO);
// Axes of the relay satellite: arrays along X, and Z in the plane of its two beams
const SAT_X = new THREE.Vector3().crossVectors(F1.along, F2.along).normalize();
const SAT_Z = new THREE.Vector3().crossVectors(SAT_X, F1.along.clone().negate()).normalize();
const SAT_VIEW = -1; // which side of the beam plane the arrival camera sits on
// The same in-plane axis for the relay beam
const SAT2_Z = new THREE.Vector3().crossVectors(SAT_X, F2.along.clone().negate()).normalize();
// The beam each ride follows. The camera stays on one side of it for the whole ride.
const BEAM1 = { origin: TX, dir: F1.along };
const BEAM2 = { origin: SAT, dir: F2.along };

// Orient a spacecraft: local +y (receiver / aperture) along `axis`, solar arrays
// (local x) along `arrays`. Keeping the arrays perpendicular to the plane of the
// beams means no beam ever passes across a panel.
function orient(group, axis, arrays) {
  const y = axis.clone().normalize();
  const x = arrays.clone().addScaledVector(y, -arrays.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// On a portrait screen (phones) the copy sits above or below the satellite, never beside
// it. So the camera frames the satellite in the upper or lower part of the screen, and
// uses a wider lens so the whole spacecraft fits the narrow width.
let PORTRAIT = false;
const PORTRAIT_FOV = 70;
// Look-at point for a stop: beside the copy on wide screens, above/below it on phones.
// `place` is where the satellite sits on a phone: "upper" or "lower".
function aim(pos, subject, right, up, place) {
  if (!PORTRAIT) return framed(pos, subject, right, up);
  const reach = pos.distanceTo(subject);
  return framed(pos, subject, 0, place === "upper" ? -0.28 * reach : 0.44 * reach);
}

// ---------- Camera keyframes, one per text panel ----------
// A `linear` key is reached by straight-line flight (riding the beam); otherwise
// the camera arcs with altitude interpolated logarithmically (the pull-out).
const KEYS = [
  {
    // Hero: just behind the transmitter, looking down the beam
    pos: () => TX.clone().addScaledVector(F1.along, -0.032).addScaledVector(F1.side, -0.014).addScaledVector(F1.radial, 0.007),
    target: () => (PORTRAIT ? aim(KEYS[0].pos(), TX, 0, 0, "upper") : TX.clone().addScaledVector(F1.along, 40)),
    fov: 62,
    portrait: 86
  },
  {
    // The satellite that makes its own power: from behind and to one side, arrays in view
    linear: true,
    axis: BEAM1,
    pos: () => TX.clone().addScaledVector(F1.along, -0.044).addScaledVector(SAT_X, 0.026).addScaledVector(SAT_Z, -0.011),
    target: () => aim(KEYS[1].pos(), TX, 0.018, 0.001, "lower"),
    fov: 44,
    portrait: true
  },
  {
    // Arrival at the eclipsed satellite
    linear: true,
    axis: BEAM1,
    // Offset within the plane of the beams, so neither beam crosses the arrays on screen
    pos: () => SAT.clone().addScaledVector(F1.along, -0.05).addScaledVector(SAT_Z, 0.015 * SAT_VIEW).addScaledVector(SAT_X, 0.003),
    target: () => aim(KEYS[2].pos(), SAT, 0.02, 0.003, "upper"),
    fov: 44,
    portrait: true
  },
  {
    // Arrival at the VLEO satellite, on the same side of the relay beam as we left
    linear: true,
    axis: BEAM2,
    // Low over the beam's underside, so the view is near level and Earth's limb is in frame
    pos: () => VLEO.clone().addScaledVector(F2.along, -0.05).addScaledVector(SAT2_Z, -0.007).addScaledVector(SAT_X, 0.004),
    target: () => aim(KEYS[3].pos(), VLEO, -0.013, -0.004, "upper"),
    fov: 44,
    portrait: true
  },
  { pos: () => farPos(20000), target: () => framed(farPos(20000), EARTH_C, -7600, 0), fov: 40 }, // the grid
  { pos: () => farPos(27000), target: () => framed(farPos(27000), EARTH_C, PORTRAIT ? -6500 : -11500, 2500), fov: 40 }, // team
  { pos: () => farPos(34000), target: () => framed(farPos(34000), EARTH_C, 0, 11500), fov: 40 } // contact
];

// What the camera is looking at when parked at each stop. The slow creep during a
// pause dollies towards this, so it scales with the subject's distance (metres for a
// satellite), not with the look-at point, which may be kilometres down the beam.
const SUBJECTS = [TX, TX, SAT, VLEO, EARTH_C, EARTH_C, EARTH_C];

// Easing for a ride of length L km. Rides are ~1,000 km and the things at each end are
// metres across, so easing in plain distance leaves them behind at once. This eases
// geometrically instead: distance from the start grows by a constant factor per unit
// of scroll (and distance to the end shrinks the same way), so the satellite you leave
// recedes gradually and the one you approach grows gradually. Symmetric about the middle.
function rideEase(x, L) {
  const k = Math.log(Math.max(L / 0.03, 1));
  if (k < 2) return smoother(x);
  // The extra factor ramps the speed up from zero over the first tenth of the ride (and
  // down to zero over the last tenth), so the camera never lurches away from a stop
  const half = (u) => ((0.5 * (Math.exp(2 * k * u) - 1)) / (Math.exp(k) - 1)) * smoothstep(0, 0.1, u);
  return x <= 0.5 ? half(x) : 1 - half(1 - x);
}

// Blend two unit directions by angle (so the turn is even, whatever the distances involved)
function slerpDir(out, a, b, t) {
  const dot = Math.min(Math.max(a.dot(b), -1), 1);
  const angle = Math.acos(dot);
  if (angle < 1e-4) return out.copy(a).lerp(b, t).normalize();
  const s = Math.sin(angle);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * angle) / s)
    .addScaledVector(b, Math.sin(t * angle) / s)
    .normalize();
}

// Easing for the pull-back from a close-up to a far view, L km away
function pullBack(x, L) {
  const k = Math.log(Math.max(L / 0.03, 1));
  if (k < 2) return smoother(x);
  const y = 1 - Math.pow(1 - x, 2.5); // ease out: slows over the last fifth of the ride
  return ((Math.exp(k * y) - 1) / (Math.exp(k) - 1)) * smoothstep(0, 0.1, x);
}

// Interpolate a world point: direction from Earth's centre linearly, altitude
// logarithmically, so the pull-out accelerates away from the planet.
function lerpPoint(out, a, b, t) {
  const da = a.clone().sub(EARTH_C);
  const db = b.clone().sub(EARTH_C);
  const ra = Math.max(da.length() - R_EARTH, 0.0015);
  const rb = Math.max(db.length() - R_EARTH, 0.0015);
  const r = R_EARTH + Math.exp(lerp(Math.log(ra), Math.log(rb), t));
  return out.copy(da.normalize().lerp(db.normalize(), t)).normalize().multiplyScalar(r).add(EARTH_C);
}

// GLSL: does Earth block the ray from the camera along d within distance L?
const earthOcclusion = /* glsl */ `
uniform vec3 uUp;
uniform float uDist;
uniform float uAlt;
bool earthBlocks(vec3 d, float L) {
  float b = uDist * dot(uUp, d);
  float c = uAlt * (2.0 * 6371.0 + uAlt);
  float disc = b * b - c;
  if (disc <= 0.0 || b >= 0.0) return false;
  return c / (-b + sqrt(disc)) < L;
}
`;

// ---------- Planet shader: Earth ray-traced per pixel ----------
// An exact sphere at every scale (no tessellation), drawn as a hologram briefing map:
// the surface is cut into 1-degree tiles, land tiles are lit, coastline tiles brighter.
// The land comes from a 360 x 180 mask (Natural Earth, public domain), one texel per tile.
const planetFrag = /* glsl */ `
precision highp float;
uniform mat4 uInvProj;
uniform mat3 uCamRot;
uniform vec3 uUp;
uniform float uDist;
uniform float uAlt;
uniform vec3 uSun;
uniform mat3 uGeo;
uniform sampler2D uLand;
uniform float uLandReady;
varying vec2 vNdc;

const float R = 6371.0;
const vec2 TILES = vec2(360.0, 180.0);

float land(vec2 tile) {
  tile.x = mod(tile.x, TILES.x);
  tile.y = clamp(tile.y, 0.0, TILES.y - 1.0);
  return step(0.5, texture2D(uLand, (tile + 0.5) / TILES).r);
}

void main() {
  // Unproject onto the near plane: the far plane is numerically unstable with this depth range
  vec4 v = uInvProj * vec4(vNdc, -1.0, 1.0);
  vec3 d = normalize(uCamRot * (v.xyz / v.w));

  // Numerically stable near the surface: c and t use altitude directly
  float mu = dot(uUp, d);
  float b = uDist * mu;
  float c = uAlt * (2.0 * R + uAlt);
  float disc = b * b - c;
  float tE = (disc > 0.0 && b < 0.0) ? c / (-b + sqrt(disc)) : -1.0;

  vec3 n = normalize(uUp * uDist + d * max(tE, 0.0));
  float day = smoothstep(-0.04, 0.18, dot(n, uSun));


  vec3 col = vec3(0.012, 0.018, 0.045) * exp(-uAlt / 25.0);


  if (tE > 0.0) {
    // Geographic position of this pixel, in tiles
    vec3 g = uGeo * n;
    vec2 p = vec2(atan(g.y, g.x) / 6.2831853 + 0.5, asin(clamp(g.z, -1.0, 1.0)) / 3.1415927 + 0.5) * TILES;
    vec2 tile = floor(p);
    vec2 f = fract(p);
    vec2 fw = min(fwidth(p), vec2(1.0));
    float size = max(fw.x, fw.y); // tiles per screen pixel

    // Each tile is a square with a gap around it. Where tiles shrink towards a pixel
    // (far away, or near the limb) the gaps and the land detail fade to an even tone,
    // so nothing shimmers as the camera moves.
    vec2 e = smoothstep(vec2(0.1) - fw, vec2(0.1) + fw, f) * (1.0 - smoothstep(vec2(0.9) - fw, vec2(0.9) + fw, f));
    float far = smoothstep(0.12, 0.4, size);
    float square = mix(e.x * e.y, 0.75, far);

    // Up close a tile fills much of the screen, so it breaks into a 6 x 6 block of pixels
    vec2 sf = fract(p * 6.0);
    vec2 sfw = min(fw * 6.0, vec2(1.0));
    vec2 se = smoothstep(vec2(0.14) - sfw, vec2(0.14) + sfw, sf) * (1.0 - smoothstep(vec2(0.86) - sfw, vec2(0.86) + sfw, sf));
    float near = 1.0 - smoothstep(0.004, 0.02, size);
    square *= mix(1.0, se.x * se.y, near);

    float isLand = land(tile);
    float inland = min(min(land(tile + vec2(1.0, 0.0)), land(tile - vec2(1.0, 0.0))), min(land(tile + vec2(0.0, 1.0)), land(tile - vec2(0.0, 1.0))));
    float coast = isLand * (1.0 - inland);
    float lit = mix(isLand, 0.3, smoothstep(0.5, 1.2, size));

    vec3 landCol = mix(vec3(0.15, 0.14, 0.33), vec3(0.46, 0.43, 0.86), coast * (1.0 - far));
    vec3 surf = vec3(0.014, 0.018, 0.042) + vec3(0.03, 0.035, 0.06) * day;
    surf += vec3(0.022, 0.026, 0.055) * square * (1.0 - lit);
    // Dimmer at low altitude, where the land sits behind the copy
    float level = mix(0.4, 1.0, smoothstep(300.0, 6000.0, uAlt));
    surf += landCol * lit * square * level * uLandReady;
    float rim = pow(1.0 - clamp(dot(n, -d), 0.0, 1.0), 5.0);
    col = mix(surf, vec3(0.16, 0.18, 0.4), clamp(rim * 0.45, 0.0, 1.0));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

const starVert = /* glsl */ `
attribute float aSize;
attribute float aBright;
uniform float uPixelRatio;
uniform float uFade;
varying float vB;
${earthOcclusion}
void main() {
  bool hidden = earthBlocks(normalize(position), 1e9);
  vB = hidden ? 0.0 : aBright * uFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = hidden ? 0.0 : aSize * uPixelRatio;
}
`;

const starFrag = /* glsl */ `
varying float vB;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vec3(0.85, 0.87, 1.0) * vB, 1.0) * (1.0 - smoothstep(0.2, 0.5, d));
}
`;

// Global constellation: beams and nodes hidden per-fragment where Earth is in front
const meshVert = /* glsl */ `
uniform float uPointSize;
varying vec3 vRel;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vRel = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_PointSize = uPointSize;
}
`;

const meshFrag = (isPoint) => /* glsl */ `
uniform float uOpacity;
varying vec3 vRel;
${earthOcclusion}
void main() {
  float L = length(vRel);
  if (earthBlocks(vRel / L, L)) discard;
  float a = uOpacity;
  ${isPoint ? "a *= 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));" : ""}
  gl_FragColor = vec4(vec3(0.81, 0.78, 1.0) * a, 1.0);
}
`;

// ---------- Beam: a camera-facing glowing ribbon ----------
// The first and last rows of vertices are transparent, so the beam has soft ends
// instead of a square-cut edge (which, seen obliquely, falls diagonally across a
// receiver plate).
const ribbonVert = /* glsl */ `
attribute float aU;
attribute float aFade;
varying float vU;
varying float vFade;
void main() {
  vU = aU;
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ribbonFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoft;
varying float vU;
varying float vFade;
void main() {
  float x = abs(vU);
  float edge = 1.0 - smoothstep(uSoft, 1.0, x);
  float core = 1.0 - smoothstep(0.0, 0.3, x);
  vec3 col = mix(uColor, vec3(1.0), core * 0.6);
  float a = edge * uOpacity * smoothstep(0.0, 1.0, vFade);
  gl_FragColor = vec4(col * a, 1.0);
}
`;

// Rows of vertices along a ribbon. Enough for the two end caps plus rows spaced
// geometrically outward from the point nearest the camera.
const RIBBON_ROWS = 24;
const RIBBON_STEPS = [0.02, 0.1, 0.5, 2.5, 12, 60, 300];

function ribbon(width, opacity, soft) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RIBBON_ROWS * 6), 3));
  geo.setAttribute("aU", new THREE.BufferAttribute(Float32Array.from({ length: RIBBON_ROWS * 2 }, (_, i) => (i % 2 ? 1 : -1)), 1));
  geo.setAttribute("aFade", new THREE.BufferAttribute(new Float32Array(RIBBON_ROWS * 2), 1));
  const index = [];
  for (let r = 0; r < RIBBON_ROWS - 1; r++) {
    const v = r * 2;
    index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  }
  geo.setIndex(index);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: BEAM.clone() }, uOpacity: { value: opacity }, uSoft: { value: soft } },
    vertexShader: ribbonVert,
    fragmentShader: ribbonFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, width, geo, mat };
}

// `tip`: a glow at the far end. Off for beams that land on a receiver, which has its own glow.
function beam(scene, from, to, radius, { tip: withTip = true } = {}) {
  const core = ribbon(radius, 0.62, 0.3);
  const halo = ribbon(radius * 2.2, 0.09, 0.05);
  scene.add(core.mesh, halo.mesh);
  const tip = glowSprite(radius * 4);
  if (withTip) scene.add(tip);

  const a = from.clone();
  const b = to.clone();
  const along = new THREE.Vector3();
  const row = new THREE.Vector3();
  const side = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let len = 1;

  function retarget(p, q) {
    a.copy(p);
    b.copy(q);
    along.subVectors(b, a);
    len = along.length();
    along.normalize();
    tip.position.copy(b);
  }
  retarget(from, to);

  // Two precision problems are avoided here, both of which make a metre-wide beam jitter
  // as the camera moves:
  // 1. World coordinates are ~2,000 km, where 32-bit floats only resolve ~20 cm. So
  //    vertices are stored relative to the camera, and the mesh is placed at the camera.
  // 2. A single quad 1,000 km long passing beside the camera is clipped and interpolated
  //    with centimetre errors. So the ribbon is cut into rows spaced geometrically
  //    outward from the point nearest the camera: short pieces nearby, long ones far away.
  const rows = [];
  function write(r, drawn, cam) {
    const pos = r.geo.attributes.position.array;
    const fade = r.geo.attributes.aFade.array;
    const cap = Math.min(radius * 3, drawn / 3);
    const inner0 = cap * 0.5;
    const inner1 = drawn - cap;
    const nearest = Math.min(Math.max(tmp.subVectors(cam, a).dot(along), inner0), inner1);

    rows.length = 0;
    rows.push(nearest);
    for (const step of RIBBON_STEPS) {
      if (nearest - step > inner0) rows.push(nearest - step);
      if (nearest + step < inner1) rows.push(nearest + step);
    }
    rows.push(inner0, inner1);
    rows.sort((p, q) => p - q);
    rows.unshift(0);
    rows.push(drawn);

    for (let i = 0; i < RIBBON_ROWS; i++) {
      const k = Math.min(i, rows.length - 1); // unused rows collapse onto the last one
      row.copy(a).addScaledVector(along, rows[k]).sub(cam);
      // Face the camera at each row: the camera may be anywhere along the beam
      side.crossVectors(along, row).normalize();
      tmp.copy(row).addScaledVector(side, -r.width);
      pos.set([tmp.x, tmp.y, tmp.z], i * 6);
      tmp.copy(row).addScaledVector(side, r.width);
      pos.set([tmp.x, tmp.y, tmp.z], i * 6 + 3);
      fade[i * 2] = fade[i * 2 + 1] = k === 0 || k === rows.length - 1 ? 0 : 1;
    }
    r.geo.attributes.position.needsUpdate = true;
    r.geo.attributes.aFade.needsUpdate = true;
    r.mesh.position.copy(cam);
  }

  function setOpacity(o) {
    core.mat.uniforms.uOpacity.value = 0.62 * o;
    halo.mat.uniforms.uOpacity.value = 0.09 * o;
  }

  function setOverlay(on) {
    for (const r of [core, halo]) {
      r.mat.depthTest = !on;
      r.mesh.renderOrder = on ? 2 : 0;
    }
  }

  return {
    retarget,
    setOpacity,
    setOverlay,
    update(progress, time, cam) {
      const visible = progress > 0;
      core.mesh.visible = halo.mesh.visible = visible;
      tip.visible = withTip && progress > 0.98;
      if (!visible) return;
      const drawn = len * progress;
      write(core, drawn, cam);
      write(halo, drawn, cam);
      tip.material.opacity = 0.7;
    }
  };
}

// ---------- Models: dark hulls with hairline edges ----------
function solid(geo, { hull = HULL, edge = EDGE, edgeOpacity = 0.8 } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hull })));
  g.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: edgeOpacity })
    )
  );
  return g;
}

function box(w, h, d, x = 0, y = 0, z = 0, opts) {
  const m = solid(new THREE.BoxGeometry(w, h, d), opts);
  m.position.set(x, y, z);
  return m;
}

let glowTexture;
function glowSprite(size, attenuate = true) {
  if (!glowTexture) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.15, "rgba(207,200,255,0.8)");
    g.addColorStop(0.45, "rgba(132,121,208,0.18)");
    g.addColorStop(1, "rgba(132,121,208,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    glowTexture = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: BEAM,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      sizeAttenuation: attenuate
    })
  );
  s.scale.set(size, size, 1);
  return s;
}

const PANEL_DARK = new THREE.Color("#0f1636");
const PANEL_LIT = new THREE.Color("#2a3466");

// Satellite with panels that can be lit by the sun and a receiver (local +y) that
// glows when powered.
function satellite(scale) {
  const g = new THREE.Group();
  g.add(box(1, 1, 1.3));
  const panels = [box(2.8, 0.04, 1, -2.05, 0, 0, { hull: PANEL_DARK, edgeOpacity: 0.55 }), box(2.8, 0.04, 1, 2.05, 0, 0, { hull: PANEL_DARK, edgeOpacity: 0.55 })];
  panels.forEach((p) => g.add(p));
  g.add(box(0.6, 0.06, 0.12, -0.8, 0, 0));
  g.add(box(0.6, 0.06, 0.12, 0.8, 0, 0));
  g.add(box(0.5, 0.25, 0.5, 0, 0.62, 0, { hull: new THREE.Color("#241e4a"), edge: BEAM }));
  const glow = glowSprite(1.6);
  glow.material.depthTest = false;
  glow.renderOrder = 3;
  glow.position.set(0, 0.78, 0);
  g.add(glow);
  g.scale.setScalar(scale);

  const panelMeshes = panels.map((p) => p.children[0]);
  const panelEdges = panels.map((p) => p.children[1]);
  return {
    group: g,
    setLit(sunlit, powered) {
      const lit = Math.max(sunlit, powered);
      panelMeshes.forEach((m) => m.material.color.copy(PANEL_DARK).lerp(PANEL_LIT, lit));
      panelEdges.forEach((e) => (e.material.opacity = lerp(0.3, 0.75, lit)));
      glow.material.opacity = powered;
      glow.visible = powered > 0.01;
    }
  };
}

// Satellites spread around the planet, each linked to its nearest neighbours
function globalMesh(uniforms) {
  const n = 72;
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const alt = 550 + ((i * 37) % 11) * 70;
    nodes.push(v3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(R_EARTH + alt).add(EARTH_C));
  }
  const pairs = new Set();
  const links = [];
  nodes.forEach((p, i) => {
    nodes
      .map((q, j) => [p.distanceToSquared(q), j])
      .filter(([, j]) => j !== i)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 3)
      .forEach(([, j]) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          links.push(p, nodes[j]);
        }
      });
  });

  const common = { transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false };
  const lineUniforms = { ...uniforms, uOpacity: { value: 0 }, uPointSize: { value: 0 } };
  const pointUniforms = { ...uniforms, uOpacity: { value: 0 }, uPointSize: { value: 5 } };
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(links),
    new THREE.ShaderMaterial({ ...common, uniforms: lineUniforms, vertexShader: meshVert, fragmentShader: meshFrag(false) })
  );
  const points = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(nodes),
    new THREE.ShaderMaterial({ ...common, uniforms: pointUniforms, vertexShader: meshVert, fragmentShader: meshFrag(true) })
  );
  lines.frustumCulled = points.frustumCulled = false;

  const group = new THREE.Group();
  group.add(lines, points);
  return {
    group,
    set(opacity, pixelRatio) {
      lineUniforms.uOpacity.value = opacity * 0.55;
      pointUniforms.uOpacity.value = opacity;
      pointUniforms.uPointSize.value = 6 * pixelRatio;
      group.visible = opacity > 0.001;
    }
  };
}

// ---------- Scene ----------
export function initAscent(canvas, { reducedMotion = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  // Supersampling: draw at more pixels than the screen has and let the browser scale
  // the picture down, which smooths thin outlines such as the satellites' edges
  const pixelRatio = Math.min(Math.max((window.devicePixelRatio || 1) * 1.5, 2), 2.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.0003, 2e6);

  const shared = {
    uUp: { value: v3(0, 1, 0) },
    uDist: { value: R_EARTH },
    uAlt: { value: 0 },
    uSun: { value: SUN.clone() }
  };

  // Where the globe sits under the journey: the start point is over the UK, and the
  // final pulled-back view is centred on the Atlantic coast of Africa, with Europe above.
  const geo = new THREE.Matrix3();
  {
    const lat0 = (54 * Math.PI) / 180;
    const lon0 = (-3 * Math.PI) / 180;
    const away = v3(FAR_DIR.x, 0, FAR_DIR.z).normalize().negate();
    const north = UP.clone().multiplyScalar(Math.sin(lat0)).addScaledVector(away, Math.cos(lat0)).normalize();
    const meridian = UP.clone().addScaledVector(north, -UP.dot(north)).normalize();
    const east = new THREE.Vector3().crossVectors(north, meridian);
    const x0 = meridian.clone().multiplyScalar(Math.cos(lon0)).addScaledVector(east, -Math.sin(lon0));
    const y0 = meridian.clone().multiplyScalar(Math.sin(lon0)).addScaledVector(east, Math.cos(lon0));
    geo.set(x0.x, x0.y, x0.z, y0.x, y0.y, y0.z, north.x, north.y, north.z);
  }
  let dirty = false;
  const landReady = { value: 0 };
  const landMask = new THREE.TextureLoader().load("/assets/images/land-mask.png", () => {
    landReady.value = 1;
    dirty = true;
  });
  landMask.magFilter = landMask.minFilter = THREE.NearestFilter;
  landMask.generateMipmaps = false;
  landMask.wrapS = THREE.RepeatWrapping;

  const planet = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uInvProj: { value: new THREE.Matrix4() },
        uCamRot: { value: new THREE.Matrix3() },
        uGeo: { value: geo },
        uLand: { value: landMask },
        uLandReady: landReady
      },
      vertexShader: "varying vec2 vNdc; void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: planetFrag,
      depthTest: false,
      depthWrite: false
    })
  );
  planet.frustumCulled = false;
  planet.renderOrder = -2;
  scene.add(planet);

  // Stars ride with the camera on a large shell
  const STAR_COUNT = 2600;
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const brights = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u) * 5e5;
    positions.set([Math.cos(a) * r, u * 5e5, Math.sin(a) * r], i * 3);
    sizes[i] = Math.random() < 0.08 ? 2.4 : 1.3;
    brights[i] = Math.pow(Math.random(), 2.4) * 0.7 + 0.06;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  starGeo.setAttribute("aBright", new THREE.BufferAttribute(brights, 1));
  const starUniforms = { ...shared, uPixelRatio: { value: pixelRatio }, uFade: { value: 1 } };
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      uniforms: starUniforms,
      vertexShader: starVert,
      fragmentShader: starFrag,
      // Not flagged transparent, so the stars draw in the first pass, straight after the
      // planet and before the spacecraft, which then cover them
      transparent: false,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    })
  );
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);

  // Spacecraft. Receivers (local +y) face back along their incoming beam.
  const tx = satellite(0.003);
  tx.group.position.copy(TX);
  orient(tx.group, F1.along, F1.side); // aperture faces down the beam
  tx.setLit(1, 0);
  scene.add(tx.group);
  const aperture = glowSprite(0.004);
  aperture.position.copy(TX).addScaledVector(F1.along, 0.0025);
  scene.add(aperture);

  const sat = satellite(0.003);
  sat.group.position.copy(SAT);
  // Receiver faces the incoming beam; arrays perpendicular to both the incoming and relay beams
  orient(sat.group, F1.along.clone().negate(), new THREE.Vector3().crossVectors(F1.along, F2.along));
  scene.add(sat.group);

  const vleo = satellite(0.003);
  vleo.group.position.copy(VLEO);
  orient(vleo.group, F2.along.clone().negate(), SAT_X);
  scene.add(vleo.group);

  // Markers for the nearby grid nodes. Fixed pixel size, so they are hidden once we
  // pull out to the whole planet, where the global web takes over.
  const nodeMarkers = NODES.slice(1).map((p) => {
    const s = glowSprite(0.012, false);
    s.position.copy(p);
    scene.add(s);
    return s;
  });

  const world = globalMesh(shared);
  scene.add(world.group);

  const nodeBeams = NODE_LINKS.map(([a, b]) => beam(scene, NODES[a], NODES[b], 0.01));
  const beam1 = beam(scene, TX.clone().addScaledVector(F1.along, 0.00225), SAT.clone().addScaledVector(F1.along, -0.00225), 0.0007, { tip: false });
  const BEAM1_LEN = TX.distanceTo(SAT);
  const BEAM2_LEN = SAT.distanceTo(VLEO);
  const beam2 = beam(scene, SAT.clone().addScaledVector(F2.along, 0.0025), VLEO.clone().addScaledVector(F2.along, -0.00225), 0.0007, { tip: false });


  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const dirA = new THREE.Vector3();
  const dirB = new THREE.Vector3();
  const look = new THREE.Vector3();
  const latA = new THREE.Vector3();
  const latB = new THREE.Vector3();
  const lat = new THREE.Vector3();
  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    PORTRAIT = width / height < 0.8;
  }
  resize();
  window.addEventListener("resize", resize);

  function render(k, time, creep = 0) {
    const last = KEYS.length - 1;
    const kc = Math.min(Math.max(k, 0), last);
    const i = Math.min(Math.floor(kc), last - 1);
    let t = smoother(kc - i);
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const anim = reducedMotion ? 0 : time;

    if (b.linear) {
      const from = a.pos();
      const to = b.pos();
      const x = kc - i;
      // Position in the beam's own terms: distance along it, and an offset to one side.
      // Distance eases geometrically. The offset swings slowly around the beam and
      // never passes through it, so the beam keeps its place on screen.
      const { origin, dir } = b.axis;
      const s0 = latA.subVectors(from, origin).dot(dir);
      latA.addScaledVector(dir, -s0);
      const s1 = latB.subVectors(to, origin).dot(dir);
      latB.addScaledVector(dir, -s1);
      const L = Math.abs(s1 - s0);
      const w = smoother(x);
      const rho = lerp(latA.length(), latB.length(), w);
      slerpDir(lat, latA.normalize(), latB.normalize(), w);
      camera.position.copy(origin).addScaledVector(dir, lerp(s0, s1, rideEase(x, L))).addScaledVector(lat, rho);
      // Aim has its own timing: on a long ride, turn from the satellite to looking down
      // the beam over the first part of the ride, then hold that direction and arrive
      // already facing the right way. (Tying the aim to the position easing made the
      // camera swing round in the middle of the ride.)
      dirA.copy(a.target()).sub(from).normalize();
      dirB.copy(b.target()).sub(to).normalize();
      const turn = L > 1 ? smoother(clamp01(x / 0.35)) : smoother(x);
      slerpDir(look, dirA, dirB, turn);
      target.copy(camera.position).add(look);
    } else {
      const from = a.pos();
      const to = b.pos();
      // Pulling back from a satellite to the whole planet: leave it as gradually as the
      // beam rides do (distance grows geometrically from a few metres), then ease out
      // into the far view
      if (a.linear) t = pullBack(kc - i, from.distanceTo(to));
      lerpPoint(camera.position, from, to, t);
      lerpPoint(target, a.target(), b.target(), t);
    }
    const fovOf = (key) => (PORTRAIT && key.portrait ? (key.portrait === true ? PORTRAIT_FOV : key.portrait) : key.fov);
    camera.fov = lerp(fovOf(a), fovOf(b), t);
    camera.updateProjectionMatrix();
    camera.position.lerp(SUBJECTS[Math.round(kc)], creep * 0.1);
    // Keep the aim direction fixed through the creep dolly
    if (b.linear) target.copy(camera.position).add(look);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    // Camera-relative planet uniforms, computed in double precision here
    tmp.subVectors(camera.position, EARTH_C);
    const dist = tmp.length();
    const alt = dist - R_EARTH;
    shared.uUp.value.copy(tmp).divideScalar(dist);
    shared.uDist.value = dist;
    shared.uAlt.value = alt;
    planet.material.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    planet.material.uniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    starUniforms.uFade.value = 0.45 + 0.55 * smoothstep(0, 40, alt);
    stars.position.copy(camera.position);

    // Power states: receivers light up on arrival
    const powered1 = smoothstep(1.94, 2.0, kc);
    const powered2 = smoothstep(2.94, 3.0, kc);
    sat.setLit(0, powered1);
    vleo.setLit(0, powered2);
    const nearGrid = 1 - smoothstep(3.3, 3.6, kc);
    for (const m of nodeMarkers) {
      m.material.opacity = nearGrid;
      m.visible = nearGrid > 0.01;
    }
    for (const nb of nodeBeams) nb.update(nearGrid > 0.01 ? 1 : 0, anim, camera.position);
    beam1.setOverlay(kc > 1.5 && kc < 2.5);
    // Beam 1 is on for the hero, fades out on the way to the "power problem" stop (that
    // satellite makes its own power), then emerges as the ride begins and the copy fades.
    const emerge = (u, len) => (u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(0.0015 / len, 1 - u));
    beam1.setOpacity(kc < 1 ? 1 - smoothstep(0.15, 0.7, kc) : 1);
    const fire = clamp01((kc - 1.03) / 0.07);
    beam1.update(kc < 1 ? 1 : emerge(fire, BEAM1_LEN), anim, camera.position);
    aperture.material.opacity = kc < 1 ? 1 - smoothstep(0.15, 0.7, kc) : smoothstep(0, 0.3, fire);
    // On phones the copy sits below this satellite, where the relay beam goes, so the
    // beam fires as the ride starts (and the copy fades) instead of during the pause.
    const relay = PORTRAIT ? clamp01((kc - 2.03) / 0.07) : kc < 1.97 ? 0 : kc > 2 ? 1 : creep;
    const relayFrac = emerge(relay, BEAM2_LEN);
    beam2.setOverlay(kc > 2.5);
    beam2.update(relayFrac, anim, camera.position);
    world.set(smoothstep(3.4, 3.95, kc), pixelRatio);

    renderer.render(scene, camera);

    // Page dims on the final approach to the dark satellite, and lifts as it powers
    const dim = 0.45 * smoothstep(1.85, 1.97, kc) * (1 - powered1);

    return { altitude: alt, dim };
  }

  // True once after something changed without a scroll (the land mask finishing loading)
  const takeDirty = () => {
    const was = dirty;
    dirty = false;
    return was;
  };

  return { render, takeDirty };
}
