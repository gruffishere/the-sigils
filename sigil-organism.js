// THE SIGILS — Orbital Sigil Renderer v3
// 8 separate orbital forms · 1080×1080 sigil area · Continuous 3D rotation · No heartbeat

// ── Constants ─────────────────────────────────────────────
const SIGIL_SIZE = 1080;
const SIGIL_R    = SIGIL_SIZE / 2; // 540 px — maximum sigil radius (scales with TDH)

// Harmonic loop — every animation is a musical ratio of the 30s master period
// Ratios: 1 (rotY), 2 (chroma), 3 (dotOrbit), 4 (breath), 2.5 (pearl), 8 (sparkle)
const LOOP_MASTER   = 30.0;
const LOOP_ROT_Y    = (2 * Math.PI) / LOOP_MASTER;          // full turn in 30s
const LOOP_CHROMA   = (2 * Math.PI) / (LOOP_MASTER / 2);    // 15s hue shimmer
const LOOP_DOT      = (2 * Math.PI) / (LOOP_MASTER / 3);    // 10s ring dot
const LOOP_BREATH   = (2 * Math.PI) / (LOOP_MASTER / 4);    // 7.5s core/node breath
const LOOP_PEARL    = (2 * Math.PI) / (LOOP_MASTER / 2.5);  // 12s Nakamoto pearl
const LOOP_SPARKLE  = (2 * Math.PI) / (LOOP_MASTER / 8);    // 3.75s sparkle
const CHROMA_AMP    = 14;  // ±14° hue shimmer

// Orbital layers — scalar parameters (6) + Meme Artist (rainbow, if any).
// Nakamoto and Full Set are still drawn with their own special forms (when owned).
const LAYERS = [
  { key:'tdh',    name:'TDH',         hue: 42,  rf:0.18, incl: 0.05, az:0.00 },
  { key:'boost',  name:'BOOST',       hue:308,  rf:0.30, incl: 0.62, az:0.80 },
  { key:'unique', name:'UNIQUE',      hue:190,  rf:0.42, incl:-0.44, az:1.57 },
  { key:'nic',    name:'NIC',         hue:268,  rf:0.54, incl: 0.85, az:2.36 },
  { key:'rep',    name:'REP',         hue:110,  rf:0.66, incl:-0.66, az:3.14 },
  { key:'level',  name:'LEVEL',       hue:350,  rf:0.78, incl: 0.30, az:0.40 },
  // Meme Artist — orbital ring like the others, but rainbow; only for artists
  { key:'artist', name:'MEME ARTIST', hue:  0,  rf:0.86, incl: 0.20, az:2.10, rainbow: true, onlyIf: 'memeArtist' },
];

// ── Helpers ───────────────────────────────────────────────
function sigilHash(value) {
  let h = 2166136261;
  const text = String(value || 'sigil');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sigilRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wallet signature — full spectrum (0-360°), compatible with the iridescent palette
function sigilHue(address) {
  const raw = String(address || 'manual').toLowerCase();
  const hex = raw.match(/0x([0-9a-f]{6})/);
  return (hex ? parseInt(hex[1], 16) : sigilHash(raw)) % 360;
}

// Chroma shimmer — base hue drifts slowly by ±CHROMA_AMP degrees over the loop.
// Each layer has its own phase → together they "breathe" an iridescent shift.
// perfMode: skips sin() calls (thousands per frame → major CPU savings)
function chromaHue(base, phase) {
  if (perfMode) return base;
  return (base + Math.sin(T * LOOP_CHROMA + phase) * CHROMA_AMP + 360) % 360;
}

// (awakening removed — the sigil is always at full brightness)

function enrichSigil(data) {
  const next = Object.assign({
    address:         'manual',
    tdh:             0,
    boost:           1.0,
    level:           0,
    unique:          0,
    fullSet:         false,
    nakamoto:        false,
    nakamotoCount:   0,
    nic:             0,
    rep:             0,
    memeArtist:      false,
    memeArtistCount: 0,
    walletCount:     1,
  }, data || {});

  next.tdh             = Number(next.tdh)             || 0;
  next.boost           = Number(next.boost)           || 1.0;
  next.level           = Number(next.level)           || 0;
  next.unique          = Number(next.unique)          || 0;
  next.fullSet         = Boolean(next.fullSet);
  // Nakamoto — keep bool for existing checks, track count for multi-holders
  next.nakamotoCount   = Math.max(0, Number(next.nakamotoCount) || (next.nakamoto ? 1 : 0));
  next.nakamoto        = next.nakamotoCount > 0;
  next.nic             = Number(next.nic)             || 0;
  next.rep             = Number(next.rep)             || 0;
  next.memeArtistCount = Math.max(0, Number(next.memeArtistCount) || 0);
  next.memeArtist      = next.memeArtistCount > 0 || Boolean(next.memeArtist);
  next.walletCount     = Math.max(1, Number(next.walletCount) || 1);
  next.baseHue         = sigilHue(next.address);
  return next;
}

// 3D → 2D projection (uses FF.rotX, FF.rotY)
function project3D(x3, y3, z3) {
  const ry = FF.rotY;
  const xa =  x3 * Math.cos(ry) + z3 * Math.sin(ry);
  const za = -x3 * Math.sin(ry) + z3 * Math.cos(ry);
  const rx = FF.rotX;
  const yb = y3 * Math.cos(rx) - za * Math.sin(rx);
  const zb = y3 * Math.sin(rx) + za * Math.cos(rx);
  const xb = xa;
  // Z-axis roll (seed-based) — makes the axis direction unique in 3D
  const rz = FF.axisAz || 0;
  const xc = xb * Math.cos(rz) - yb * Math.sin(rz);
  const yc = xb * Math.sin(rz) + yb * Math.cos(rz);
  const f  = 1100;
  const s  = f / (f + zb);
  const depth = clamp((zb / SIGIL_R + 1) * 0.5, 0, 1);
  return { x: FF.cx + xc * s, y: FF.cy + yc * s, depth, z: zb };
}

// 3D coordinate of a point on an orbital ring
// incl = tilt around the X axis, az = rotation around the Y axis
function ringPt(angle, radius, incl, az) {
  const x0 = Math.cos(angle) * radius;
  const y0 = Math.sin(angle) * radius * Math.sin(incl);
  const z0 = Math.sin(angle) * radius * Math.cos(incl);
  const xa = x0 * Math.cos(az) + z0 * Math.sin(az);
  const za = -x0 * Math.sin(az) + z0 * Math.cos(az);
  return { x: xa, y: y0, z: za };
}

function togglePerf() {
  perfMode = !perfMode;
  const btn = document.getElementById('perfBtn');
  btn.textContent = perfMode ? '⚡ PERF MODE' : '✦ FULL QUALITY';
  btn.classList.toggle('perf-on', perfMode);
  if (sigil) buildVisuals();
}


// ── Manual ────────────────────────────────────────────────
function submitManual() {
  const data = {
    address:     document.getElementById('walletInput').value.trim() || 'manual',
    tdh:         parseFloat(document.getElementById('m_tdh').value)         || 0,
    tdh_boosted: parseFloat(document.getElementById('m_tdh_boosted').value) || 0,
    boost:       parseFloat(document.getElementById('m_boost').value)       || 1.0,
    level:       parseFloat(document.getElementById('m_level').value)       || 0,
    unique:      parseFloat(document.getElementById('m_unique').value)      || 0,
    fullSet:     document.getElementById('m_fullset').checked,
    nakamoto:    document.getElementById('m_nakamoto').checked,
    nic:         parseFloat(document.getElementById('m_nic').value)         || 0,
    rep:         parseFloat(document.getElementById('m_rep').value)         || 0,
  };
  if (data.tdh === 0 && data.unique === 0) { showUnborn(); return; }
  renderSigil(data);
}

// ── Main render ───────────────────────────────────────────
function renderSigil(data) {
  sigil = enrichSigil(data);
  organism = {
    seed: sigilHash(`${sigil.address}:${sigil.tdh}:${sigil.unique}:${sigil.boost}:${sigil.rep}:${sigil.nic}`),
    baseHue: sigil.baseHue,
  };

  const entry = document.getElementById('entry');
  entry.classList.add('fade-out');
  setTimeout(() => { entry.style.display = 'none'; }, 800);

  document.getElementById('canvasWrap').style.display = 'block';
  document.getElementById('hud').style.display        = 'block';
  document.getElementById('resetBtn').style.display   = 'block';
  document.getElementById('topCtrls').style.display   = 'flex';
  const zs = document.getElementById('zoomSlider');
  if (zs) zs.classList.add('visible');
  resetViewZoom();

  const perfBtn = document.getElementById('perfBtn');
  perfBtn.textContent   = perfMode ? '⚡ PERF MODE' : '✦ FULL QUALITY';
  perfBtn.classList.toggle('perf-on', perfMode);

  buildHUD();
  buildVisuals();
  clearHoverState();  // new sigil → reset hover/pin
  if (animId) cancelAnimationFrame(animId);
  lastTs = 0;
  animate(0);

  // Live data indicator + auto-refresh
  const inputEl = document.getElementById('walletInput');
  _currentAddr  = inputEl ? (inputEl.value.trim() || null) : null;
  _lastFetchedAt = Date.now();
  const liveEl = document.getElementById('liveIndicator');
  if (liveEl) {
    liveEl.classList.remove('stale', 'refreshing');
    liveEl.classList.toggle('visible', !!_currentAddr);  // hide in demo mode
  }
  updateLiveTimestamp();
  startAutoRefresh();
}

// ── Sigil Name generator — a personal name of the form "modifier + archetype" ──
// Deterministic: the same wallet always gets the same name (seed-based pick).
// Rule: Nakamoto/Artist/FullSet take precedence; otherwise the dominant parameter decides.
function seededPick(arr, seed) {
  if (!arr || arr.length === 0) return '';
  return arr[(seed >>> 0) % arr.length];
}

// ── Dictionary pools ──────────────────────────────────────────
// Each bucket has 4-8 variants so equal-profile wallets diverge into distinct sigils.
// Keep pools internally consistent in tone — they get combined freely at runtime.
const SIGIL_MODIFIERS = {
  nakamoto:  ['Golden', 'Gilded', 'Auric'],
  fullSet:   ['Blessed', 'Hallowed', 'Consecrated'],
  tier8:     ['Ancient', 'Deep', 'Resonant', 'Primordial', 'Abyssal', 'Eternal', 'Vast', 'Fathomless'],
  tier6:     ['Weighty', 'Dense', 'Ponderous', 'Gravid', 'Enduring', 'Stalwart'],
  tier5:     ['Steadfast', 'Rooted', 'Anchored', 'Settled', 'Poised'],
  unborn:    ['Dormant', 'Slumbering', 'Awaiting', 'Latent'],
  rising:    ['Rising', 'Ascending', 'Climbing', 'Waxing', 'Emergent', 'Cresting'],
  luminous:  ['Luminous', 'Radiant', 'Lustrous', 'Gleaming', 'Vivid', 'Shining', 'Glowing', 'Incandescent'],
  amplified: ['Amplified', 'Charged', 'Boosted', 'Vibrant', 'Surging'],
  quiet:     ['Quiet', 'Silent', 'Hushed', 'Still', 'Soft', 'Muted'],
  modest:    ['Steady', 'Modest', 'Plain', 'Even', 'Measured', 'Temperate', 'Calm', 'Grounded'],
};

const SIGIL_ARCHETYPES = {
  nakamotoArtist: ['Cornerstone', 'Founding Voice', 'Prime Maker', 'Originator', 'Seed-Bearer'],
  nakamoto:       ['Bearer', "Founder's Heir", 'Keystone', 'Titan', 'Bedrock', 'Warden'],
  artist:         ['Maker', 'Author', 'Scribe', 'Crafter', 'Weaver', 'Forger', 'Shaper', 'Architect'],
  fullSet:        ['Completist', 'Conservator', 'Preserver', 'Whole-Keeper'],
  drifter:        ['Drifter', 'Wanderer', 'Walker', 'Traveler', 'Seeker', 'Rover'],
  tdh:            ['Anchor', 'Steward', 'Pillar', 'Keeper', 'Sentinel', 'Rock'],
  unique:         ['Curator', 'Collector', 'Archivist', 'Gatherer', 'Binder'],
  rep:            ['Herald', 'Witness', 'Signal', 'Emissary', 'Messenger', 'Speaker'],
  nic:            ['Voice', 'Catalyst', 'Channel', 'Nexus', 'Conduit', 'Resonator'],
  level:          ['Adept', 'Veteran', 'Elder', 'Sage', 'Master', 'Dean'],
};

// Third word — classical "of the X" suffix, bucketed by profile signal.
// Adds uniqueness and flavor without disturbing modifier/archetype kin logic.
const SIGIL_SUFFIXES = {
  nakamoto: ['of the Seize', 'of the Origin', 'of the Founding', 'of the Root', 'of First Light'],
  fullSet:  ['of the 484', 'of the Complete', 'of the Whole', 'of the Full Measure'],
  artist:   ['of the Hand', "of the Maker's Road", 'of the Glyph', 'of the Press', 'of the Spark'],
  unborn:   ['of the Unseen', 'of the Uncarved', 'of the Before', 'of the Hush'],
  general:  [
    'of the Archive', 'of the Ledger', 'of the Long Day', 'of the Slow Burn',
    'of the Mirror',  'of the Orbit',  'of the Horizon',  'of the Threshold',
    'of the Veil',    'of the Spiral', 'of the Open Path','of the Current',
    'of the Well',    'of the Signal', 'of the Quiet Hour',
  ],
};

// ── Sigil Name pickers ────────────────────────────────────────
// Modifier / Archetype / Suffix are picked independently (each with its own seed channel),
// so exposing them as separate functions lets callers (KIN matching, build script)
// work with individual components without string-splitting.

function pickSigilModifier(s) {
  if (!s) return '';
  const seed = sigilHash((s.address || 'manual') + ':mod');
  const tier = (typeof getSigilClass === 'function') ? (getSigilClass(s.tdh).tier || 1) : 1;
  const tdhN   = normalizeTDH(s.tdh || 0);
  const repN   = normalizeRep(s.rep || 0);
  const nicN   = normalizeNic(s.nic || 0);
  const boostN = clamp(((s.boost || 1) - 1.0) / 1.3, 0, 1);
  const levelN = clamp((s.level || 0) / 100, 0, 1);

  if (s.nakamoto)                                       return seededPick(SIGIL_MODIFIERS.nakamoto,  seed);
  if (s.fullSet)                                        return seededPick(SIGIL_MODIFIERS.fullSet,   seed);
  if (tier >= 8)                                        return seededPick(SIGIL_MODIFIERS.tier8,     seed);
  if (tier >= 6)                                        return seededPick(SIGIL_MODIFIERS.tier6,     seed);
  if (tier >= 5)                                        return seededPick(SIGIL_MODIFIERS.tier5,     seed);
  if ((s.tdh || 0) === 0 && (s.unique || 0) === 0)      return seededPick(SIGIL_MODIFIERS.unborn,    seed);
  if (tdhN < 0.30 && (repN > 0.45 || levelN > 0.45))    return seededPick(SIGIL_MODIFIERS.rising,    seed);
  if (repN > 0.65)                                      return seededPick(SIGIL_MODIFIERS.luminous,  seed);
  if (boostN > 0.5)                                     return seededPick(SIGIL_MODIFIERS.amplified, seed);
  if (nicN < 0.10)                                      return seededPick(SIGIL_MODIFIERS.quiet,     seed);
  return seededPick(SIGIL_MODIFIERS.modest, seed);
}

function pickSigilArchetype(s) {
  if (!s) return '';
  const seed = sigilHash((s.address || 'manual') + ':core');

  if (s.nakamoto && s.memeArtist) return seededPick(SIGIL_ARCHETYPES.nakamotoArtist, seed);
  if (s.nakamoto)                 return seededPick(SIGIL_ARCHETYPES.nakamoto,       seed);
  if (s.memeArtist)               return seededPick(SIGIL_ARCHETYPES.artist,         seed);
  if (s.fullSet)                  return seededPick(SIGIL_ARCHETYPES.fullSet,        seed);

  // Dominant stat → role
  const tdhN   = normalizeTDH(s.tdh || 0);
  const repN   = normalizeRep(s.rep || 0);
  const nicN   = normalizeNic(s.nic || 0);
  const levelN = clamp((s.level || 0) / 100, 0, 1);
  const uniN   = clamp((s.unique || 0) / 484, 0, 1);
  const dom = [
    ['tdh', tdhN], ['unique', uniN], ['rep', repN], ['nic', nicN], ['level', levelN],
  ].sort((a, b) => b[1] - a[1])[0];

  if (dom[1] < 0.08) return seededPick(SIGIL_ARCHETYPES.drifter, seed);
  return seededPick(SIGIL_ARCHETYPES[dom[0]] || SIGIL_ARCHETYPES.drifter, seed);
}

function pickSigilSuffix(s) {
  if (!s) return '';
  const seed = sigilHash((s.address || 'manual') + ':suffix');

  if (s.nakamoto)  return seededPick(SIGIL_SUFFIXES.nakamoto, seed);
  if (s.fullSet)   return seededPick(SIGIL_SUFFIXES.fullSet,  seed);
  if (s.memeArtist) return seededPick(SIGIL_SUFFIXES.artist,  seed);
  if ((s.tdh || 0) === 0 && (s.unique || 0) === 0) return seededPick(SIGIL_SUFFIXES.unborn, seed);
  return seededPick(SIGIL_SUFFIXES.general, seed);
}

function generateSigilName(s) {
  if (!s) return '';
  return `${pickSigilModifier(s)} ${pickSigilArchetype(s)} ${pickSigilSuffix(s)}`.trim();
}

// A color dot for each parameter — the color of its orbital ring or rare form.
const PARAM_DOT = {
  'TDH':         'hsl(42, 85%, 72%)',     // amber (solar core + TDH ring)
  'BOOST':       'hsl(308, 85%, 72%)',    // magenta
  'UNIQUE':      'hsl(190, 85%, 72%)',    // cyan
  'NIC':         'hsl(268, 85%, 72%)',    // lavender
  'REP':         'hsl(110, 70%, 68%)',    // sage
  'LEVEL':       'hsl(350, 85%, 72%)',    // coral
  'MEME ARTIST': 'rainbow',               // conic gradient
  'FULL SET':    'hsl(155, 85%, 70%)',    // teal — thorny shell color
  'NAKAMOTO':    'hsl(48, 100%, 72%)',    // gold — bracelet color
};
function paramDotHtml(k) {
  const c = PARAM_DOT[k];
  if (c === null || c === undefined) return '<span class="pdot-pad"></span>';
  if (c === 'rainbow') return '<span class="pdot rainbow-dot"></span>';
  return `<span class="pdot" style="background:${c}"></span>`;
}

function buildHUD() {
  const sc       = getSigilClass(sigil.tdh);
  const sigilName = generateSigilName(sigil);
  document.getElementById('hudAddr').textContent     = shortAddr(sigil.address);
  document.getElementById('hudClass').textContent    = sc.name;
  document.getElementById('hudClass').style.color    = `hsl(${sigil.baseHue}, 82%, 74%)`;
  document.getElementById('hudSigilname').textContent = sigilName;
  document.getElementById('hudSigilname').style.color = `hsla(${sigil.baseHue}, 60%, 82%, 0.85)`;

  const artistN = sigil.memeArtistCount || 0;
  const params = [
    ['TDH',         sigil.tdh.toLocaleString()],
    ['BOOST',       `×${sigil.boost.toFixed(2)}`],
    ['LEVEL',       sigil.level],
    ['UNIQUE',      sigil.unique],
    ['NIC',         sigil.nic.toLocaleString()],
    ['REP',         sigil.rep.toLocaleString()],
    ['FULL SET',    sigil.fullSet  ? 'YES' : 'NO'],
    ['NAKAMOTO',    (sigil.nakamotoCount || 0) > 0 ? String(sigil.nakamotoCount) : 'NO'],
    ['MEME ARTIST', artistN > 0 ? `${artistN} card${artistN > 1 ? 's' : ''}` : 'NO'],
  ];
  document.getElementById('hudParams').innerHTML = params
    .map(([k, v]) =>
      `<span class="pline">${paramDotHtml(k)}<span>${k} <span style="color:rgba(255,255,255,0.92)">${v}</span></span></span>`)
    .join('');
}

// ══════════════════════════════════════════════════════════
//  NOISE + CURL FIELD ENGINE
// ══════════════════════════════════════════════════════════
let FF        = {};
let particles = [];
let trailCanvas, trailCtx;
let lastTs    = 0;

function smoothNoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  function h(a, b) {
    const n = sigilHash(`${seed}:${a}:${b}`);
    return (n / 0xFFFFFFFF) * 2 - 1;
  }
  return lerp(lerp(h(ix, iy), h(ix+1, iy), ux), lerp(h(ix, iy+1), h(ix+1, iy+1), ux), uy);
}

function curlAngle(x, y, t, seed, scale) {
  const e  = 0.9;
  const ts = t * FF.timeScale;
  const npy = smoothNoise(x * scale + ts * 0.29,  (y + e) * scale,        seed);
  const nmy = smoothNoise(x * scale + ts * 0.29,  (y - e) * scale,        seed);
  const npx = smoothNoise((x + e) * scale,          y * scale + ts * 0.29, seed);
  const nmx = smoothNoise((x - e) * scale,          y * scale + ts * 0.29, seed);
  return Math.atan2((npy - nmy), -(npx - nmx));
}

function flowAngle(x, y, t) {
  const a1 = curlAngle(x, y, t, FF.seed1, FF.scale);
  const a2 = curlAngle(x, y, t, FF.seed2, FF.scale * FF.oct2Scale);
  const a3 = curlAngle(x, y, t, FF.seed3, FF.scale * FF.oct3Scale);

  let vx = Math.cos(a1) + Math.cos(a2) * FF.oct2Amp + Math.cos(a3) * FF.oct3Amp;
  let vy = Math.sin(a1) + Math.sin(a2) * FF.oct2Amp + Math.sin(a3) * FF.oct3Amp;
  let angle = Math.atan2(vy, vx);

  for (const pole of FF.poles) {
    const dx = x - pole.x, dy = y - pole.y;
    const dist = Math.sqrt(dx*dx + dy*dy) + 1;
    const poleAngle = Math.atan2(dy, dx) + (pole.ccw ? Math.PI * 0.5 : -Math.PI * 0.5);
    const inf = pole.strength / (1 + dist * FF.poleDecay);
    const px = Math.cos(angle) * (1 - inf) + Math.cos(poleAngle) * inf;
    const py = Math.sin(angle) * (1 - inf) + Math.sin(poleAngle) * inf;
    angle = Math.atan2(py, px);
  }
  return angle;
}

// Particle — polar coordinate within sigilR.
// isStar: true → tier-bonus particle (sparkles like a star, vivid hue, halo render).
function createParticle(rand, isStar) {
  const r   = Math.sqrt(rand()) * FF.sigilR * 0.88;
  const a   = rand() * Math.PI * 2;
  const x   = FF.cx + Math.cos(a) * r;
  const y   = FF.cy + Math.sin(a) * r;
  const hueOffset = (rand() - 0.5) * FF.hueSpread;
  const baseHue   = isStar ? Math.floor(rand() * 360)       // star → full spectrum
                           : (FF.baseHue + hueOffset + 360) % 360;
  const baseSize  = lerp(FF.minSize, FF.maxSize, Math.pow(rand(), 1.6));

  return {
    x, y,
    vx: 0, vy: 0,
    age: 0,
    maxAge:     lerp(FF.minLife, FF.maxLife, rand()),
    hue:        baseHue,
    hueShift:   (rand() - 0.5) * (isStar ? 40 : 80),        // stars are more stable
    speed:      lerp(FF.minSpeed, FF.maxSpeed, rand()),
    size:       isStar ? baseSize * 1.5 : baseSize,
    alpha:      lerp(0.40, 0.95, rand()) * (isStar ? 1.10 : 1.0),
    depthPhase: rand() * Math.PI * 2,
    depthSpeed: lerp(0.15, 0.55, rand()) * (rand() > 0.5 ? 1 : -1),
    twinkle:    rand() * Math.PI * 2,
    isStar:     !!isStar,
  };
}

// ── buildVisuals ──────────────────────────────────────────
function buildVisuals() {
  if (!sigil) return;

  // Logical viewport dimensions (c1.width is now physical, multiplied by DPR)
  const W    = window.innerWidth;
  const H    = window.innerHeight;
  const rand = sigilRng(organism.seed);

  // Preserve previous rotation angle (don't reset on resize)
  const prevRotY = (FF && FF.rotY) ? FF.rotY : 0;

  const tdhN   = normalizeTDH(sigil.tdh);
  const boostN = clamp((sigil.boost - 1.0) / 1.3, 0, 1);  // 1.00→0, 1.65→0.5, 2.30→1.0
  const levelN   = clamp(sigil.level / 100, 0, 1);
  const uniN     = clamp(sigil.unique / 484, 0, 1);
  const nicN     = normalizeNic(sigil.nic);
  const repN     = normalizeRep(sigil.rep);
  const fullSetN = sigil.fullSet  ? 1.0 : 0.0;
  const nakamoN  = sigil.nakamoto ? 1.0 : 0.0;

  // TDH-driven scale, viewport-aware (don't crop the sigil on mobile, let it breathe)
  const rawSigilScale   = lerp(0.38, 0.90, tdhN);
  const rawSigilR       = SIGIL_R * rawSigilScale;
  const viewportRadius = Math.min(W, H) * 0.42;  // 42% → ~8% margin on each side
  const sigilR          = Math.min(rawSigilR, viewportRadius);
  const sigilScale      = sigilR / SIGIL_R;          // back-compute for downstream

  // Tier (1-9) — 9 TDH tiers, trigger visual "unlocks"
  const tier = (typeof getSigilClass === 'function')
    ? (getSigilClass(sigil.tdh).tier || 1)
    : 1;

  // Wallet-signed axis: tilt + azimuth → unique direction in 3D (fingerprint)
  const axisTilt = (((organism.seed >>> 0) % 10000) / 10000 - 0.5) * 0.9;   // ±0.45 rad
  const axisAz   = (sigilHash(organism.seed + 333) / 0xFFFFFFFF) * Math.PI * 2;  // 0 → 2π

  // Chroma shimmer phases — seed-based, each sigil gets its own "hue dance"
  const phaseRng    = sigilRng(sigilHash(organism.seed + 42));
  const layerPhases = LAYERS.map(() => phaseRng() * Math.PI * 2);

  // REP → magnetic field poles (particles flow along the magnetic field)
  const poleCount = 1 + Math.floor(repN * 5);
  const poles = [];
  for (let i = 0; i < poleCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.10 + rand() * 0.38) * sigilR;
    poles.push({
      x:        W * 0.5 + Math.cos(a) * r,
      y:        H * 0.5 + Math.sin(a) * r,
      strength: lerp(0.08, 0.42, rand()),
      ccw:      rand() > 0.5,
    });
  }

  // Normalized strength of each orbital layer — matches LAYERS order
  const artistN = sigil.memeArtist ? 1 : 0;
  const layerStrength = [
    tdhN,     // L0: TDH
    boostN,   // L1: Boost
    uniN,     // L2: Unique
    nicN,     // L3: NIC
    repN,     // L4: REP
    levelN,   // L5: Level
    artistN,  // L6: Meme Artist (rainbow, if any)
  ];

  FF = {
    cx: W * 0.5, cy: H * 0.5,
    baseHue: sigil.baseHue,

    // Form scale + axis (tilt + azimuth = unique direction in 3D)
    sigilScale, sigilR, axisTilt, axisAz,

    // Layer phases for chroma shimmer
    layerPhases,

    seed1: organism.seed,
    seed2: sigilHash(organism.seed + 1),
    seed3: sigilHash(organism.seed + 2),

    scale:         lerp(0.0022, 0.0060, 1 - tdhN),
    // Base particles are like crystal dust (baseHue-based, small).
    // Tier-bonus particles sparkle in star mode (full spectrum, with halo).
    // perfMode: drops the base cap and star particles (the biggest perf win)
    baseParticleCount: Math.floor(lerp(180, perfMode ? 220 : 620, tdhN)),
    starParticleCount: perfMode ? 0 : Math.max(0, tier - 2) * 50,
    get particleCount() { return this.baseParticleCount + this.starParticleCount; },

    // Tier info — draw functions use it for unlocks
    tier,

    oct2Scale: lerp(1.6, 4.8, nicN),
    oct2Amp:   lerp(0.35, 1.25, nicN),
    oct3Scale: lerp(2.8, 9.5, nicN),
    oct3Amp:   lerp(0.12, 0.82, nicN),

    poles,
    poleDecay: lerp(0.0018, 0.005, repN),

    hueSpread:     lerp(60, 220, uniN),           // Unique → iridescent spectrum width
    timeScale:     lerp(0.15, 0.045, boostN),     // Boost → flow speed
    minSize:       lerp(0.6, 1.4, uniN),          // Particle dot diameter
    maxSize:       lerp(1.6, 3.2, uniN),
    minSpeed:      lerp(0.40, 0.9, tdhN),
    maxSpeed:      lerp(1.0,  2.8, tdhN),
    minLife:       lerp(140, 340, levelN),        // Level → lifespan (clarity)
    maxLife:       lerp(320, 880, tdhN),

    nakamoto: sigil.nakamoto,
    fullSet:  sigil.fullSet,

    layerStrength,

    // 3D — rotY increases continuously, rotX is axis tilt + a gentle breathing sway
    rotX: axisTilt,
    rotY: prevRotY,

  };

  // Fixed sparkle points — crystal star intersections
  FF.sparkles = buildSparkles(organism.seed, repN, levelN, tier);

  // Particle canvas (dots — NO trail, cleared every frame). DPR-scaled buffer, logical draw.
  const dpr          = Math.min(window.devicePixelRatio || 1, 2.5);
  trailCanvas        = document.createElement('canvas');
  trailCanvas.width  = Math.round(W * dpr);
  trailCanvas.height = Math.round(H * dpr);
  trailCtx           = trailCanvas.getContext('2d');
  trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  FF.logicalW        = W;
  FF.logicalH        = H;

  // Create particles, distribute their ages. First baseCount are normal, the rest are stars.
  particles = [];
  const rand2 = sigilRng(organism.seed);
  const baseN = FF.baseParticleCount;
  const total = FF.particleCount;
  for (let i = 0; i < total; i++) {
    const isStar = i >= baseN;
    const p = createParticle(rand2, isStar);
    p.age = Math.floor(rand2() * p.maxAge);
    particles.push(p);
  }
}


// ── Animation loop ────────────────────────────────────────
function animate(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) * 0.001, 0.05) : 0.016;
  lastTs = ts;
  T      = ts * 0.001;
  animId = requestAnimationFrame(animate);

  // Rotation on its own axis: Y = 30s master loop, X = axis tilt + a small breath
  FF.rotY += dt * LOOP_ROT_Y;
  FF.rotX  = FF.axisTilt + Math.sin(T * 0.17) * 0.08 + Math.sin(T * 0.09) * 0.04;

  updateParticles();
  drawBackground();
  drawForm();
  drawOverlay();

  // Rings rotate, so refresh hover every frame (even if the cursor is still)
  updateHoverFromFrame();
}

// ── Particle update — dots/stars (NO trail, cleared every frame) ──
function updateParticles() {
  if (!trailCtx) return;
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;

  // Clear every frame — don't let a trail build up
  trailCtx.clearRect(0, 0, W, H);
  trailCtx.globalCompositeOperation = 'lighter';

  for (const p of particles) {
    p.age++;

    if (p.age >= p.maxAge) {
      const wasStar = p.isStar;
      const r = sigilRng(sigilHash(organism.seed + p.age + Math.floor(T * 100)));
      Object.assign(p, createParticle(r, wasStar));
      continue;
    }

    const lifeFrac = p.age / p.maxAge;
    const fade     = Math.min(1, lifeFrac * 10) * Math.min(1, (1 - lifeFrac) * 10);
    if (fade < 0.02) continue;

    // Magnetic flow — curved field lines from REP poles
    const angle = flowAngle(p.x, p.y, T);
    p.vx = p.vx * 0.88 + Math.cos(angle) * p.speed * 0.12;
    p.vy = p.vy * 0.88 + Math.sin(angle) * p.speed * 0.12;

    // Sigil boundary
    const dxC = p.x - FF.cx, dyC = p.y - FF.cy;
    const distC = Math.sqrt(dxC * dxC + dyC * dyC);
    if (distC > FF.sigilR * 0.92) {
      p.vx -= (dxC / distC) * 0.5;
      p.vy -= (dyC / distC) * 0.5;
    }

    p.x += p.vx;
    p.y += p.vy;

    // 3D projection — axisTilt is already baked into rotX
    const dx = p.x - FF.cx, dy = p.y - FF.cy;
    const z_raw = dx * Math.sin(FF.rotY) - dy * Math.sin(FF.rotX) * Math.cos(FF.rotY);
    const ps    = 1 + z_raw * 0.00040;
    const sx    = (dx * Math.cos(FF.rotY) + dy * Math.sin(FF.rotX) * Math.sin(FF.rotY)) * ps;
    const sy    = dy * Math.cos(FF.rotX) * ps;
    // Z roll — axis azimuth
    const rz = FF.axisAz || 0;
    const px = FF.cx + sx * Math.cos(rz) - sy * Math.sin(rz);
    const py = FF.cy + sx * Math.sin(rz) + sy * Math.cos(rz);

    const depth   = 0.5 + Math.sin(T * p.depthSpeed + p.depthPhase) * 0.5;
    const twinkle = 0.70 + Math.sin(T * LOOP_SPARKLE + p.twinkle) * 0.30;
    const hue     = (p.hue + p.hueShift * lifeFrac + 360) % 360;
    const alpha   = p.alpha * fade * twinkle * lerp(0.55, 1.0, depth);
    const rad     = p.size * lerp(0.55, 1.4, depth);

    if (p.isStar) {
      // Tier-bonus particle — star: halo + crisp warm-white core, fully saturated
      const g = trailCtx.createRadialGradient(px, py, 0, px, py, rad * 3.5);
      g.addColorStop(0,    `hsla(${hue}, 100%, 92%, ${alpha * 0.80})`);
      g.addColorStop(0.35, `hsla(${hue}, 100%, 72%, ${alpha * 0.40})`);
      g.addColorStop(1,    'transparent');
      trailCtx.fillStyle = g;
      trailCtx.beginPath();
      trailCtx.arc(px, py, rad * 3.5, 0, Math.PI * 2);
      trailCtx.fill();

      trailCtx.fillStyle = `hsla(${hue}, 100%, 96%, ${Math.min(1, alpha + 0.15)})`;
      trailCtx.beginPath();
      trailCtx.arc(px, py, rad * 0.85, 0, Math.PI * 2);
      trailCtx.fill();
    } else {
      // Normal particle — single arc
      trailCtx.fillStyle = `hsla(${hue}, 88%, ${lerp(72, 95, depth)}%, ${alpha})`;
      trailCtx.beginPath();
      trailCtx.arc(px, py, rad, 0, Math.PI * 2);
      trailCtx.fill();
    }
  }
}

// ── Background ────────────────────────────────────────────
function drawBackground() {
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx1.fillStyle = '#000';
  ctx1.fillRect(0, 0, W, H);

  // Very soft wallet-hue aura — a glow that accents the black void
  const hue  = sigil.baseHue;
  const aura = ctx1.createRadialGradient(FF.cx, FF.cy, 0, FF.cx, FF.cy, FF.sigilR * 1.25);
  aura.addColorStop(0,   `hsla(${hue}, 70%, 11%, 0.35)`);
  aura.addColorStop(0.5, `hsla(${hue}, 60%, 6%, 0.12)`);
  aura.addColorStop(1,   'rgba(0,0,0,0)');
  ctx1.fillStyle = aura;
  ctx1.fillRect(0, 0, W, H);
}

// ── Orbital ring forms ────────────────────────────────────
function drawOrbitalForms(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const segs   = perfMode ? 72 : 144;

  const rainbowSpeed = 360 / 30;  // full turn every 30s (degrees/sec)

  for (let li = 0; li < LAYERS.length; li++) {
    const layer = LAYERS[li];
    // Conditional layer — skip if the condition isn't met (e.g. artist)
    if (layer.onlyIf && !sigil[layer.onlyIf]) continue;

    const strength = FF.layerStrength[li] || 0;
    // Hover/pin highlight — alpha/width multipliers bump up when focused
    const focused  = (layer.key === _hoveredLayerKey || layer.key === _pinnedLayerKey);
    const focusMul = focused ? 1.55 : 1.0;
    const eff      = (0.12 + strength * 0.88) * focusMul;

    const radius = layer.rf * FF.sigilR;
    const staticHue = chromaHue(layer.hue, FF.layerPhases[li] || 0);
    // Rainbow: hue varies per segment and rotates over time; otherwise a single hue
    const hueAt = layer.rainbow
      ? (idx, total) => (((idx / total) * 360) + T * rainbowSpeed) % 360
      : () => staticHue;

    // Progress arc for LEVEL — only the level/100 fraction is bright, the rest is dim
    const isLevel  = layer.key === 'level';
    const levelEnd = isLevel ? Math.min(1, (sigil.level || 0) / 100) : 1;
    // Alpha multiplier for segment i (0=dim, 1=bright)
    const levelAlphaAt = isLevel
      ? (i, total) => (i / total < levelEnd ? 1.0 : 0.15)
      : () => 1.0;

    // Ring points
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const angle = (i / segs) * Math.PI * 2;
      const p3    = ringPt(angle, radius, layer.incl, layer.az);
      const p2    = project3D(p3.x, p3.y, p3.z);
      pts.push(p2);
    }

    // Pass 1 — wide outer glow
    const glowWidth = 2.4 + eff * 4.6;
    const glowAlpha = 0.07 + eff * 0.16;
    for (let i = 0; i < segs; i++) {
      const p1    = pts[i], p2 = pts[i + 1];
      const depth = (p1.depth + p2.depth) * 0.5;
      const hue   = hueAt(i, segs);
      const lvlA  = levelAlphaAt(i, segs);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `hsla(${hue}, 82%, ${42 + depth * 22}%, ${glowAlpha * (0.25 + depth * 0.9) * lvlA})`;
      ctx.lineWidth   = glowWidth * (0.5 + depth * 1.1);
      ctx.stroke();
    }

    // Pass 2 — colored body
    const baseAlpha = 0.28 + eff * 0.52;
    const baseWidth = 0.8  + eff * 3.0;
    for (let i = 0; i < segs; i++) {
      const p1    = pts[i], p2 = pts[i + 1];
      const depth = (p1.depth + p2.depth) * 0.5;
      const alpha = baseAlpha * (0.30 + depth * 0.80);
      const w     = baseWidth * (0.35 + depth * 1.15);
      const lum   = 60 + depth * 28;
      const hue   = hueAt(i, segs);
      const lvlA  = levelAlphaAt(i, segs);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `hsla(${hue}, 88%, ${lum}%, ${alpha * lvlA})`;
      ctx.lineWidth   = w;
      ctx.stroke();
    }

    // Pass 3 — crystal edge: thin, high-luminance edge on the front half (skipped in perf mode)
    if (!perfMode) {
      for (let i = 0; i < segs; i++) {
        const p1    = pts[i], p2 = pts[i + 1];
        const depth = (p1.depth + p2.depth) * 0.5;
        if (depth < 0.40) continue;
        const edgeFade  = Math.min(1, (depth - 0.40) / 0.28);
        const edgeAlpha = (0.38 + eff * 0.46) * edgeFade;
        const hue       = hueAt(i, segs);
        const lvlA      = levelAlphaAt(i, segs);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = `hsla(${hue}, 100%, 86%, ${edgeAlpha * lvlA})`;
        ctx.lineWidth   = 0.6;
        ctx.stroke();
      }
    }

    // BOOST companion — a parallel golden line outside the ring, revealed by boost
    if (layer.key === 'boost' && strength > 0.05) {
      const companionR = radius * 1.05;
      for (let i = 0; i < segs; i++) {
        const a1  = (i / segs) * Math.PI * 2;
        const a2  = ((i + 1) / segs) * Math.PI * 2;
        const p3a = ringPt(a1, companionR, layer.incl, layer.az);
        const p3b = ringPt(a2, companionR, layer.incl, layer.az);
        const pa  = project3D(p3a.x, p3a.y, p3a.z);
        const pb  = project3D(p3b.x, p3b.y, p3b.z);
        const depth = (pa.depth + pb.depth) * 0.5;
        const alpha = (0.15 + strength * 0.30) * (0.30 + depth * 0.70);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = `hsla(42, 95%, ${60 + depth * 22}%, ${alpha})`;
        ctx.lineWidth   = 0.7 + depth * 0.4;
        ctx.stroke();
      }
    }

    // Bright nodes sliding along the ring
    const dir = li % 2 === 0 ? 1 : -1;
    const dotAngularPhase = T * LOOP_DOT * (0.65 + li * 0.08) * dir;

    if (layer.key === 'unique') {
      // ── 484-bead necklace: each slot is one meme, the N you own glow ──
      const TOTAL_SLOTS = 484;
      const owned       = Math.min(sigil.unique || 0, TOTAL_SLOTS);
      if (owned > 0) {
        // Bead size: few unique → large (visible), many unique → small (no overlap)
        const densityT   = Math.min(1, owned / 200);
        const beadRadius = lerp(2.6, 0.9, densityT) * FF.sigilScale;

        for (let i = 0; i < owned; i++) {
          const ang = (i / TOTAL_SLOTS) * Math.PI * 2 + dotAngularPhase;
          const p3  = ringPt(ang, radius, layer.incl, layer.az);
          const p2  = project3D(p3.x, p3.y, p3.z);
          const r   = beadRadius * (0.55 + p2.depth * 0.70);
          const dA  = (0.40 + eff * 0.45) * (0.35 + p2.depth * 0.65);
          const hue = hueAt(i, TOTAL_SLOTS);

          const g = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, r * 3.5);
          g.addColorStop(0,    `hsla(${hue}, 100%, 94%, ${dA})`);
          g.addColorStop(0.4,  `hsla(${hue}, 100%, 72%, ${dA * 0.50})`);
          g.addColorStop(1,    'transparent');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, r * 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p2.x, p2.y, r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, 100%, 96%, ${0.75 + p2.depth * 0.25})`;
          ctx.fill();
        }
      }
    } else {
      // Other rings — existing orbital-dot behavior
      const dotN = perfMode ? (3 + Math.floor(eff * 6)) : (4 + Math.floor(eff * 12));
      for (let i = 0; i < dotN; i++) {
        const ang   = (i / dotN) * Math.PI * 2 + dotAngularPhase;
        const p3    = ringPt(ang, radius, layer.incl, layer.az);
        const p2    = project3D(p3.x, p3.y, p3.z);
        const r     = (1.6 + eff * 3.2) * (0.40 + p2.depth * 0.80);
        const baseDA= (0.28 + eff * 0.55) * (0.30 + p2.depth * 0.70);
        // On LEVEL, only the dots within the level/100 range should glow
        const dotLvl = isLevel ? (i / dotN < levelEnd ? 1.0 : 0.10) : 1.0;
        const dA     = baseDA * dotLvl;
        const hue    = hueAt(i, dotN);

        const g = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, r * 5);
        g.addColorStop(0,    `hsla(${hue}, 100%, 94%, ${dA})`);
        g.addColorStop(0.35, `hsla(${hue}, 100%, 72%, ${dA * 0.50})`);
        g.addColorStop(1,    'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p2.x, p2.y, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 100%, 96%, ${(0.7 + p2.depth * 0.3) * dotLvl})`;
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

// ── Layer composition — Orrery form order ─────────────────
function drawForm() {
  if (!trailCanvas) return;
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx2.clearRect(0, 0, W, H);
  ctx2.globalCompositeOperation = 'source-over';

  // 1. Crystal particle atmosphere — draw with explicit logical dims (DPR buffer)
  ctx2.drawImage(trailCanvas, 0, 0, W, H);

  // 2. Armillary frame (faint sphere frame)
  drawArmillaryFrame(ctx2);

  // 3. Central sun (TDH — compact crystal burst)
  drawSolarCore(ctx2, FF.cx, FF.cy);

  // 3a. TDH spectrum waves — one wavy concentric band per 1M TDH (cap 30).
  //     Lives between the solar core and the innermost orbital ring.
  //     A visible testament to millions of days held.
  drawSpectrumWaves(ctx2);

  // 3b. Consolidation satellites (merged wallets = moons)
  drawConsolidationMoons(ctx2);

  // 4. REP inbound rays — signals flowing inward from outside (arriving at the ring)
  drawRepRays(ctx2);

  // 5. Orbital rings (6 scalars + artist rainbow ring if applicable)
  drawOrbitalForms(ctx2);

  // 5b. MEME ARTIST — bracelet beads on the main ring (when count ≥ 2)
  drawArtistBeads(ctx2);

  // 6. Crystal sparkle stars (REP/Level density)
  drawIntersectionSparkles(ctx2);

  // 6. FULL SET — thorny outer shell (invisible if not owned)
  drawFullSetThornyShell(ctx2);

  // 7. NAKAMOTO — gold bracelet + fast gold orb (invisible if not owned)
  drawNakamotoBracelet(ctx2);

  // 8. TIER UNLOCKS — tier-specific layers (conditional; functions gate themselves)
  drawPrestigeRing(ctx2);     // tier 5+ (ANCHOR)
  drawCosmicDust(ctx2);       // tier 8+ (LEGEND)
  drawPhenomenonAura(ctx2);   // tier 9   (PHENOMENON)
}

// ── Crystal sparkle sphere — intersection stars ──
// Fibonacci-distributed fixed points on a sphere, each a 4-arm lens flare.
// REP drives density, Level drives clarity.
function buildSparkles(seed, repN, levelN, tier) {
  const rng       = sigilRng(sigilHash(seed + 777));
  const tierBonus = Math.max(0, (tier || 1) - 5) * 2;   // bonus for PILLAR+
  const full      = 8 + Math.floor(repN * 10) + Math.floor(levelN * 5) + tierBonus;
  const N         = perfMode ? Math.max(4, Math.floor(full * 0.5)) : full;
  const phi  = Math.PI * (3 - Math.sqrt(5));
  const sparkles = [];
  for (let i = 0; i < N; i++) {
    const y  = 1 - (i / Math.max(1, N - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = i * phi + rng() * 0.5;
    sparkles.push({
      x: Math.cos(th) * rr,
      y,
      z: Math.sin(th) * rr,
      phase: rng() * Math.PI * 2,
      size:  0.7 + rng() * 0.8,
      hue:   rng() * 360,
    });
  }
  return sparkles;
}

function drawIntersectionSparkles(ctx) {
  if (!FF.sparkles) return;
  const radius = FF.sigilR * 0.62;  // around the midweight of the rings

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const sp of FF.sparkles) {
    const p = project3D(sp.x * radius, sp.y * radius, sp.z * radius);
    const twinkle = 0.30 + Math.sin(T * LOOP_SPARKLE + sp.phase) * 0.70;
    if (twinkle < 0.08) continue;

    const hue = chromaHue(sp.hue, sp.phase);
    const sz  = sp.size * (3.5 + p.depth * 3.5) * twinkle * FF.sigilScale;

    // 4 kollu crystal ray — lens flare
    for (let ray = 0; ray < 4; ray++) {
      const angle = (ray / 4) * Math.PI * 2 + sp.phase * 0.3;
      const len   = sz * 3.4;
      const x2    = p.x + Math.cos(angle) * len;
      const y2    = p.y + Math.sin(angle) * len;
      const g = ctx.createLinearGradient(p.x, p.y, x2, y2);
      g.addColorStop(0,    `hsla(${hue}, 95%, 94%, ${0.80 * twinkle})`);
      g.addColorStop(0.35, `hsla(${hue}, 100%, 82%, ${0.35 * twinkle})`);
      g.addColorStop(1,    'transparent');
      ctx.strokeStyle = g;
      ctx.lineWidth   = 0.7;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Colored halo + white core
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz * 1.6);
    glow.addColorStop(0,    `hsla(${hue}, 100%, 97%, ${twinkle})`);
    glow.addColorStop(0.35, `hsla(${hue}, 95%, 80%, ${0.45 * twinkle})`);
    glow.addColorStop(1,    'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(0, 0%, 100%, ${twinkle})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── Armillary frame — equator + polar meridian, a faint sphere feel ──
// For Tier 4+ (RESONANCE), a second pair of frames is added → a fuller sphere
function drawArmillaryFrame(ctx) {
  const segs   = perfMode ? 64 : 128;
  const radius = FF.sigilR * 0.96;
  const frames = [
    { incl: 0,              az: 0 },
    { incl: Math.PI * 0.5,  az: Math.PI * 0.5 },
  ];
  if (!perfMode && (FF.tier || 1) >= 4) {
    frames.push({ incl: Math.PI * 0.25, az: Math.PI * 0.25 });
    frames.push({ incl: Math.PI * 0.75, az: Math.PI * 1.30 });
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const f of frames) {
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const _p3a = ringPt(a1, radius, f.incl, f.az);
      const _p3b = ringPt(a2, radius, f.incl, f.az);
      const pa = project3D(_p3a.x, _p3a.y, _p3a.z);
      const pb = project3D(_p3b.x, _p3b.y, _p3b.z);
      const depth = (pa.depth + pb.depth) * 0.5;
      const alpha = (0.05 + 0.13 * depth);

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = `hsla(210, 40%, 78%, ${alpha})`;
      ctx.lineWidth   = 0.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── MEME ARTIST — iridescent spectrum beads (one pearl per extra card) ──
// The main artist ring lives at rf 0.86 in LAYERS. When count ≥ 2, (count − 1)
// pearls sit on top of the main ring and rotate with it.
// Each pearl = a 3-hue pearl gradient (spectrum sheen) + off-center highlight.
// Cap: the maximum card count in the artist index (today 6529er=25; dynamic via rebuild).
function drawArtistBeads(ctx) {
  const count = sigil.memeArtistCount || 0;
  if (!sigil.memeArtist || count < 2) return;

  // Dynamic cap: use the most prolific artist in the collection as the ceiling
  const collectionMax = (_sigilIndex && _sigilIndex._maxCount) || 25;
  const beadN = Math.min(collectionMax - 1, count - 1);

  // Parameters of the main artist ring (last entry in LAYERS)
  const artistLayer = LAYERS[LAYERS.length - 1];
  const radius = artistLayer.rf * FF.sigilR;
  const incl   = artistLayer.incl;
  const az     = artistLayer.az;

  const beadR        = 10 * FF.sigilScale + 3;      // more prominent (was 7*s+2)
  const rainbowSpeed = 360 / 30;                   // same cadence as the main ring
  const orbitPhase   = T * LOOP_DOT * 0.65;        // same speed as the other ring dots

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < beadN; i++) {
    const ang = (i / beadN) * Math.PI * 2 + orbitPhase;
    const p3  = ringPt(ang, radius, incl, az);
    const p2  = project3D(p3.x, p3.y, p3.z);
    const depth = p2.depth;
    const r     = beadR * (0.60 + depth * 0.60);

    // Spectrum position — each pearl sits in a different color family (in sync with the rainbow ring)
    const baseHue = (((i / beadN) * 360) + T * rainbowSpeed) % 360;
    const h1 = (baseHue - 48 + 360) % 360;   // left-neighbor hue
    const h2 = baseHue;                       // main hue
    const h3 = (baseHue + 48) % 360;          // right-neighbor hue

    // 1) Outer rainbow glow — pronounced, spreading (skipped in perf mode)
    if (!perfMode) {
      const outer = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, r * 3.2);
      outer.addColorStop(0,    `hsla(${h2}, 100%, 88%, ${0.50 + depth * 0.30})`);
      outer.addColorStop(0.45, `hsla(${h2}, 100%, 68%, ${0.22 + depth * 0.18})`);
      outer.addColorStop(1,    'transparent');
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2) Pearl body — off-center highlight + 3-hue iridescent gradient (prism sheen)
    const offX = -r * 0.35;
    const offY = -r * 0.35;
    const pearl = ctx.createRadialGradient(p2.x + offX, p2.y + offY, 0, p2.x, p2.y, r);
    pearl.addColorStop(0,    `hsla(${h1}, 100%, 94%, 0.95)`);
    pearl.addColorStop(0.40, `hsla(${h2}, 100%, 78%, 0.88)`);
    pearl.addColorStop(0.80, `hsla(${h3}, 100%, 62%, ${0.72 + depth * 0.18})`);
    pearl.addColorStop(1,    `hsla(${h3}, 100%, 45%, ${0.52 + depth * 0.18})`);
    ctx.fillStyle = pearl;
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2);
    ctx.fill();

    // 3) Crisp outline (sharpens the pearl's definition)
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${h2}, 100%, ${85 + depth * 10}%, ${0.45 + depth * 0.30})`;
    ctx.lineWidth   = 1.0 + depth * 0.6;
    ctx.stroke();

    // 4) Bright highlight dot — pearl shimmer (skipped in perf mode)
    if (!perfMode) {
      ctx.beginPath();
      ctx.arc(p2.x + offX * 0.7, p2.y + offY * 0.7, r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(0, 0%, 100%, ${0.80 + depth * 0.20})`;
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── TIER UNLOCKS — tier-specific signature effects ────────────────

// Tier 5+ (ANCHOR): Faint white prestige ring — just outside the orbital group
function drawPrestigeRing(ctx) {
  if (!FF || (FF.tier || 1) < 5) return;
  const radius = FF.sigilR * 0.83;
  const segs   = perfMode ? 64 : 128;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < segs; i++) {
    const a1 = (i / segs) * Math.PI * 2;
    const a2 = ((i + 1) / segs) * Math.PI * 2;
    const p3a = ringPt(a1, radius, 0.10, 0);
    const p3b = ringPt(a2, radius, 0.10, 0);
    const pa  = project3D(p3a.x, p3a.y, p3a.z);
    const pb  = project3D(p3b.x, p3b.y, p3b.z);
    const depth = (pa.depth + pb.depth) * 0.5;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = `hsla(0, 0%, 95%, ${0.09 + depth * 0.18})`;
    ctx.lineWidth   = 0.45;
    ctx.stroke();
  }
  ctx.restore();
}

// Tier 8+ (LEGEND): Rare cosmic dust drifting slowly at the sigil's outer edge
function drawCosmicDust(ctx) {
  if (!FF || (FF.tier || 1) < 8) return;
  const count = perfMode ? 20 : 42;
  const rng   = sigilRng(sigilHash(organism.seed + 853));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const r          = FF.sigilR * (0.92 + rng() * 0.22);
    const baseA      = rng() * Math.PI * 2;
    const driftSpeed = lerp(0.006, 0.022, rng());
    const a          = baseA + T * driftSpeed;
    const x          = Math.cos(a) * r;
    const z          = Math.sin(a) * r;
    const y          = (rng() - 0.5) * 48 * FF.sigilScale;
    const p          = project3D(x, y, z);
    const size       = (0.7 + rng() * 0.9) * FF.sigilScale;
    const twinkle    = 0.35 + Math.sin(T * LOOP_SPARKLE * 0.35 + i * 0.73) * 0.65;
    const hue        = Math.floor(rng() * 360);
    const alpha      = 0.28 * twinkle * p.depth;
    if (alpha < 0.02) continue;
    ctx.fillStyle = `hsla(${hue}, 80%, 90%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Tier 9 (PHENOMENON): A rare golden corona flash, ~1.5s long, once every 10s
function drawPhenomenonAura(ctx) {
  if (!FF || (FF.tier || 1) < 9) return;
  const period = 10;
  const t      = T % period;
  if (t > 1.5) return;
  const progress  = t / 1.5;
  const intensity = Math.sin(progress * Math.PI) * (perfMode ? 0.5 : 1.0);
  if (intensity < 0.05) return;

  const inner = FF.sigilR * 0.98;
  const outer = FF.sigilR * 1.20;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(FF.cx, FF.cy, inner, FF.cx, FF.cy, outer);
  grad.addColorStop(0,    'transparent');
  grad.addColorStop(0.5,  `hsla(48, 100%, 78%, ${0.20 * intensity})`);
  grad.addColorStop(0.85, `hsla(42, 100%, 60%, ${0.08 * intensity})`);
  grad.addColorStop(1,    'transparent');
  ctx.fillStyle = grad;
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ── CONSOLIDATION — merged wallets shown as moons around the sun ──
// If walletCount > 1, N-1 prominent satellites sit OUTSIDE the TDH sun's flare zone.
function drawConsolidationMoons(ctx) {
  const count = Math.max(1, sigil.walletCount || 1);
  if (count <= 1) return;
  const moonN = count - 1;

  // Orbit radius must be beyond where the sun's flare ends
  // Flare max ≈ coreR × (4.5 + tdhN*3 + boostN*2.5) → very far out
  // For the moons: close to the inner wall of the TDH ring, but just inside it
  const tdhRingR  = LAYERS[0].rf * FF.sigilR;        // ≈ 0.18 × sigilR
  const orbitR    = tdhRingR * 0.65;                // 65% of the TDH ring — clears the flare
  const moonR     = 6 * FF.sigilScale + 3;           // prominent size
  const hue       = sigil.baseHue;
  const rotPeriod = 18;
  const rotOffset = (T / rotPeriod) * Math.PI * 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < moonN; i++) {
    const a = (i / moonN) * Math.PI * 2 + rotOffset;
    const x = Math.cos(a) * orbitR;
    const z = Math.sin(a) * orbitR;
    const p = project3D(x, 0, z);
    const d = p.depth;

    // Outer halo — wide and bright
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, moonR * 5);
    glow.addColorStop(0,    `hsla(${hue}, 95%, 92%, ${0.75 + d * 0.25})`);
    glow.addColorStop(0.3,  `hsla(${hue}, 100%, 76%, ${0.40 + d * 0.25})`);
    glow.addColorStop(0.7,  `hsla(${hue}, 100%, 55%, ${0.12 + d * 0.10})`);
    glow.addColorStop(1,    'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, moonR * 5, 0, Math.PI * 2);
    ctx.fill();

    // Warm core
    ctx.beginPath();
    ctx.arc(p.x, p.y, moonR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(0, 0%, 100%, ${0.90 + d * 0.10})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── REP — Inbound Rays (signals flowing from outside into the REP ring) ──
// Social capital coming to you from others; ray count scales with sqrt(rep/4M).
// Each ray carries a bright signal dot traveling inward.
function drawRepRays(ctx) {
  const rep = sigil.rep || 0;
  if (rep <= 0) return;

  const repScale  = Math.min(1, Math.sqrt(rep / 4_000_000));
  // In perfMode the ray cap is 20 (full 50)
  const rayCount  = 4 + Math.floor(repScale * (perfMode ? 16 : 46));
  const outerR    = FF.sigilR * 0.97;
  const innerR    = FF.sigilR * 0.66;                 // radius of the REP ring
  const baseHue   = 110;                             // sage
  const travelSec = 4.0;                             // signal reaches inward in 4s
  const focused   = (_hoveredLayerKey === 'rep' || _pinnedLayerKey === 'rep');
  const focusMul  = focused ? 1.5 : 1.0;

  // Generate ray directions via a seed-jittered Fibonacci sphere (a star pattern unique to each wallet)
  const rng = sigilRng(sigilHash(organism.seed + 607));
  const phi = Math.PI * (3 - Math.sqrt(5));
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const y     = 1 - (i / Math.max(1, rayCount - 1)) * 2;
    const rr    = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * phi + rng() * 0.35;
    rays.push({
      dx:    Math.cos(theta) * rr,
      dy:    y,
      dz:    Math.sin(theta) * rr,
      phase: rng() * Math.PI * 2,
    });
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const ray of rays) {
    const ox = ray.dx * outerR, oy = ray.dy * outerR, oz = ray.dz * outerR;
    const ix = ray.dx * innerR, iy = ray.dy * innerR, iz = ray.dz * innerR;
    const pOut = project3D(ox, oy, oz);
    const pIn  = project3D(ix, iy, iz);
    const depth = (pOut.depth + pIn.depth) * 0.5;
    const hue   = chromaHue(baseHue, ray.phase);

    // Ray line — faint on the outside, brighter toward the inner end (signal strengthening)
    const grad = ctx.createLinearGradient(pOut.x, pOut.y, pIn.x, pIn.y);
    grad.addColorStop(0,   `hsla(${hue}, 70%, 60%, 0)`);
    grad.addColorStop(0.5, `hsla(${hue}, 85%, 70%, ${0.18 * (0.3 + depth * 0.7) * focusMul})`);
    grad.addColorStop(1,   `hsla(${hue}, 95%, 78%, ${0.48 * (0.3 + depth * 0.7) * focusMul})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 0.7;
    ctx.beginPath();
    ctx.moveTo(pOut.x, pOut.y);
    ctx.lineTo(pIn.x, pIn.y);
    ctx.stroke();

    // Inward-traveling signal dot (0 = outer, 1 = arrival at the REP ring)
    const travelT = ((T + ray.phase * travelSec / (Math.PI * 2)) % travelSec) / travelSec;
    const sx = ox + (ix - ox) * travelT;
    const sy = oy + (iy - oy) * travelT;
    const sz = oz + (iz - oz) * travelT;
    const pp = project3D(sx, sy, sz);
    const r  = (0.8 + travelT * 1.6) * FF.sigilScale;
    const a  = (0.55 + travelT * 0.35) * (0.45 + pp.depth * 0.55) * focusMul;

    const glow = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, r * 3);
    glow.addColorStop(0,   `hsla(${hue}, 100%, 92%, ${a})`);
    glow.addColorStop(0.5, `hsla(${hue}, 100%, 72%, ${a * 0.45})`);
    glow.addColorStop(1,   'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, r * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── FULL SET — thorny outer shell, teal (invisible if not owned) ──
// Thick spikes + dots between them. Slow 60s rotation, pulse (blink) every 2s.
function drawFullSetThornyShell(ctx) {
  if (!sigil.fullSet) return;
  const radius     = FF.sigilR * 0.95;
  const spikeCount = 24;
  const spikeLen   = 32 * FF.sigilScale;                          // a touch thicker
  const segs       = perfMode ? 64 : 128;
  const slowRot    = (T / 60) * Math.PI * 2;                     // full turn in 60s
  const baseHue    = 155;
  const focused    = (_hoveredLayerKey === 'fullSet' || _pinnedLayerKey === 'fullSet');
  const focusMul   = focused ? 1.4 : 1.0;

  // 2s pulse — sin(πT) completes a full cycle every 2s
  const blinkRaw = 0.5 + 0.5 * Math.sin(T * Math.PI);
  const blink    = (0.30 + 0.70 * blinkRaw) * focusMul;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Base ring — thick teal circle
  for (let i = 0; i < segs; i++) {
    const a1 = (i / segs) * Math.PI * 2;
    const a2 = ((i + 1) / segs) * Math.PI * 2;
    const p3a = ringPt(a1, radius, 0, 0);
    const p3b = ringPt(a2, radius, 0, 0);
    const pa  = project3D(p3a.x, p3a.y, p3a.z);
    const pb  = project3D(p3b.x, p3b.y, p3b.z);
    const depth = (pa.depth + pb.depth) * 0.5;
    const hue   = chromaHue(baseHue, 0);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.strokeStyle = `hsla(${hue}, 85%, ${56 + depth * 24}%, ${(0.28 + depth * 0.40) * blink})`;
    ctx.lineWidth   = 2.4;
    ctx.stroke();
  }

  // Spikes + dots between them
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2 + slowRot;

    const inner3 = ringPt(a, radius, 0, 0);
    const outer3 = ringPt(a, radius + spikeLen, 0, 0);
    const pIn    = project3D(inner3.x, inner3.y, inner3.z);
    const pOut   = project3D(outer3.x, outer3.y, outer3.z);
    const depth  = (pIn.depth + pOut.depth) * 0.5;
    const hue    = chromaHue(baseHue, i * 0.35);

    const grad = ctx.createLinearGradient(pIn.x, pIn.y, pOut.x, pOut.y);
    grad.addColorStop(0, `hsla(${hue}, 92%, 78%, ${(0.60 + depth * 0.40) * blink})`);
    grad.addColorStop(1, 'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth   = 2.8 + depth * 1.4;                         // a touch thicker
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(pIn.x, pIn.y);
    ctx.lineTo(pOut.x, pOut.y);
    ctx.stroke();

    // Dot between the spikes
    const aMid = a + Math.PI / spikeCount;
    const dot3 = ringPt(aMid, radius, 0, 0);
    const pDot = project3D(dot3.x, dot3.y, dot3.z);
    const dr   = (2.6 + 0.8 * pDot.depth) * FF.sigilScale;        // a touch thicker
    const dHue = chromaHue(baseHue, i * 0.2);
    ctx.beginPath();
    ctx.arc(pDot.x, pDot.y, dr, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${dHue}, 95%, 82%, ${(0.60 + pDot.depth * 0.35) * blink})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── NAKAMOTO — gold bracelet (two gold frames + rhythmic gold dots + fast orb) ──
// Unique tilt/azimuth from the wallet seed. Rotates with the system.
function drawNakamotoBracelet(ctx) {
  if (!sigil.nakamoto) return;
  const segs      = perfMode ? 128 : 192;
  const radius    = FF.sigilR * 0.88;
  const braceletW = 9 * FF.sigilScale;
  const dotCount  = 36;
  const sizeCycle = [1.2, 2.4, 1.2, 3.4, 1.2, 2.4];
  const focused   = (_hoveredLayerKey === 'nakamoto' || _pinnedLayerKey === 'nakamoto');
  const focusMul  = focused ? 1.4 : 1.0;

  const seedIncl = (((organism.seed >>> 0) % 1000) / 1000 - 0.5) * Math.PI * 0.75;
  const seedAz   = (((organism.seed >>> 0) % 10000) / 10000) * Math.PI * 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Pre-compute the points for the base + two frame lines
  const basePts  = [];
  const innerPts = [];
  const outerPts = [];
  for (let i = 0; i <= segs; i++) {
    const a    = (i / segs) * Math.PI * 2;
    const base = ringPt(a, radius, seedIncl, seedAz);
    const rMag = Math.sqrt(base.x * base.x + base.z * base.z) || 1;
    const rx   = base.x / rMag, rz = base.z / rMag;
    basePts.push(project3D(base.x, base.y, base.z));
    innerPts.push(project3D(base.x - rx * braceletW, base.y, base.z - rz * braceletW));
    outerPts.push(project3D(base.x + rx * braceletW, base.y, base.z + rz * braceletW));
  }

  // Two gold frame lines (both pure gold)
  for (let side = 0; side < 2; side++) {
    const pts = side === 0 ? innerPts : outerPts;
    for (let i = 0; i < segs; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const depth = (p1.depth + p2.depth) * 0.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = `hsla(48, 100%, ${62 + depth * 22}%, ${(0.28 + depth * 0.45) * focusMul})`;
      ctx.lineWidth   = 0.9 + depth * 0.5;
      ctx.stroke();
    }
  }

  // Gold dots — on the center line, with a rhythmic size pattern
  for (let i = 0; i < dotCount; i++) {
    const segIdx = Math.floor((i / dotCount) * segs);
    const p      = basePts[segIdx];
    const sz     = sizeCycle[i % sizeCycle.length] * FF.sigilScale;
    const r      = sz * (0.55 + p.depth * 0.65);
    const alpha  = (0.55 + p.depth * 0.40) * focusMul;

    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
    g.addColorStop(0,   `hsla(52, 100%, 94%, ${alpha})`);
    g.addColorStop(0.3, `hsla(46, 100%, 72%, ${alpha * 0.50})`);
    g.addColorStop(1,   'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(54, 100%, 97%, ${Math.min(1, alpha + 0.15)})`;
    ctx.fill();
  }

  // ── Fast-spinning gold orbs — one per held Nakamoto, evenly spaced ──
  // Single holder → 1 ball. 2 holders → 2 balls 180° apart. N → evenly spaced.
  // All balls share the 3s lap cadence; their phases are offset around the bracelet.
  const ballCount = Math.max(1, Math.min(10, sigil.nakamotoCount || 1));
  const ballT     = (T / 3) % 1;
  for (let bi = 0; bi < ballCount; bi++) {
    const phase     = (ballT + bi / ballCount) % 1;
    const ballIdx   = Math.floor(phase * segs);
    const bp        = basePts[ballIdx];
    const br        = 6 * FF.sigilScale + bp.depth * 2.2;
    const ballAlpha = (0.85 + bp.depth * 0.15) * focusMul;

    // Outer glow
    const glow = ctx.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, br * 6);
    glow.addColorStop(0,    `hsla(54, 100%, 96%, ${ballAlpha})`);
    glow.addColorStop(0.22, `hsla(48, 100%, 74%, ${ballAlpha * 0.55})`);
    glow.addColorStop(0.55, `hsla(44, 100%, 55%, ${ballAlpha * 0.18})`);
    glow.addColorStop(1,    'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, br * 6, 0, Math.PI * 2);
    ctx.fill();

    // Warm-white core
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, br * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(56, 100%, 98%, ${Math.min(1, ballAlpha + 0.05)})`;
    ctx.fill();
  }

  ctx.restore();
}

// (Old emanation removed — Meme Artist is now the 7th orbital ring, rainbow)

// ── TDH Spectrum Waves — one wavy concentric band per 1M TDH ─────
// The interior of the solar core becomes a record of millions-of-days-held.
// Count = floor(tdh / 1_000_000), capped at 30 for visual density.
// Each wave: wavy ring (organic perturbation) + distinct hue across the spectrum.
// Sits between the solar flare zone and the innermost orbital (TDH ring at rf=0.18).
function drawSpectrumWaves(ctx) {
  const tdh = sigil.tdh || 0;
  const waveCount = Math.min(30, Math.floor(tdh / 1_000_000));
  if (waveCount <= 0) return;

  // Wave band: from just outside the solar core to just inside the TDH ring
  const innerR = 18 * FF.sigilScale;
  const outerR = FF.sigilR * 0.16;
  if (outerR <= innerR) return;
  const step   = (outerR - innerR) / Math.max(1, waveCount);

  const segs = perfMode ? 48 : 96;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let w = 0; w < waveCount; w++) {
    const rBase = innerR + step * (w + 0.5);
    // Each wave walks the full spectrum — waveCount 1 = single hue, many = full rainbow
    const hue = ((w / Math.max(1, waveCount)) * 360 + T * 12) % 360;
    const phase = w * 1.3 + T * 0.45;
    const noiseAmp = rBase * 0.10;  // organic perturbation amount

    // Build wavy path
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // 3-harmonic wave: gives an organic, asymmetric shape that slowly morphs
      const wave =
        Math.sin(a * 3 + phase)       * 0.55 +
        Math.sin(a * 5 + phase * 1.3) * 0.28 +
        Math.sin(a * 7 + phase * 0.7) * 0.17;
      const r = rBase + wave * noiseAmp;
      const p3 = ringPt(a, r, 0, 0);
      const p2 = project3D(p3.x, p3.y, p3.z);
      if (i === 0) ctx.moveTo(p2.x, p2.y);
      else         ctx.lineTo(p2.x, p2.y);
    }
    // Outer line — saturated, soft
    ctx.strokeStyle = `hsla(${hue}, 88%, 70%, 0.42)`;
    ctx.lineWidth   = 0.8 + FF.sigilScale * 0.35;
    ctx.stroke();

    // Inner crisp highlight for depth
    if (!perfMode) {
      ctx.strokeStyle = `hsla(${hue}, 100%, 88%, 0.22)`;
      ctx.lineWidth   = 0.4;
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── TDH Solar Core — compact ray burst (crystal burst) ────────────
// Reference: a small dense core + 4/6-arm crystal flare rays
function drawSolarCore(ctx, cx, cy) {
  const tdhN   = normalizeTDH(sigil.tdh);
  const breath = 1 + Math.sin(T * LOOP_BREATH) * 0.08 + Math.sin(T * LOOP_BREATH * 2.3) * 0.03;
  const r      = lerp(10, 22, tdhN) * breath * FF.sigilScale;  // compact
  const hue    = sigil.baseHue;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Flare rays — 6-arm crystal burst, extended by TDH + BOOST
  const rayN    = 6;
  const boostN  = FF.layerStrength ? (FF.layerStrength[1] || 0) : 0;
  const rayLen  = r * (4.5 + tdhN * 3.0 + boostN * 2.5);
  const rayRng  = sigilRng(sigilHash(organism.seed + 313));
  for (let i = 0; i < rayN; i++) {
    const phase  = rayRng() * Math.PI * 2;
    const baseA  = (i / rayN) * Math.PI * 2 + rayRng() * 0.2;
    const twinkle = 0.50 + Math.sin(T * LOOP_SPARKLE * 0.5 + phase) * 0.5;
    const len    = rayLen * (0.8 + twinkle * 0.4);
    const x2     = cx + Math.cos(baseA) * len;
    const y2     = cy + Math.sin(baseA) * len;

    const g = ctx.createLinearGradient(cx, cy, x2, y2);
    g.addColorStop(0,   `hsla(${hue}, 95%, 88%, ${(0.55 + twinkle * 0.35)})`);
    g.addColorStop(0.3, `hsla(${(hue + 20) % 360}, 100%, 72%, ${(0.22 + twinkle * 0.20)})`);
    g.addColorStop(1,   'transparent');
    ctx.strokeStyle = g;
    ctx.lineWidth   = 0.9 + rayRng() * 1.2;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Compact inner glow
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
  inner.addColorStop(0,    `hsla(${hue}, 90%, 96%, ${0.85})`);
  inner.addColorStop(0.25, `hsla(${hue}, 95%, 80%, ${0.55})`);
  inner.addColorStop(0.6,  `hsla(${hue}, 100%, 60%, ${0.18})`);
  inner.addColorStop(1,    'transparent');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Core — warm-white crystal dot
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(0, 0%, 100%, ${0.95})`;
  ctx.fill();

  ctx.restore();
}

// ── Overlay — clean cosmic: bloom + vignette ──
function drawOverlay() {
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx3.clearRect(0, 0, W, H);

  // Bloom — cosmic shimmer, grows with TDH. Draw with logical dims (preserves DPR).
  if (!perfMode) {
    const tdhN = normalizeTDH(sigil.tdh);
    ctx3.save();
    ctx3.globalCompositeOperation = 'screen';
    ctx3.globalAlpha = 0.22 + tdhN * 0.18;
    ctx3.filter = `blur(${Math.round(lerp(14, 36, tdhN))}px)`;
    ctx3.drawImage(c2, 0, 0, W, H);
    ctx3.restore();
    ctx3.filter = 'none';
  }

  // Vignette — let the sigil float in the void. For Tier 7+ (MONUMENT+), the edge is softer.
  // We use FF.sigilR so the vignette hugs the sigil on mobile too.
  const softEdge = (FF.tier || 1) >= 7;
  const vEdgeAlpha = softEdge ? 0.82 : 0.95;
  const vMidAlpha  = softEdge ? 0.42 : 0.55;
  const vr = FF.sigilR;
  const v = ctx3.createRadialGradient(
    FF.cx, FF.cy, vr * 0.60,
    FF.cx, FF.cy, vr * 1.35
  );
  v.addColorStop(0,    'rgba(0,0,0,0)');
  v.addColorStop(0.55, 'rgba(0,0,0,0.05)');
  v.addColorStop(0.85, `rgba(0,0,0,${vMidAlpha})`);
  v.addColorStop(1,    `rgba(0,0,0,${vEdgeAlpha})`);
  ctx3.fillStyle = v;
  ctx3.fillRect(0, 0, W, H);
}

// ══════════════════════════════════════════════════════════
//  RING HOVER / PIN — info shown when the cursor is over a ring
// ══════════════════════════════════════════════════════════
// Short info per layer: label + value function + short description
// Param info — for both orbital and rare forms (used by the hover card)
const PARAM_INFO = {
  tdh:      { name: 'TDH',         desc: 'total days held',     hue:  42, value: s => (s.tdh    || 0).toLocaleString() },
  boost:    { name: 'BOOST',       desc: 'TDH multiplier',      hue: 308, value: s => `×${(s.boost || 1).toFixed(2)}`  },
  unique:   { name: 'UNIQUE',      desc: 'unique memes',        hue: 190, value: s => `${s.unique || 0} / 484`         },
  nic:      { name: 'NIC',         desc: 'social index',        hue: 268, value: s => (s.nic    || 0).toLocaleString() },
  rep:      { name: 'REP',         desc: 'reputation',          hue: 110, value: s => (s.rep    || 0).toLocaleString() },
  level:    { name: 'LEVEL',       desc: 'collector level',     hue: 350, value: s => `${s.level || 0} / 100`          },
  artist:   { name: 'MEME ARTIST', desc: 'memes card creator',  rainbow: true,
              value: s => `${s.memeArtistCount} card${s.memeArtistCount > 1 ? 's' : ''}` },
  fullSet:  { name: 'FULL SET',    desc: 'complete collection', hue: 155, value: () => 'YES' },
  nakamoto: { name: 'NAKAMOTO',    desc: 'card #4 holder',      hue:  48, value: s => {
    const n = s.nakamotoCount || 0;
    return n > 0 ? `${n} card${n > 1 ? 's' : ''}` : 'YES';
  } },
};

// Hover/pin state — key based ('tdh', 'artist', 'fullSet', 'nakamoto', ...)
let _mouseX = -1, _mouseY = -1;
let _hoveredLayerKey = null;
let _pinnedLayerKey  = null;

// ── Zoom (view zoom, separate canvas transform) ──
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;
let viewZoom = 1.0;

function applyViewZoom() {
  const wrap = document.getElementById('canvasWrap');
  if (wrap) wrap.style.transform = `scale(${viewZoom})`;
  const thumb = document.querySelector('.zs-thumb');
  if (thumb) {
    const t = (viewZoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
    thumb.style.top = ((1 - t) * 100) + '%';
  }
}
function setViewZoom(z) {
  viewZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  applyViewZoom();
}
function resetViewZoom() { setViewZoom(1.0); }

// All hoverable "rings": orbital LAYERS + rare forms (when owned)
function getHoverableRings() {
  const rings = [];
  for (const layer of LAYERS) {
    if (layer.onlyIf && !sigil[layer.onlyIf]) continue;
    rings.push({ key: layer.key, radius: layer.rf * FF.sigilR, incl: layer.incl, az: layer.az });
  }
  if (sigil.fullSet) {
    rings.push({ key: 'fullSet', radius: FF.sigilR * 0.95, incl: 0, az: 0 });
  }
  if (sigil.nakamoto) {
    const ni = (((organism.seed >>> 0) % 1000) / 1000 - 0.5) * Math.PI * 0.75;
    const na = (((organism.seed >>> 0) % 10000) / 10000) * Math.PI * 2;
    rings.push({ key: 'nakamoto', radius: FF.sigilR * 0.88, incl: ni, az: na });
  }
  return rings;
}

// Hit-test — which ring is the cursor over? Returns { key }, or null.
// If viewZoom is active, client coordinates are remapped back to canvas coordinates.
function hitTestLayers(mx, my) {
  if (!FF || !sigil) return null;
  // Zoom compensation: if CSS scale(k) is centered, client(x,y) ↔ canvas(cx+(x-cx)/k, cy+(y-cy)/k)
  const zmx = FF.cx + (mx - FF.cx) / viewZoom;
  const zmy = FF.cy + (my - FF.cy) / viewZoom;
  const segs = 96;
  const threshold = 22 / viewZoom;   // don't let the hit area shrink when zoomed out
  const rings = getHoverableRings();
  let bestKey = null, bestDist = threshold;
  for (const r of rings) {
    for (let i = 0; i < segs; i++) {
      const a  = (i / segs) * Math.PI * 2;
      const p3 = ringPt(a, r.radius, r.incl, r.az);
      const p2 = project3D(p3.x, p3.y, p3.z);
      const dx = p2.x - zmx, dy = p2.y - zmy;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; bestKey = r.key; }
    }
  }
  return bestKey ? { key: bestKey } : null;
}

function updateHoverCardContent(key) {
  const card = document.getElementById('hoverCard');
  if (!card) return;
  if (!key || !sigil) {
    card.classList.remove('visible', 'pinned');
    return;
  }
  const info = PARAM_INFO[key];
  if (!info) return;
  const lbl = document.getElementById('hcLabel');
  const val = document.getElementById('hcValue');
  const dsc = document.getElementById('hcDesc');
  lbl.textContent = info.name;
  lbl.style.color = info.rainbow
    ? `hsl(${(T * 60) % 360}, 85%, 74%)`
    : `hsl(${info.hue}, 85%, 72%)`;
  val.textContent = info.value(sigil);
  dsc.textContent = info.desc;
  card.classList.add('visible');
  card.classList.toggle('pinned', key === _pinnedLayerKey);
}

function positionHoverCard(x, y) {
  const card = document.getElementById('hoverCard');
  if (!card) return;
  // Offset to the top-right of the cursor (+18, -12). If it overflows the screen, flip to the left.
  const rect = card.getBoundingClientRect();
  const w = rect.width || 160;
  const h = rect.height || 70;
  let tx = x + 18;
  let ty = y - 12 - h;
  if (tx + w > window.innerWidth - 8)  tx = x - 18 - w;
  if (ty < 8)                          ty = y + 18;
  card.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
}

function updateCursorForHit(onRing) {
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return;
  wrap.style.cursor = onRing ? 'pointer' : '';
}

// animate() hit-tests every frame (the rings rotate, so it can change even while the cursor is still)
function updateHoverFromFrame() {
  if (_mouseX < 0) return;
  if (_pinnedLayerKey) return;  // pin is active → don't change
  const hit    = hitTestLayers(_mouseX, _mouseY);
  const newKey = hit ? hit.key : null;
  if (newKey !== _hoveredLayerKey) {
    _hoveredLayerKey = newKey;
    updateHoverCardContent(newKey);
    updateCursorForHit(!!newKey);
  }
}

function clearHoverState() {
  _mouseX = _mouseY = -1;
  _hoveredLayerKey = null;
  _pinnedLayerKey  = null;
  const card = document.getElementById('hoverCard');
  if (card) card.classList.remove('visible', 'pinned');
  updateCursorForHit(false);
}

// Interaction on the canvas
(function initHoverInteraction() {
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return;

  wrap.addEventListener('mousemove', e => {
    _mouseX = e.clientX;
    _mouseY = e.clientY;
    positionHoverCard(e.clientX, e.clientY);
  });

  wrap.addEventListener('click', e => {
    const hit = hitTestLayers(e.clientX, e.clientY);
    if (!hit) {
      _pinnedLayerKey = null;
      updateHoverCardContent(_hoveredLayerKey);
      return;
    }
    // Click the same ring → unpin; a different one → new pin
    _pinnedLayerKey  = (_pinnedLayerKey === hit.key) ? null : hit.key;
    _hoveredLayerKey = hit.key;
    updateHoverCardContent(hit.key);
    positionHoverCard(e.clientX, e.clientY);
  });

  wrap.addEventListener('mouseleave', () => {
    _mouseX = _mouseY = -1;
    if (!_pinnedLayerKey) {
      _hoveredLayerKey = null;
      updateHoverCardContent(null);
      updateCursorForHit(false);
    }
  });
})();

// ── Zoom: mouse wheel (PC) + slider drag (mobile/PC) ──
(function initZoom() {
  // Wheel zoom — scroll over the canvas → zoom
  window.addEventListener('wheel', (e) => {
    if (!sigil) return;
    const t = e.target;
    if (t && t.closest && (t.closest('#exportBar') || t.closest('#topCtrls') || t.closest('#zoomSlider'))) {
      return;  // don't trigger zoom while over UI elements
    }
    e.preventDefault();
    setViewZoom(viewZoom + (-e.deltaY * 0.0008));
  }, { passive: false });

  // Slider drag
  const slider = document.getElementById('zoomSlider');
  const track  = slider && slider.querySelector('.zs-track');
  const thumb  = slider && slider.querySelector('.zs-thumb');
  const plus   = slider && slider.querySelector('.zs-plus');
  const minus  = slider && slider.querySelector('.zs-minus');
  if (!slider || !track || !thumb) return;

  let dragging = false;
  const setFromY = (clientY) => {
    const rect = track.getBoundingClientRect();
    const y    = clientY - rect.top;
    const t    = 1 - Math.max(0, Math.min(1, y / rect.height));
    setViewZoom(ZOOM_MIN + t * (ZOOM_MAX - ZOOM_MIN));
  };

  thumb.addEventListener('pointerdown', (e) => {
    dragging = true;
    thumb.classList.add('grabbing');
    try { thumb.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    setFromY(e.clientY);
  });
  const endDrag = () => { dragging = false; thumb.classList.remove('grabbing'); };
  thumb.addEventListener('pointerup',     endDrag);
  thumb.addEventListener('pointercancel', endDrag);
  thumb.addEventListener('lostpointercapture', endDrag);

  // Click the track → jump to that position
  track.addEventListener('pointerdown', (e) => {
    if (e.target !== track) return;
    setFromY(e.clientY);
  });

  // + / − buttons
  if (plus)  plus .addEventListener('click', () => setViewZoom(viewZoom + 0.15));
  if (minus) minus.addEventListener('click', () => setViewZoom(viewZoom - 0.15));
})();

// ══════════════════════════════════════════════════════════
//  6529 API — direct client fetch (CORS open) + build-time sigil index
// ══════════════════════════════════════════════════════════
const API_BASE = 'https://api.6529.io';
let _sigilIndex = null;
async function loadSigilIndex() {
  if (_sigilIndex) return _sigilIndex;
  try {
    const resp = await fetch('./sigil-index.json');
    if (!resp.ok) throw new Error(`sigil-index HTTP ${resp.status}`);
    _sigilIndex = await resp.json();
  } catch (err) {
    console.warn('[sigil-index] load failed:', err.message);
    _sigilIndex = { handles: {}, wallets: {} };
  }
  // Cache max card count across all artists — drives the bead cap dynamically.
  // Handles map covers every Memes artist regardless of kin pool size,
  // so this stays accurate even as the profiles pool changes.
  const counts = Object.values(_sigilIndex.handles || {});
  _sigilIndex._maxCount = counts.length ? Math.max(...counts) : 25;
  return _sigilIndex;
}

async function fetchSigilFromApi(addr) {
  const [tdhResp, profileResp] = await Promise.all([
    fetch(`${API_BASE}/api/tdh/consolidation/${encodeURIComponent(addr)}`),
    fetch(`${API_BASE}/api/profiles/${encodeURIComponent(addr)}`),
  ]);

  if (!tdhResp.ok) return { unborn: true };
  const tdhData = await tdhResp.json();
  const tdh    = tdhData.boosted_tdh || tdhData.tdh || 0;
  const unique = tdhData.unique_memes || 0;
  if (tdh === 0 && unique === 0) return { unborn: true };

  let level = 0, rep = 0, nic = 0, memeArtistCount = 0;
  let profileData = null;
  if (profileResp.ok) {
    profileData = await profileResp.json();
    level = profileData.level            || 0;
    rep   = profileData.rep              || 0;
    nic   = profileData.cic?.cic_rating  || 0;

    const idx = await loadSigilIndex();
    const handle = profileData.profile?.handle;
    if (handle) {
      memeArtistCount = idx.handles[String(handle).toLowerCase()] || 0;
    }

    if (memeArtistCount === 0) {
      const walletsToCheck = new Set();
      for (const w of (tdhData.wallets || [])) {
        if (typeof w === 'string') walletsToCheck.add(w.toLowerCase());
      }
      for (const w of (profileData.consolidation?.wallets || [])) {
        const a = w?.wallet?.address;
        if (a) walletsToCheck.add(a.toLowerCase());
      }
      if (profileData.profile?.primary_wallet) {
        walletsToCheck.add(profileData.profile.primary_wallet.toLowerCase());
      }
      if (/^0x[0-9a-f]{40}$/i.test(addr)) walletsToCheck.add(addr.toLowerCase());
      for (const w of walletsToCheck) {
        const c = idx.wallets[w] || 0;
        if (c > memeArtistCount) memeArtistCount = c;
      }
    }
  }

  const walletCount = Array.isArray(tdhData.wallets) ? tdhData.wallets.length : 1;
  return {
    address:         tdhData.consolidation_display || addr,
    tdh,
    boost:           tdhData.boost || 1.0,
    level,
    unique,
    fullSet:         (tdhData.memes_cards_sets || 0) >= 1,
    nakamoto:        (tdhData.nakamoto || 0) > 0,
    nakamotoCount:   tdhData.nakamoto || 0,
    nic,
    rep,
    memeArtist:      memeArtistCount > 0,
    memeArtistCount,
    walletCount:     Math.max(1, walletCount),
  };
}

// ══════════════════════════════════════════════════════════
//  MINI SIGIL — small, static, for kin cards
// ══════════════════════════════════════════════════════════
// Single frame, no animation. Only: aura + core + 3 rings + rare forms (when owned).
// Drawn into a 120-130px canvas on each kin card.
function drawMiniSigil(canvas, sigilLike, baseHue) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCss = canvas.clientWidth || 120;
  canvas.width  = Math.round(sizeCss * dpr);
  canvas.height = Math.round(sizeCss * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const W = sizeCss, H = sizeCss;
  const cx = W / 2, cy = H / 2;
  const R  = Math.min(W, H) * 0.42;

  const hue = (typeof baseHue === 'number') ? baseHue : 200;
  const tdhN = normalizeTDH(sigilLike.tdh || 0);
  const boostN = clamp((sigilLike.boost || 1 - 1.0) / 1.3, 0, 1);
  const uniN   = clamp((sigilLike.unique || 0) / 484, 0, 1);
  const repN   = normalizeRep(sigilLike.rep || 0);
  const nicN   = normalizeNic(sigilLike.nic || 0);
  const levelN = clamp((sigilLike.level || 0) / 100, 0, 1);

  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Soft aura
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
  aura.addColorStop(0,   `hsla(${hue}, 70%, 18%, 0.70)`);
  aura.addColorStop(0.6, `hsla(${hue}, 60%, 10%, 0.25)`);
  aura.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // 3 orbital ring (TDH amber, UNIQUE cyan, REP sage)
  const rings = [
    { hue:  42, rf: 0.30, strength: tdhN    },
    { hue: 190, rf: 0.52, strength: uniN    },
    { hue: 110, rf: 0.72, strength: repN    },
  ];
  for (const ring of rings) {
    const rad = R * ring.rf;
    const alpha = 0.20 + ring.strength * 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${ring.hue}, 85%, 72%, ${alpha})`;
    ctx.lineWidth = 1.0 + ring.strength * 1.2;
    ctx.stroke();
  }

  // Nakamoto — gold bracelet ring
  if (sigilLike.nakamoto) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(48, 100%, 72%, 0.80)`;
    ctx.lineWidth = 2.0;
    ctx.stroke();
  }
  // Full Set — thorny outer shell (simplified: just a ring)
  if (sigilLike.fullSet) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.96, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(155, 85%, 68%, 0.70)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Meme Artist — rainbow ring (conic)
  if (sigilLike.memeArtist) {
    const rad = R * 0.86;
    const segs = 36;
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const h  = (i / segs) * 360;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, a1, a2);
      ctx.strokeStyle = `hsla(${h}, 95%, 68%, 0.85)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Solar core — compact bright center
  const coreR = lerp(4, 9, tdhN);
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
  inner.addColorStop(0,   `hsla(${hue}, 95%, 94%, 0.95)`);
  inner.addColorStop(0.3, `hsla(${hue}, 90%, 72%, 0.55)`);
  inner.addColorStop(1,   'transparent');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.restore();
}

// ══════════════════════════════════════════════════════════
//  KIN — artists who share the same Sigil Name modifier/archetype
// ══════════════════════════════════════════════════════════
// ── SOCIAL KIN — who engages with you most on 6529 ──────────────
// Weighted across three signals, all INBOUND to the user:
//   • REP changes (RATING_EDIT on profile-logs) — weight 1.5
//   • Drop raters  (top_raters on drops you authored) — weight 1.5
//   • Drop reactions (emoji reactions on your drops)  — weight 1.0
// Then we pick the top-scoring actor whose profile is in our kin pool.
// Session-cached per user so repeat KIN opens are instant.
const _socialCache = {};
async function fetchTopSocialInteractor(userHandle) {
  if (!userHandle) return null;
  const selfKey = String(userHandle).toLowerCase();
  if (_socialCache[selfKey]) return _socialCache[selfKey];

  const scores    = {};     // handle → weighted score
  const breakdown = {};     // handle → { rep, rate, reaction } for inspection
  const bump = (h, weight, kind) => {
    if (!h) return;
    h = h.toLowerCase();
    if (h === selfKey) return;
    scores[h] = (scores[h] || 0) + weight;
    breakdown[h] = breakdown[h] || {};
    breakdown[h][kind] = (breakdown[h][kind] || 0) + 1;
  };

  // Signal A — REP givers (profile-logs; returns RATING_EDIT entries)
  try {
    for (let page = 1; page <= 2; page++) {
      const r = await fetch(`${API_BASE}/api/profile-logs?target=${encodeURIComponent(userHandle)}&page_size=100&page=${page}`);
      if (!r.ok) break;
      const j = await r.json();
      for (const l of (j.data || [])) {
        if (l.type !== 'RATING_EDIT') continue;
        bump(l.profile_handle, 1.5, 'rep');
      }
      if (!j.next) break;
    }
  } catch (err) {
    console.warn('[social-kin] profile-logs fetch failed:', err.message);
  }

  // Signals B + C — drop reactions + drop raters (user's authored drops)
  try {
    for (let page = 1; page <= 3; page++) {
      const url = `${API_BASE}/api/drops?author=${encodeURIComponent(userHandle)}&limit=50&page=${page}`;
      const r = await fetch(url);
      if (!r.ok) break;
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) break;
      for (const drop of arr) {
        // Reactions — [{reaction: ':eyes:', profiles: [{handle, ...}, ...]}, ...]
        for (const reactionGroup of (drop.reactions || [])) {
          for (const prof of (reactionGroup.profiles || [])) {
            bump(prof.handle, 1.0, 'reaction');
          }
        }
        // Top raters — [{handle, ...}] (drop-level rating/vote)
        for (const rater of (drop.top_raters || [])) {
          const h = rater.handle || rater.profile?.handle;
          bump(h, 1.5, 'rate');
        }
      }
      if (arr.length < 50) break;
    }
  } catch (err) {
    console.warn('[social-kin] drops fetch failed:', err.message);
  }

  // Pick the highest-scoring actor whose profile exists in our kin pool
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  let result = null;
  for (const [handle, score] of sorted) {
    const profile = _sigilIndex?.profiles?.[handle];
    if (profile) {
      result = { handle, profile, score, breakdown: breakdown[handle] };
      break;
    }
  }
  _socialCache[selfKey] = result;
  return result;
}

// Three-lens selection: each kin reveals a DIFFERENT relationship to the user.
//   Slot 1 — SOCIAL   : who interacts with you most on 6529 (profile-logs agg)
//   Slot 2 — MIRROR   : who you are right now (closest overall stat distance)
//   Slot 3 — HORIZON  : where you might go (same archetype, next tier up).
//                       [Placeholder — Step 2b will replace with SIGIL signature match.]
// The user themselves (if they are in the pool) is excluded.
async function findKin(userSigil, userHandle) {
  if (!_sigilIndex || !_sigilIndex.profiles) return [];
  const profiles = _sigilIndex.profiles;

  const userSigilName = generateSigilName(userSigil);
  const userMod  = pickSigilModifier(userSigil);
  const userArch = pickSigilArchetype(userSigil);
  const userTier = (typeof getSigilClass === 'function') ? (getSigilClass(userSigil.tdh).tier || 1) : 1;
  const exclude  = (userHandle || '').toLowerCase();

  // Weighted normalized distance across the main stat axes.
  // TDH weighted highest, then REP, then others. Nakamoto / Full Set / Artist
  // flag mismatch adds a small penalty so rare-trait peers stay close together.
  const userTdhN = normalizeTDH(userSigil.tdh || 0);
  const userRepN = normalizeRep(userSigil.rep || 0);
  const userNicN = normalizeNic(userSigil.nic || 0);
  const userLvlN = clamp((userSigil.level || 0) / 100, 0, 1);
  const userUniN = clamp((userSigil.unique || 0) / 484, 0, 1);

  const entries = Object.entries(profiles)
    .filter(([h]) => h !== exclude)
    .map(([h, p]) => {
      const s = p.stats || {};
      const tdhN = normalizeTDH(s.tdh || 0);
      const repN = normalizeRep(s.rep || 0);
      const nicN = normalizeNic(s.nic || 0);
      const lvlN = clamp((s.level || 0) / 100, 0, 1);
      const uniN = clamp((s.unique || 0) / 484, 0, 1);
      let dist =
        2.0 * Math.abs(tdhN - userTdhN) +
        1.5 * Math.abs(repN - userRepN) +
        1.0 * Math.abs(nicN - userNicN) +
        1.0 * Math.abs(lvlN - userLvlN) +
        1.0 * Math.abs(uniN - userUniN);
      // Rare-trait mismatch penalty — so a Nakamoto holder's MIRROR is another
      // Nakamoto holder, not a non-holder with similar TDH.
      if (!!userSigil.nakamoto   !== !!s.nakamoto)   dist += 0.6;
      if (!!userSigil.fullSet    !== !!s.fullSet)    dist += 0.4;
      if (!!userSigil.memeArtist !== !!s.memeArtist) dist += 0.4;
      return { handle: h, profile: p, dist, sameName: p.sigilName === userSigilName };
    });

  const kin = [];
  const used = new Set();
  const pickFirst = (arr, reason) => {
    for (const e of arr) {
      if (kin.length >= 3) return;
      if (used.has(e.handle)) continue;
      used.add(e.handle);
      kin.push({ handle: e.handle, profile: e.profile, reason });
      return;
    }
  };

  // Slot 1 — SOCIAL: top inbound interactor from profile-logs (async).
  //   This is the only async lens — it hits /api/profile-logs and aggregates.
  const social = await fetchTopSocialInteractor(userHandle);
  if (social && !used.has(social.handle)) {
    used.add(social.handle);
    kin.push({ handle: social.handle, profile: social.profile, reason: 'SOCIAL' });
  }

  // Slot 2 — MIRROR: closest overall stats (full name match first, else min distance).
  const mirrors = entries.filter(e => !used.has(e.handle) && e.sameName)
                         .sort((a, b) => a.dist - b.dist);
  if (mirrors.length) {
    pickFirst(mirrors, 'MIRROR');
  } else {
    pickFirst(entries.filter(e => !used.has(e.handle)).sort((a, b) => a.dist - b.dist), 'MIRROR');
  }

  // Slot 3 — HORIZON: same archetype, ideally next tier up.
  //   a) exact next tier
  //   b) any tier above user
  //   c) same archetype any tier (might be same tier)
  //   d) closest remaining (pure fallback)
  const nextTier = Math.min(9, userTier + 1);
  const horizonA = entries.filter(e => !used.has(e.handle) && e.profile.archetype === userArch && e.profile.tier === nextTier);
  const horizonB = entries.filter(e => !used.has(e.handle) && e.profile.archetype === userArch && e.profile.tier >  userTier);
  const horizonC = entries.filter(e => !used.has(e.handle) && e.profile.archetype === userArch);
  const horizonD = entries.filter(e => !used.has(e.handle));
  for (const bucket of [horizonA, horizonB, horizonC, horizonD]) {
    if (kin.length >= 3) break;
    const sorted = bucket.slice().sort((a, b) => {
      // For tier-ascending buckets, prefer lower tier first (closer future)
      const tierDiff = (a.profile.tier || 0) - (b.profile.tier || 0);
      return tierDiff !== 0 ? tierDiff : a.dist - b.dist;
    });
    pickFirst(sorted, 'HORIZON');
  }

  return kin;
}

// ══════════════════════════════════════════════════════════
//  LIVE DATA — auto-refresh every 10 min + manual retrigger
// ══════════════════════════════════════════════════════════
let _currentAddr      = null;
let _lastFetchedAt    = null;
let _refreshInterval  = null;
let _timestampInterval = null;
const REFRESH_MS = 10 * 60 * 1000;  // 10 minutes

function updateLiveTimestamp() {
  const el = document.getElementById('liveText');
  if (!el) return;
  if (!_lastFetchedAt) { el.textContent = 'LIVE'; return; }
  const mins = Math.floor((Date.now() - _lastFetchedAt) / 60000);
  if (mins < 1)  el.textContent = 'LIVE · just now';
  else if (mins < 60) el.textContent = `LIVE · ${mins}m ago`;
  else           el.textContent = `LIVE · ${Math.floor(mins/60)}h ago`;
}

async function refreshSigilData() {
  if (!sigil || !_currentAddr) return;
  const indicator = document.getElementById('liveIndicator');
  if (indicator) {
    indicator.classList.remove('stale');
    indicator.classList.add('refreshing');
  }
  try {
    const data = await fetchSigilFromApi(_currentAddr);
    if (data.unborn) throw new Error('became unborn');
    if (data.error)  throw new Error(data.error);

    // Update sigil fields (enrichSigil normalizes everything)
    const updated = enrichSigil({ ...data, address: sigil.address });
    Object.assign(sigil, updated);

    // Update layer strength + tier — animation doesn't pause, only values change
    if (FF && FF.layerStrength) {
      const tdhN    = normalizeTDH(sigil.tdh);
      const boostN  = clamp((sigil.boost - 1.0) / 1.3, 0, 1);
      const levelN  = clamp(sigil.level / 100, 0, 1);
      const uniN    = clamp(sigil.unique / 484, 0, 1);
      const nicN    = normalizeNic(sigil.nic);
      const repN    = normalizeRep(sigil.rep);
      const artistN = sigil.memeArtist ? 1 : 0;
      FF.layerStrength[0] = tdhN;
      FF.layerStrength[1] = boostN;
      FF.layerStrength[2] = uniN;
      FF.layerStrength[3] = nicN;
      FF.layerStrength[4] = repN;
      FF.layerStrength[5] = levelN;
      if (FF.layerStrength.length > 6) FF.layerStrength[6] = artistN;
      if (typeof getSigilClass === 'function') {
        FF.tier = getSigilClass(sigil.tdh).tier || 1;
      }
    }

    // Refresh HUD text
    if (typeof buildHUD === 'function') buildHUD();

    _lastFetchedAt = Date.now();
    if (indicator) indicator.classList.remove('refreshing');
    updateLiveTimestamp();
  } catch (err) {
    console.warn('[refresh] failed:', err.message);
    if (indicator) {
      indicator.classList.remove('refreshing');
      indicator.classList.add('stale');
    }
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!_currentAddr) return;
  _refreshInterval   = setInterval(refreshSigilData, REFRESH_MS);
  _timestampInterval = setInterval(updateLiveTimestamp, 60 * 1000);
}
function stopAutoRefresh() {
  if (_refreshInterval)   clearInterval(_refreshInterval);
  if (_timestampInterval) clearInterval(_timestampInterval);
  _refreshInterval = _timestampInterval = null;
}

// ══════════════════════════════════════════════════════════
//  KIN OVERLAY — button opens it, fills 3 kin cards, click → visit
// ══════════════════════════════════════════════════════════
let _lastKin = [];

async function openKin() {
  if (!sigil) return;
  const overlay = document.getElementById('kinOverlay');
  if (!overlay) return;

  // Load the data if it hasn't been loaded yet
  await loadSigilIndex();

  // Infer the current sigil's handle (from the address via ENS or the sigil-index)
  // sigil.address may be messy if the API returned "consolidation_display"; we can't
  // reliably get the profile handle, so we just normalize the address for self-exclusion.
  const userHandleCandidate = inferUserHandle(sigil);
  const kin = await findKin(sigil, userHandleCandidate);
  _lastKin = kin;

  // Center card — the user
  const userSigilName = generateSigilName(sigil);
  document.getElementById('kinCenterName').textContent = userSigilName || '—';
  const countLabel = kin.length === 0
    ? 'no kin yet in the archive'
    : `${kin.length} kindred sigil${kin.length > 1 ? 's' : ''}`;
  document.getElementById('kinCenterSub').textContent = countLabel;

  // Fill the kin cards
  const cards = overlay.querySelectorAll('.kin-card');
  cards.forEach((card, i) => {
    const k = kin[i];
    if (!k) {
      card.classList.remove('visible');
      return;
    }
    card.classList.add('visible');
    card.querySelector('.kin-bond').textContent   = k.reason;
    card.querySelector('.kin-name').textContent   = k.profile.sigilName;
    card.querySelector('.kin-handle').textContent = k.profile.handle;
    const addr = k.profile.primary_wallet || '';
    card.querySelector('.kin-addr').textContent = addr ? shortAddr(addr) : '';

    // Mini sigil render
    const canvas = card.querySelector('.kin-mini');
    const kinHue = sigilHue(k.profile.primary_wallet || k.profile.handle);
    drawMiniSigil(canvas, k.profile.stats || {}, kinHue);
  });

  // Draw SVG lines from the center to each card
  overlay.classList.add('visible');
  // Wait 1 frame to make sure the layout has settled
  requestAnimationFrame(() => drawKinLines(overlay));
}

function closeKin() {
  const overlay = document.getElementById('kinOverlay');
  if (overlay) overlay.classList.remove('visible');
}

async function visitKin(slotIdx) {
  const k = _lastKin[slotIdx];
  if (!k) return;
  closeKin();

  // Update the input and call readSigil — the user is visiting this kin
  const input = document.getElementById('walletInput');
  if (input) input.value = k.profile.handle;

  // The main app's readSigil pulls from the input, so just calling it is enough
  if (typeof readSigil === 'function') {
    // renderSigil is already active, so reset first or just do a fresh render
    // readSigil also works while the entry screen is hidden and fetches the wallet
    await readSigil();
  }
}

// SVG lines: center card → each visible kin card's center
function drawKinLines(overlay) {
  const svg = overlay.querySelector('.kin-lines');
  if (!svg) return;
  // Size the SVG to the viewport
  const rect = overlay.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  svg.innerHTML = '';

  const center = overlay.querySelector('.kin-center').getBoundingClientRect();
  const cx = center.left - rect.left + center.width / 2;
  const cy = center.top  - rect.top  + center.height / 2;

  const cards = overlay.querySelectorAll('.kin-card.visible');
  for (const card of cards) {
    const cr = card.getBoundingClientRect();
    const tx = cr.left - rect.left + cr.width / 2;
    const ty = cr.top  - rect.top  + cr.height / 2;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', cx);
    line.setAttribute('y1', cy);
    line.setAttribute('x2', tx);
    line.setAttribute('y2', ty);
    line.setAttribute('stroke', 'rgba(255,255,255,0.22)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3 6');
    svg.appendChild(line);
  }
}

// Try to infer the user's handle (for self-exclusion).
// sigil.address can sometimes come as "foo.eth - bar.eth - baz.eth";
// so we try to grab the ENS or input as a clean handle.
function inferUserHandle(s) {
  if (!s) return '';
  // First try currentAddr (what was typed into the input) — most reliable
  if (_currentAddr) return String(_currentAddr).toLowerCase().trim();
  // Fallback: take the first token from the address
  const addr = String(s.address || '').toLowerCase();
  const first = addr.split(/\s*[-,]\s*/)[0];
  return first.trim();
}

// Close on Esc + close on click outside
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ov = document.getElementById('kinOverlay');
    if (ov && ov.classList.contains('visible')) closeKin();
  }
});
document.addEventListener('click', (e) => {
  const ov = document.getElementById('kinOverlay');
  if (!ov || !ov.classList.contains('visible')) return;
  // Close if the overlay itself (the outer area) was clicked; skip inner elements
  if (e.target === ov) closeKin();
});

// ══════════════════════════════════════════════════════════
//  SHARE TO X — Twitter intent using the current sigil's shareable link
// ══════════════════════════════════════════════════════════
function shareSigilToX() {
  if (!sigil) return;
  // Use the current URL — _pushSigilUrl should have already written ?addr=...
  const url = window.location.href;
  const cls = (typeof getSigilClass === 'function' && sigil.tdh != null)
              ? getSigilClass(sigil.tdh).name
              : '';
  const text = cls ? `6529 sigil [${cls}] →` : `6529 sigil →`;
  const intent = 'https://twitter.com/intent/tweet'
    + '?text=' + encodeURIComponent(text)
    + '&url='  + encodeURIComponent(url);
  window.open(intent, '_blank', 'noopener,noreferrer');
}

// ══════════════════════════════════════════════════════════
//  EXPORT — GIF (540×540 / 12fps / 12s) + MP4 (720×720 / 15fps / 15s)
//  Both formats seamlessly loop with exactly one rotY turn.
//  Only the canvas is captured (HUD DOM overlay not included).
// ══════════════════════════════════════════════════════════

// Shared — capture start, save state + pause animation
function beginSigilCapture() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  return {
    T:         T,
    rotY:      FF.rotY,
    rotX:      FF.rotX,
    particles: particles.map(p => ({ ...p })),
  };
}

// Shared — restore state + resume animation
function endSigilCapture(state) {
  T         = state.T;
  FF.rotY   = state.rotY;
  FF.rotX   = state.rotX;
  particles = state.particles;
  lastTs    = 0;
  animate(performance.now());
}

// Shared — render a single frame offscreen (seamless tFrac 0→1)
function drawSigilCaptureFrame(tFrac, duration, savedRotY, offCtx, exportSize, sx, sy, cropSize) {
  T       = tFrac * duration;
  FF.rotY = savedRotY + tFrac * Math.PI * 2;   // exactly 1 turn → seamless loop
  FF.rotX = FF.axisTilt + Math.sin(T * 0.17) * 0.08 + Math.sin(T * 0.09) * 0.04;

  updateParticles();
  drawBackground();
  drawForm();
  drawOverlay();

  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, exportSize, exportSize);
  offCtx.drawImage(c1, sx, sy, cropSize, cropSize, 0, 0, exportSize, exportSize);
  offCtx.drawImage(c2, sx, sy, cropSize, cropSize, 0, 0, exportSize, exportSize);
  offCtx.drawImage(c3, sx, sy, cropSize, cropSize, 0, 0, exportSize, exportSize);
}

// Shared — trigger a file download
function downloadSigilBlob(blob, ext) {
  const url  = URL.createObjectURL(blob);
  const addr = (sigil.address || 'sigil').toString().replace(/[^a-z0-9]/gi, '_').slice(0, 20);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sigil-${addr}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Export bar toggle — the EXPORT button opens/closes the bottom bar ──
function toggleExportBar() {
  const bar = document.getElementById('exportBar');
  const btn = document.getElementById('exportBtn');
  if (!bar || !btn) return;
  if (btn.classList.contains('busy')) return;         // don't open while an export is running
  bar.classList.toggle('visible');
}

function closeExportBar() {
  const bar = document.getElementById('exportBar');
  if (bar) bar.classList.remove('visible');
}

// Close the bar on outside click
document.addEventListener('click', (e) => {
  const bar = document.getElementById('exportBar');
  const btn = document.getElementById('exportBtn');
  if (!bar || !bar.classList.contains('visible')) return;
  if (bar.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeExportBar();
});

// ── PNG EXPORT — single frame. c1 is now DPR-scaled with physical pixels. ──
async function exportSigilPng() {
  if (!sigil) return;
  closeExportBar();
  const btn = document.getElementById('exportBtn');
  if (btn && btn.classList.contains('busy')) return;

  const dpr  = window._dpr || 1;
  const Wlog = FF.logicalW || window.innerWidth;
  const Hlog = FF.logicalH || window.innerHeight;
  // Square crop region — sized to the logical min, with a small margin around the sigil
  const cropLogical = Math.min(Wlog, Hlog);
  const srcCropPhys = cropLogical * dpr;
  const EXPORT_SIZE = Math.min(Math.round(srcCropPhys), 1080);

  const off    = document.createElement('canvas');
  off.width    = EXPORT_SIZE;
  off.height   = EXPORT_SIZE;
  const offCtx = off.getContext('2d');

  const sx = FF.cx * dpr - srcCropPhys / 2;
  const sy = FF.cy * dpr - srcCropPhys / 2;

  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  offCtx.drawImage(c1, sx, sy, srcCropPhys, srcCropPhys, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
  offCtx.drawImage(c2, sx, sy, srcCropPhys, srcCropPhys, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
  offCtx.drawImage(c3, sx, sy, srcCropPhys, srcCropPhys, 0, 0, EXPORT_SIZE, EXPORT_SIZE);

  off.toBlob((blob) => {
    if (!blob) return;
    downloadSigilBlob(blob, 'png');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ DOWNLOADED';
      setTimeout(() => { btn.textContent = orig || '⬇ EXPORT'; }, 1200);
    }
  }, 'image/png');
}

// ── GIF EXPORT — 540×540 / 12fps / 12s / quality 10 (~8-10MB, <15MB guaranteed) ─
async function exportSigilGif() {
  if (!sigil) return;
  if (typeof GIF === 'undefined') { console.error('gif.js not loaded'); return; }
  closeExportBar();
  const btn = document.getElementById('exportBtn');
  if (!btn || btn.classList.contains('busy')) return;
  btn.classList.add('busy');

  const EXPORT_SIZE = 540;
  const FPS         = 12;
  const DURATION    = 12;
  const FRAME_COUNT = FPS * DURATION;  // 144 frames

  const state = beginSigilCapture();

  const off    = document.createElement('canvas');
  off.width    = EXPORT_SIZE;
  off.height   = EXPORT_SIZE;
  const offCtx = off.getContext('2d');

  const dpr = window._dpr || 1;
  const Wlog = FF.logicalW || window.innerWidth;
  const Hlog = FF.logicalH || window.innerHeight;
  const cropSize = Math.min(Wlog, Hlog) * dpr;
  const sx       = FF.cx * dpr - cropSize / 2;
  const sy       = FF.cy * dpr - cropSize / 2;

  const gif = new GIF({
    workers:      2,
    quality:      10,
    width:        EXPORT_SIZE,
    height:       EXPORT_SIZE,
    workerScript: 'vendor/gif.worker.js',
    background:   '#000000',
  });

  btn.textContent = '⬇ CAPTURING 0%';

  try {
    for (let i = 0; i < FRAME_COUNT; i++) {
      drawSigilCaptureFrame(i / FRAME_COUNT, DURATION, state.rotY, offCtx, EXPORT_SIZE, sx, sy, cropSize);
      gif.addFrame(offCtx, { delay: Math.round(1000 / FPS), copy: true });
      btn.textContent = `⬇ CAPTURING ${Math.round(((i + 1) / FRAME_COUNT) * 100)}%`;
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    endSigilCapture(state);  // capture done, resume normal animation

    btn.textContent = '⚙ ENCODING 0%';
    gif.on('progress',  p => { btn.textContent = `⚙ ENCODING ${Math.round(p * 100)}%`; });
    gif.on('finished',  blob => {
      downloadSigilBlob(blob, 'gif');
      btn.classList.remove('busy');
      btn.textContent = '⬇ EXPORT';
    });
    gif.render();
  } catch (err) {
    console.error('GIF export failed:', err);
    endSigilCapture(state);
    btn.classList.remove('busy');
    btn.textContent = '⬇ EXPORT';
  }
}

// ── MP4 EXPORT — full quality from the site (native pixels, 30fps, 8Mbps) ──
// MediaRecorder API. Falls back to WebM when MP4 isn't supported (Firefox is usually WebM).
async function exportSigilMp4() {
  if (!sigil) return;
  if (typeof MediaRecorder === 'undefined') {
    alert('Video recording is not supported in this browser.');
    return;
  }
  closeExportBar();
  const btn = document.getElementById('exportBtn');
  if (!btn || btn.classList.contains('busy')) return;

  // MIME type detection: prefer MP4, fall back to WebM
  const candidates = [
    { mime: 'video/mp4;codecs=avc1.42E01E',    ext: 'mp4'  },
    { mime: 'video/mp4',                        ext: 'mp4'  },
    { mime: 'video/webm;codecs=vp9',            ext: 'webm' },
    { mime: 'video/webm;codecs=vp8',            ext: 'webm' },
    { mime: 'video/webm',                       ext: 'webm' },
  ];
  const picked = candidates.find(c => MediaRecorder.isTypeSupported(c.mime));
  if (!picked) {
    alert('The browser does not support any video format.');
    return;
  }

  btn.classList.add('busy');

  // Native pixel quality — c1 is DPR-scaled, take the physical min side (max 1080, no upscale)
  const dprMp4 = window._dpr || 1;
  const Wlog2  = FF.logicalW || window.innerWidth;
  const Hlog2  = FF.logicalH || window.innerHeight;
  const physMin = Math.min(Wlog2, Hlog2) * dprMp4;
  const EXPORT_SIZE = Math.min(Math.round(physMin), 1080);
  const FPS         = 30;
  const DURATION    = 15;
  const FRAME_COUNT = FPS * DURATION;  // 450 frames

  const state = beginSigilCapture();

  const off    = document.createElement('canvas');
  off.width    = EXPORT_SIZE;
  off.height   = EXPORT_SIZE;
  const offCtx = off.getContext('2d');

  const cropSize = physMin;
  const sx       = FF.cx * dprMp4 - cropSize / 2;
  const sy       = FF.cy * dprMp4 - cropSize / 2;

  // Stream — captureStream(FPS), in sync with the MediaRecorder frame-rate
  const stream   = off.captureStream(FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType:            picked.mime,
    videoBitsPerSecond:  8_000_000,   // 8 Mbps — premium, preserves gradient detail
  });

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };

  const stoppedPromise = new Promise((resolve, reject) => {
    recorder.onstop  = () => resolve();
    recorder.onerror = e => reject(e);
  });

  btn.textContent = '⬇ RECORDING 0%';
  recorder.start();

  try {
    // Draw the first frame (activates the stream)
    drawSigilCaptureFrame(0, DURATION, state.rotY, offCtx, EXPORT_SIZE, sx, sy, cropSize);

    const frameInterval = 1000 / FPS;
    const startTime     = performance.now();

    for (let i = 1; i <= FRAME_COUNT; i++) {
      const target = startTime + i * frameInterval;
      const wait   = Math.max(1, target - performance.now());
      await new Promise(r => setTimeout(r, wait));
      drawSigilCaptureFrame(i / FRAME_COUNT, DURATION, state.rotY, offCtx, EXPORT_SIZE, sx, sy, cropSize);
      btn.textContent = `⬇ RECORDING ${Math.round((i / FRAME_COUNT) * 100)}%`;
    }

    recorder.stop();
    await stoppedPromise;

    endSigilCapture(state);

    const blob = new Blob(chunks, { type: picked.mime });
    downloadSigilBlob(blob, picked.ext);
    btn.classList.remove('busy');
    btn.textContent = '⬇ EXPORT';
  } catch (err) {
    console.error('MP4 export failed:', err);
    try { recorder.stop(); } catch {}
    endSigilCapture(state);
    btn.classList.remove('busy');
    btn.textContent = '⬇ EXPORT';
  }
}
