// SOUL ARCHIVE — Orbital Soul Renderer v3
// 8 ayrı orbital form · 1080×1080 soul area · Sürekli 3D rotasyon · Heartbeat yok

// ── Sabitler ──────────────────────────────────────────────
const SOUL_SIZE = 1080;
const SOUL_R    = SOUL_SIZE / 2; // 540 px — maksimum soul yarıçapı (TDH ile ölçeklenir)

// Harmonic loop — tüm animasyonlar 30s master periyodun musikal oranları
// Oranlar: 1 (rotY), 2 (chroma), 3 (dotOrbit), 4 (breath), 2.5 (pearl), 8 (sparkle)
const LOOP_MASTER   = 30.0;
const LOOP_ROT_Y    = (2 * Math.PI) / LOOP_MASTER;          // tam tur 30s
const LOOP_CHROMA   = (2 * Math.PI) / (LOOP_MASTER / 2);    // 15s hue shimmer
const LOOP_DOT      = (2 * Math.PI) / (LOOP_MASTER / 3);    // 10s halka dot
const LOOP_BREATH   = (2 * Math.PI) / (LOOP_MASTER / 4);    // 7.5s core/node breath
const LOOP_PEARL    = (2 * Math.PI) / (LOOP_MASTER / 2.5);  // 12s Nakamoto inci
const LOOP_SPARKLE  = (2 * Math.PI) / (LOOP_MASTER / 8);    // 3.75s sparkle
const CHROMA_AMP    = 14;  // ±14° hue shimmer

// Orbital katmanlar — skaler parametreler (6) + Meme Artist (rainbow, varsa).
// Nakamoto ve Full Set hâlâ kendi özel formlarıyla çizilir (sahipse).
const LAYERS = [
  { key:'tdh',    name:'TDH',         hue: 42,  rf:0.18, incl: 0.05, az:0.00 },
  { key:'boost',  name:'BOOST',       hue:308,  rf:0.30, incl: 0.62, az:0.80 },
  { key:'unique', name:'UNIQUE',      hue:190,  rf:0.42, incl:-0.44, az:1.57 },
  { key:'nic',    name:'NIC',         hue:268,  rf:0.54, incl: 0.85, az:2.36 },
  { key:'rep',    name:'REP',         hue:110,  rf:0.66, incl:-0.66, az:3.14 },
  { key:'level',  name:'LEVEL',       hue:350,  rf:0.78, incl: 0.30, az:0.40 },
  // Meme Artist — diğerleri gibi orbital ring ama rainbow; sadece sanatçıysa
  { key:'artist', name:'MEME ARTIST', hue:  0,  rf:0.86, incl: 0.20, az:2.10, rainbow: true, onlyIf: 'memeArtist' },
];

// ── Yardımcı ──────────────────────────────────────────────
function soulHash(value) {
  let h = 2166136261;
  const text = String(value || 'soul');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function soulRng(seed) {
  let s = seed >>> 0;
  return function rand() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cüzdan imzası — tam spektrumda (0-360°), irisli paletle uyumlu
function soulHue(address) {
  const raw = String(address || 'manual').toLowerCase();
  const hex = raw.match(/0x([0-9a-f]{6})/);
  return (hex ? parseInt(hex[1], 16) : soulHash(raw)) % 360;
}

// Chroma shimmer — baz hue loop içinde ±CHROMA_AMP derece yavaşça kayar.
// Her katmanın kendi fazı var → birlikte "nefes alan" irisli shift.
function chromaHue(base, phase) {
  return (base + Math.sin(T * LOOP_CHROMA + phase) * CHROMA_AMP + 360) % 360;
}

// (awakening kaldırıldı — ruh her zaman tam parlaklıkta)

function enrichSoul(data) {
  const next = Object.assign({
    address:         'manual',
    tdh:             0,
    boost:           1.0,
    level:           0,
    unique:          0,
    fullSet:         false,
    nakamoto:        false,
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
  next.nakamoto        = Boolean(next.nakamoto);
  next.nic             = Number(next.nic)             || 0;
  next.rep             = Number(next.rep)             || 0;
  next.memeArtistCount = Math.max(0, Number(next.memeArtistCount) || 0);
  next.memeArtist      = next.memeArtistCount > 0 || Boolean(next.memeArtist);
  next.walletCount     = Math.max(1, Number(next.walletCount) || 1);
  next.baseHue         = soulHue(next.address);
  return next;
}

// 3D → 2D projeksiyon (FF.rotX, FF.rotY kullanır)
function project3D(x3, y3, z3) {
  const ry = FF.rotY;
  const xa =  x3 * Math.cos(ry) + z3 * Math.sin(ry);
  const za = -x3 * Math.sin(ry) + z3 * Math.cos(ry);
  const rx = FF.rotX;
  const yb = y3 * Math.cos(rx) - za * Math.sin(rx);
  const zb = y3 * Math.sin(rx) + za * Math.cos(rx);
  const xb = xa;
  // Z-ekseni roll (seed-based) — eksen yönünü 3D'de tekil yapar
  const rz = FF.axisAz || 0;
  const xc = xb * Math.cos(rz) - yb * Math.sin(rz);
  const yc = xb * Math.sin(rz) + yb * Math.cos(rz);
  const f  = 1100;
  const s  = f / (f + zb);
  const depth = clamp((zb / SOUL_R + 1) * 0.5, 0, 1);
  return { x: FF.cx + xc * s, y: FF.cy + yc * s, depth, z: zb };
}

// Orbital halka üzerinde bir noktanın 3D koordinatı
// incl = X ekseni etrafında yatırma, az = Y ekseni etrafında döndürme
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
  if (soul) buildVisuals();
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
  renderSoul(data);
}

// ── Ana render ────────────────────────────────────────────
function renderSoul(data) {
  soul = enrichSoul(data);
  organism = {
    seed: soulHash(`${soul.address}:${soul.tdh}:${soul.unique}:${soul.boost}:${soul.rep}:${soul.nic}`),
    baseHue: soul.baseHue,
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
  clearHoverState();  // yeni ruh → hover/pin sıfırla
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
    liveEl.classList.toggle('visible', !!_currentAddr);  // demo modunda gizle
  }
  updateLiveTimestamp();
  startAutoRefresh();
}

// ── Soul Name generator — "modifier + archetype" şeklinde kişisel isim ──
// Deterministik: aynı cüzdan her zaman aynı ismi alır (seed-based pick).
// Kurala göre: Nakamoto/Artist/FullSet varsa öne çıkar, yoksa dominant parametre belirler.
function seededPick(arr, seed) {
  if (!arr || arr.length === 0) return '';
  return arr[(seed >>> 0) % arr.length];
}

function generateSoulName(s) {
  if (!s) return '';
  const addr    = s.address || 'manual';
  const seedM   = soulHash(addr + ':mod');
  const seedC   = soulHash(addr + ':core');

  // ── Modifier ──
  let modifier;
  const tier   = (typeof getSoulClass === 'function') ? (getSoulClass(s.tdh).tier || 1) : 1;
  const tdhN   = normalizeTDH(s.tdh || 0);
  const repN   = normalizeRep(s.rep || 0);
  const nicN   = normalizeNic(s.nic || 0);
  const boostN = clamp(((s.boost || 1) - 1.0) / 1.3, 0, 1);
  const levelN = clamp((s.level || 0) / 100, 0, 1);

  if (s.nakamoto)                            modifier = 'Golden';
  else if (s.fullSet)                        modifier = 'Blessed';
  else if (tier >= 8)                        modifier = seededPick(['Ancient', 'Deep', 'Resonant'], seedM);
  else if (tier >= 6)                        modifier = seededPick(['Deep', 'Weighty'], seedM);
  else if (tier >= 5)                        modifier = seededPick(['Steadfast', 'Rooted'], seedM);
  else if ((s.tdh || 0) === 0 && (s.unique || 0) === 0) modifier = 'Dormant';
  else if (tdhN < 0.30 && (repN > 0.45 || levelN > 0.45)) modifier = 'Rising';
  else if (repN > 0.65)                      modifier = 'Luminous';
  else if (boostN > 0.5)                     modifier = 'Amplified';
  else if (nicN < 0.10)                      modifier = 'Quiet';
  else                                       modifier = seededPick(['Steady', 'Modest'], seedM);

  // ── Core archetype ──
  let core;
  if (s.nakamoto && s.memeArtist)
    core = seededPick(['Cornerstone', 'Founding Voice'], seedC);
  else if (s.nakamoto)
    core = seededPick(['Bearer', "Founder's Heir", 'Keystone'], seedC);
  else if (s.memeArtist)
    core = seededPick(['Maker', 'Author', 'Scribe'], seedC);
  else if (s.fullSet)
    core = seededPick(['Completist', 'Conservator'], seedC);
  else {
    const uniN   = clamp((s.unique || 0) / 484, 0, 1);
    const dom = [
      ['tdh',    tdhN],
      ['unique', uniN],
      ['rep',    repN],
      ['nic',    nicN],
      ['level',  levelN],
    ].sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.08) {
      core = seededPick(['Drifter', 'Wanderer', 'Walker'], seedC);
    } else {
      const archetypes = {
        tdh:    ['Anchor', 'Steward', 'Pillar', 'Keeper'],
        unique: ['Curator', 'Collector', 'Archivist'],
        rep:    ['Herald', 'Witness', 'Signal'],
        nic:    ['Voice', 'Catalyst', 'Channel'],
        level:  ['Adept', 'Veteran', 'Elder'],
      };
      core = seededPick(archetypes[dom[0]] || ['Drifter'], seedC);
    }
  }

  return `${modifier} ${core}`;
}

// Her parametre için renk noktası — orbital ring veya rare form'unun kendi rengi.
const PARAM_DOT = {
  'TDH':         'hsl(42, 85%, 72%)',     // amber (solar core + TDH ring)
  'BOOST':       'hsl(308, 85%, 72%)',    // magenta
  'UNIQUE':      'hsl(190, 85%, 72%)',    // cyan
  'NIC':         'hsl(268, 85%, 72%)',    // lavender
  'REP':         'hsl(110, 70%, 68%)',    // sage
  'LEVEL':       'hsl(350, 85%, 72%)',    // coral
  'MEME ARTIST': 'rainbow',               // conic gradient
  'FULL SET':    'hsl(155, 85%, 70%)',    // teal — thorny shell rengi
  'NAKAMOTO':    'hsl(48, 100%, 72%)',    // altın — bracelet rengi
};
function paramDotHtml(k) {
  const c = PARAM_DOT[k];
  if (c === null || c === undefined) return '<span class="pdot-pad"></span>';
  if (c === 'rainbow') return '<span class="pdot rainbow-dot"></span>';
  return `<span class="pdot" style="background:${c}"></span>`;
}

function buildHUD() {
  const sc       = getSoulClass(soul.tdh);
  const soulName = generateSoulName(soul);
  document.getElementById('hudAddr').textContent     = shortAddr(soul.address);
  document.getElementById('hudClass').textContent    = sc.name;
  document.getElementById('hudClass').style.color    = `hsl(${soul.baseHue}, 82%, 74%)`;
  document.getElementById('hudSoulname').textContent = soulName;
  document.getElementById('hudSoulname').style.color = `hsla(${soul.baseHue}, 60%, 82%, 0.85)`;

  const artistN = soul.memeArtistCount || 0;
  const params = [
    ['TDH',         soul.tdh.toLocaleString()],
    ['BOOST',       `×${soul.boost.toFixed(2)}`],
    ['LEVEL',       soul.level],
    ['UNIQUE',      soul.unique],
    ['NIC',         soul.nic.toLocaleString()],
    ['REP',         soul.rep.toLocaleString()],
    ['FULL SET',    soul.fullSet  ? 'YES' : 'NO'],
    ['NAKAMOTO',    soul.nakamoto ? 'YES' : 'NO'],
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
    const n = soulHash(`${seed}:${a}:${b}`);
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

// Partikül — soulR içinde polar koordinat.
// isStar: true → tier-bonus partikülü (yıldız gibi parlar, canlı hue, halo'lu render).
function createParticle(rand, isStar) {
  const r   = Math.sqrt(rand()) * FF.soulR * 0.88;
  const a   = rand() * Math.PI * 2;
  const x   = FF.cx + Math.cos(a) * r;
  const y   = FF.cy + Math.sin(a) * r;
  const hueOffset = (rand() - 0.5) * FF.hueSpread;
  const baseHue   = isStar ? Math.floor(rand() * 360)       // yıldız → tam spektrum
                           : (FF.baseHue + hueOffset + 360) % 360;
  const baseSize  = lerp(FF.minSize, FF.maxSize, Math.pow(rand(), 1.6));

  return {
    x, y,
    vx: 0, vy: 0,
    age: 0,
    maxAge:     lerp(FF.minLife, FF.maxLife, rand()),
    hue:        baseHue,
    hueShift:   (rand() - 0.5) * (isStar ? 40 : 80),        // yıldız daha stabil
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
  if (!soul) return;

  // Logical viewport boyutları (c1.width artık physical, DPR kat sayısıyla çarpılı)
  const W    = window.innerWidth;
  const H    = window.innerHeight;
  const rand = soulRng(organism.seed);

  // Önceki rotasyon açısını koru (resize'da sıfırlanmasın)
  const prevRotY = (FF && FF.rotY) ? FF.rotY : 0;

  const tdhN   = normalizeTDH(soul.tdh);
  const boostN = clamp((soul.boost - 1.0) / 1.3, 0, 1);  // 1.00→0, 1.65→0.5, 2.30→1.0
  const levelN   = clamp(soul.level / 100, 0, 1);
  const uniN     = clamp(soul.unique / 484, 0, 1);
  const nicN     = normalizeNic(soul.nic);
  const repN     = normalizeRep(soul.rep);
  const fullSetN = soul.fullSet  ? 1.0 : 0.0;
  const nakamoN  = soul.nakamoto ? 1.0 : 0.0;

  // TDH sürücülü ölçek, viewport'a uyumlu (mobilde ruh kırpılmasın, nefes alsın)
  const rawSoulScale   = lerp(0.38, 0.90, tdhN);
  const rawSoulR       = SOUL_R * rawSoulScale;
  const viewportRadius = Math.min(W, H) * 0.42;  // %42 → her iki tarafta ~%8 margin
  const soulR          = Math.min(rawSoulR, viewportRadius);
  const soulScale      = soulR / SOUL_R;          // downstream için geri hesapla

  // Tier (1-9) — 9 TDH kademesi, görsel "unlock"ları tetikler
  const tier = (typeof getSoulClass === 'function')
    ? (getSoulClass(soul.tdh).tier || 1)
    : 1;

  // Cüzdan-imzalı eksen: eğim + azimut → 3D'de tekil yön (parmak izi)
  const axisTilt = (((organism.seed >>> 0) % 10000) / 10000 - 0.5) * 0.9;   // ±0.45 rad
  const axisAz   = (soulHash(organism.seed + 333) / 0xFFFFFFFF) * Math.PI * 2;  // 0 → 2π

  // Chroma shimmer fazları — seed'e bağlı, her ruhun kendi "hue dansı"
  const phaseRng    = soulRng(soulHash(organism.seed + 42));
  const layerPhases = LAYERS.map(() => phaseRng() * Math.PI * 2);

  // REP → manyetik alan kutupları (particles magnetic field'da akar)
  const poleCount = 1 + Math.floor(repN * 5);
  const poles = [];
  for (let i = 0; i < poleCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = (0.10 + rand() * 0.38) * soulR;
    poles.push({
      x:        W * 0.5 + Math.cos(a) * r,
      y:        H * 0.5 + Math.sin(a) * r,
      strength: lerp(0.08, 0.42, rand()),
      ccw:      rand() > 0.5,
    });
  }

  // Her orbital katmanın normalize gücü — LAYERS sırasıyla eşleşir
  const artistN = soul.memeArtist ? 1 : 0;
  const layerStrength = [
    tdhN,     // L0: TDH
    boostN,   // L1: Boost
    uniN,     // L2: Unique
    nicN,     // L3: NIC
    repN,     // L4: REP
    levelN,   // L5: Level
    artistN,  // L6: Meme Artist (rainbow, varsa)
  ];

  FF = {
    cx: W * 0.5, cy: H * 0.5,
    baseHue: soul.baseHue,

    // Form ölçeği + eksen (tilt + azimut = 3D'de tekil yön)
    soulScale, soulR, axisTilt, axisAz,

    // Chroma shimmer için katman fazları
    layerPhases,

    seed1: organism.seed,
    seed2: soulHash(organism.seed + 1),
    seed3: soulHash(organism.seed + 2),

    scale:         lerp(0.0022, 0.0060, 1 - tdhN),
    // Base partiküller kristal tozu gibi (baseHue tabanlı, küçük).
    // Tier bonus partikülleri yıldız modunda parlar (tam spektrum, halo'lu).
    baseParticleCount: Math.floor(lerp(180, perfMode ? 360 : 620, tdhN)),
    starParticleCount: Math.max(0, tier - 2) * 50,
    get particleCount() { return this.baseParticleCount + this.starParticleCount; },

    // Tier bilgisi — draw fonksiyonları unlock'lar için kullanır
    tier,

    oct2Scale: lerp(1.6, 4.8, nicN),
    oct2Amp:   lerp(0.35, 1.25, nicN),
    oct3Scale: lerp(2.8, 9.5, nicN),
    oct3Amp:   lerp(0.12, 0.82, nicN),

    poles,
    poleDecay: lerp(0.0018, 0.005, repN),

    hueSpread:     lerp(60, 220, uniN),           // Unique → irisli spektrum genişliği
    timeScale:     lerp(0.15, 0.045, boostN),     // Boost → akış hızı
    minSize:       lerp(0.6, 1.4, uniN),          // Partikül nokta çapı
    maxSize:       lerp(1.6, 3.2, uniN),
    minSpeed:      lerp(0.40, 0.9, tdhN),
    maxSpeed:      lerp(1.0,  2.8, tdhN),
    minLife:       lerp(140, 340, levelN),        // Level → ömür (netlik)
    maxLife:       lerp(320, 880, tdhN),

    nakamoto: soul.nakamoto,
    fullSet:  soul.fullSet,

    layerStrength,

    // 3D — rotY sürekli artar, rotX eksen eğimi + hafif nefes salınımı
    rotX: axisTilt,
    rotY: prevRotY,

  };

  // Sparkle sabit noktaları — kristal yıldız kesişimleri
  FF.sparkles = buildSparkles(organism.seed, repN, levelN, tier);

  // Particle canvas (dots — trail YOK, her frame clear). DPR-scaled buffer, logical çizim.
  const dpr          = Math.min(window.devicePixelRatio || 1, 2.5);
  trailCanvas        = document.createElement('canvas');
  trailCanvas.width  = Math.round(W * dpr);
  trailCanvas.height = Math.round(H * dpr);
  trailCtx           = trailCanvas.getContext('2d');
  trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  FF.logicalW        = W;
  FF.logicalH        = H;

  // Partikülleri oluştur, yaşları dağıt. İlk baseCount normal, kalanı yıldız.
  particles = [];
  const rand2 = soulRng(organism.seed);
  const baseN = FF.baseParticleCount;
  const total = FF.particleCount;
  for (let i = 0; i < total; i++) {
    const isStar = i >= baseN;
    const p = createParticle(rand2, isStar);
    p.age = Math.floor(rand2() * p.maxAge);
    particles.push(p);
  }
}


// ── Animasyon döngüsü ─────────────────────────────────────
function animate(ts) {
  const dt = lastTs ? Math.min((ts - lastTs) * 0.001, 0.05) : 0.016;
  lastTs = ts;
  T      = ts * 0.001;
  animId = requestAnimationFrame(animate);

  // Kendi ekseninde dönüş: Y = master 30s loop, X = eksen eğimi + küçük nefes
  FF.rotY += dt * LOOP_ROT_Y;
  FF.rotX  = FF.axisTilt + Math.sin(T * 0.17) * 0.08 + Math.sin(T * 0.09) * 0.04;

  updateParticles();
  drawBackground();
  drawForm();
  drawOverlay();

  // Halkalar döndüğü için her frame'de hover'ı taze tut (cursor sabitse bile)
  updateHoverFromFrame();
}

// ── Partikül güncelleme — nokta/yıldız (iz YOK, her frame clear) ──
function updateParticles() {
  if (!trailCtx) return;
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;

  // Her frame temizle — iz birikmesin
  trailCtx.clearRect(0, 0, W, H);
  trailCtx.globalCompositeOperation = 'lighter';

  for (const p of particles) {
    p.age++;

    if (p.age >= p.maxAge) {
      const wasStar = p.isStar;
      const r = soulRng(soulHash(organism.seed + p.age + Math.floor(T * 100)));
      Object.assign(p, createParticle(r, wasStar));
      continue;
    }

    const lifeFrac = p.age / p.maxAge;
    const fade     = Math.min(1, lifeFrac * 10) * Math.min(1, (1 - lifeFrac) * 10);
    if (fade < 0.02) continue;

    // Manyetik akış — REP pole'larıyla kavisli field lines
    const angle = flowAngle(p.x, p.y, T);
    p.vx = p.vx * 0.88 + Math.cos(angle) * p.speed * 0.12;
    p.vy = p.vy * 0.88 + Math.sin(angle) * p.speed * 0.12;

    // Soul sınırı
    const dxC = p.x - FF.cx, dyC = p.y - FF.cy;
    const distC = Math.sqrt(dxC * dxC + dyC * dyC);
    if (distC > FF.soulR * 0.92) {
      p.vx -= (dxC / distC) * 0.5;
      p.vy -= (dyC / distC) * 0.5;
    }

    p.x += p.vx;
    p.y += p.vy;

    // 3D projeksiyon — axisTilt rotX'in içinde zaten
    const dx = p.x - FF.cx, dy = p.y - FF.cy;
    const z_raw = dx * Math.sin(FF.rotY) - dy * Math.sin(FF.rotX) * Math.cos(FF.rotY);
    const ps    = 1 + z_raw * 0.00040;
    const sx    = (dx * Math.cos(FF.rotY) + dy * Math.sin(FF.rotX) * Math.sin(FF.rotY)) * ps;
    const sy    = dy * Math.cos(FF.rotX) * ps;
    // Z roll — eksen azimutu
    const rz = FF.axisAz || 0;
    const px = FF.cx + sx * Math.cos(rz) - sy * Math.sin(rz);
    const py = FF.cy + sx * Math.sin(rz) + sy * Math.cos(rz);

    const depth   = 0.5 + Math.sin(T * p.depthSpeed + p.depthPhase) * 0.5;
    const twinkle = 0.70 + Math.sin(T * LOOP_SPARKLE + p.twinkle) * 0.30;
    const hue     = (p.hue + p.hueShift * lifeFrac + 360) % 360;
    const alpha   = p.alpha * fade * twinkle * lerp(0.55, 1.0, depth);
    const rad     = p.size * lerp(0.55, 1.4, depth);

    if (p.isStar) {
      // Tier bonus partikülü — yıldız: halo + crisp sıcak beyaz çekirdek, tam doymuş
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
      // Normal partikül — tek arc
      trailCtx.fillStyle = `hsla(${hue}, 88%, ${lerp(72, 95, depth)}%, ${alpha})`;
      trailCtx.beginPath();
      trailCtx.arc(px, py, rad, 0, Math.PI * 2);
      trailCtx.fill();
    }
  }
}

// ── Arka plan ─────────────────────────────────────────────
function drawBackground() {
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx1.fillStyle = '#000';
  ctx1.fillRect(0, 0, W, H);

  // Çok hafif cüzdan-hue aurası — siyah boşluğu vurgulayan ışıltı
  const hue  = soul.baseHue;
  const aura = ctx1.createRadialGradient(FF.cx, FF.cy, 0, FF.cx, FF.cy, FF.soulR * 1.25);
  aura.addColorStop(0,   `hsla(${hue}, 70%, 11%, 0.35)`);
  aura.addColorStop(0.5, `hsla(${hue}, 60%, 6%, 0.12)`);
  aura.addColorStop(1,   'rgba(0,0,0,0)');
  ctx1.fillStyle = aura;
  ctx1.fillRect(0, 0, W, H);
}

// ── Orbital ring formları ─────────────────────────────────
function drawOrbitalForms(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const segs   = perfMode ? 72 : 144;

  const rainbowSpeed = 360 / 30;  // 30s'de tam tur (derece/sn)

  for (let li = 0; li < LAYERS.length; li++) {
    const layer = LAYERS[li];
    // Koşullu katman — sağlamıyorsa çizme (ör. artist)
    if (layer.onlyIf && !soul[layer.onlyIf]) continue;

    const strength = FF.layerStrength[li] || 0;
    // Hover/pin vurgusu — fokus halinde alpha/width çarpanları artar
    const focused  = (layer.key === _hoveredLayerKey || layer.key === _pinnedLayerKey);
    const focusMul = focused ? 1.55 : 1.0;
    const eff      = (0.12 + strength * 0.88) * focusMul;

    const radius = layer.rf * FF.soulR;
    const staticHue = chromaHue(layer.hue, FF.layerPhases[li] || 0);
    // Rainbow: hue segmente göre değişir + zamanla döner; aksi halde tek hue
    const hueAt = layer.rainbow
      ? (idx, total) => (((idx / total) * 360) + T * rainbowSpeed) % 360
      : () => staticHue;

    // LEVEL için progress arc — sadece level/100 oranı parlak, kalanı soluk
    const isLevel  = layer.key === 'level';
    const levelEnd = isLevel ? Math.min(1, (soul.level || 0) / 100) : 1;
    // Segment i için alpha çarpanı (0=sönük, 1=parlak)
    const levelAlphaAt = isLevel
      ? (i, total) => (i / total < levelEnd ? 1.0 : 0.15)
      : () => 1.0;

    // Ring noktaları
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const angle = (i / segs) * Math.PI * 2;
      const p3    = ringPt(angle, radius, layer.incl, layer.az);
      const p2    = project3D(p3.x, p3.y, p3.z);
      pts.push(p2);
    }

    // Pass 1 — geniş outer glow
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

    // Pass 2 — renkli gövde
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

    // Pass 3 — crystal edge: ön yarıda ince, yüksek-lümin kenar
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

    // BOOST companion — halkanın dışında paralel altın çizgi, boost ile belirir
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

    // Halka üzerinde kayan parlak düğümler
    const dir = li % 2 === 0 ? 1 : -1;
    const dotAngularPhase = T * LOOP_DOT * (0.65 + li * 0.08) * dir;

    if (layer.key === 'unique') {
      // ── 484-boncuklu kolye: her slot bir meme, sahip olunan N tanesi parlar ──
      const TOTAL_SLOTS = 484;
      const owned       = Math.min(soul.unique || 0, TOTAL_SLOTS);
      if (owned > 0) {
        // Bead boyutu: az unique → büyük (görünür), çok unique → küçük (çakışmasın)
        const densityT   = Math.min(1, owned / 200);
        const beadRadius = lerp(2.6, 0.9, densityT) * FF.soulScale;

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
      // Diğer halkalar — mevcut orbital dot davranışı
      const dotN = 4 + Math.floor(eff * 12);
      for (let i = 0; i < dotN; i++) {
        const ang   = (i / dotN) * Math.PI * 2 + dotAngularPhase;
        const p3    = ringPt(ang, radius, layer.incl, layer.az);
        const p2    = project3D(p3.x, p3.y, p3.z);
        const r     = (1.6 + eff * 3.2) * (0.40 + p2.depth * 0.80);
        const baseDA= (0.28 + eff * 0.55) * (0.30 + p2.depth * 0.70);
        // LEVEL'da dotlar sadece level/100 aralığında parlasın
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

// ── Katman birleştirme — Orrery form sıralaması ───────────
function drawForm() {
  if (!trailCanvas) return;
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx2.clearRect(0, 0, W, H);
  ctx2.globalCompositeOperation = 'source-over';

  // 1. Kristal partikül atmosferi — explicit logical dims ile çiz (DPR buffer)
  ctx2.drawImage(trailCanvas, 0, 0, W, H);

  // 2. Armiller iskelet (soluk küre çerçevesi)
  drawArmillaryFrame(ctx2);

  // 3. Merkezi güneş (TDH — kompakt kristal burst)
  drawSolarCore(ctx2, FF.cx, FF.cy);

  // 3b. Consolidation uydular (birleşik cüzdanlar = ay'lar)
  drawConsolidationMoons(ctx2);

  // 4. REP inbound rays — dışarıdan içeri akan sinyaller (halkaya varıyor)
  drawRepRays(ctx2);

  // 5. Orbital halkalar (6 skaler + artist rainbow halkası varsa)
  drawOrbitalForms(ctx2);

  // 5b. MEME ARTIST — ana halka üzerinde bilezik boncukları (count ≥ 2 ise)
  drawArtistBeads(ctx2);

  // 6. Kristal sparkle yıldızları (REP/Level yoğunluk)
  drawIntersectionSparkles(ctx2);

  // 6. FULL SET — dikenli dış çember (yoksa görünmez)
  drawFullSetThornyShell(ctx2);

  // 7. NAKAMOTO — altın bilezik + hızlı altın top (yoksa görünmez)
  drawNakamotoBracelet(ctx2);

  // 8. TIER UNLOCKS — tier'a özgü katmanlar (şartlı, fonksiyonlar kendini gater)
  drawPrestigeRing(ctx2);     // tier 5+ (ANCHOR)
  drawCosmicDust(ctx2);       // tier 8+ (LEGEND)
  drawPhenomenonAura(ctx2);   // tier 9   (PHENOMENON)
}

// ── Kristal sparkle sphere — kesişim yıldızları ──
// Küre üzerinde Fibonacci-dağılımlı sabit noktalar, her biri 4-kollu lens flare.
// REP yoğunluklarını, Level netliğini etkiler.
function buildSparkles(seed, repN, levelN, tier) {
  const rng       = soulRng(soulHash(seed + 777));
  const tierBonus = Math.max(0, (tier || 1) - 5) * 2;   // PILLAR+ için bonus
  const N         = 8 + Math.floor(repN * 10) + Math.floor(levelN * 5) + tierBonus;
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
  const radius = FF.soulR * 0.62;  // halkaların orta ağırlığında

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const sp of FF.sparkles) {
    const p = project3D(sp.x * radius, sp.y * radius, sp.z * radius);
    const twinkle = 0.30 + Math.sin(T * LOOP_SPARKLE + sp.phase) * 0.70;
    if (twinkle < 0.08) continue;

    const hue = chromaHue(sp.hue, sp.phase);
    const sz  = sp.size * (3.5 + p.depth * 3.5) * twinkle * FF.soulScale;

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

    // Renkli halo + beyaz çekirdek
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

// ── Armiller iskelet — ekvator + polar meridyen, soluk küre hissi ──
// Tier 4+ (RESONANCE) için ikinci bir çerçeve çifti eklenir → daha dolu küre
function drawArmillaryFrame(ctx) {
  const segs   = perfMode ? 64 : 128;
  const radius = FF.soulR * 0.96;
  const frames = [
    { incl: 0,              az: 0 },
    { incl: Math.PI * 0.5,  az: Math.PI * 0.5 },
  ];
  if ((FF.tier || 1) >= 4) {
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

// ── MEME ARTIST — iridescent spektrum boncukları (her ekstra kart için bir inci) ──
// Ana artist halkası LAYERS'ta rf 0.86'da. Count ≥ 2 ise ana halka üzerine
// (count − 1) inci yerleşir ve ring ile birlikte döner.
// Her inci = 3-hue'lu pearl gradient (spektrum sheen) + off-center highlight.
// Cap: artist-index'teki maksimum kart sayısı (bugün 6529er=25; rebuild ile dinamik).
function drawArtistBeads(ctx) {
  const count = soul.memeArtistCount || 0;
  if (!soul.memeArtist || count < 2) return;

  // Dinamik cap: koleksiyondaki en verimli sanatçıyı tavan say
  const collectionMax = (_artistIndex && _artistIndex._maxCount) || 25;
  const beadN = Math.min(collectionMax - 1, count - 1);

  // Ana artist halkasının parametreleri (LAYERS son girdisi)
  const artistLayer = LAYERS[LAYERS.length - 1];
  const radius = artistLayer.rf * FF.soulR;
  const incl   = artistLayer.incl;
  const az     = artistLayer.az;

  const beadR        = 10 * FF.soulScale + 3;      // daha belirgin (önce 7*s+2)
  const rainbowSpeed = 360 / 30;                   // ana halka ile aynı ritim
  const orbitPhase   = T * LOOP_DOT * 0.65;        // diğer ring dot'larıyla aynı hız

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < beadN; i++) {
    const ang = (i / beadN) * Math.PI * 2 + orbitPhase;
    const p3  = ringPt(ang, radius, incl, az);
    const p2  = project3D(p3.x, p3.y, p3.z);
    const depth = p2.depth;
    const r     = beadR * (0.60 + depth * 0.60);

    // Spektrum pozisyonu — her inci farklı renk ailesinde (rainbow ring ile senkron)
    const baseHue = (((i / beadN) * 360) + T * rainbowSpeed) % 360;
    const h1 = (baseHue - 48 + 360) % 360;   // sol-komşu hue
    const h2 = baseHue;                       // ana hue
    const h3 = (baseHue + 48) % 360;          // sağ-komşu hue

    // 1) Dış rainbow glow — belirgin, yayılan
    const outer = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, r * 3.2);
    outer.addColorStop(0,    `hsla(${h2}, 100%, 88%, ${0.50 + depth * 0.30})`);
    outer.addColorStop(0.45, `hsla(${h2}, 100%, 68%, ${0.22 + depth * 0.18})`);
    outer.addColorStop(1,    'transparent');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 2) İnci gövdesi — off-center highlight + 3-hue iridescent geçiş (prizma sheen)
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

    // 3) Crisp outline (tanımı belirginleştirir)
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${h2}, 100%, ${85 + depth * 10}%, ${0.45 + depth * 0.30})`;
    ctx.lineWidth   = 1.0 + depth * 0.6;
    ctx.stroke();

    // 4) Parlak highlight noktası — inci shimmer'ı
    ctx.beginPath();
    ctx.arc(p2.x + offX * 0.7, p2.y + offY * 0.7, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(0, 0%, 100%, ${0.80 + depth * 0.20})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── TIER UNLOCKS — tier'a özgü imza efektleri ────────────────────

// Tier 5+ (ANCHOR): Soluk beyaz prestij halkası — orbital grubun hemen dışında
function drawPrestigeRing(ctx) {
  if (!FF || (FF.tier || 1) < 5) return;
  const radius = FF.soulR * 0.83;
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

// Tier 8+ (LEGEND): Ruhun dış sınırında yavaş sürüklenen nadir kozmik toz
function drawCosmicDust(ctx) {
  if (!FF || (FF.tier || 1) < 8) return;
  const count = 42;
  const rng   = soulRng(soulHash(organism.seed + 853));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const r          = FF.soulR * (0.92 + rng() * 0.22);
    const baseA      = rng() * Math.PI * 2;
    const driftSpeed = lerp(0.006, 0.022, rng());
    const a          = baseA + T * driftSpeed;
    const x          = Math.cos(a) * r;
    const z          = Math.sin(a) * r;
    const y          = (rng() - 0.5) * 48 * FF.soulScale;
    const p          = project3D(x, y, z);
    const size       = (0.7 + rng() * 0.9) * FF.soulScale;
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

// Tier 9 (PHENOMENON): 10s'de bir ~1.5s süren nadir altın corona flaşı
function drawPhenomenonAura(ctx) {
  if (!FF || (FF.tier || 1) < 9) return;
  const period = 10;
  const t      = T % period;
  if (t > 1.5) return;
  const progress  = t / 1.5;
  const intensity = Math.sin(progress * Math.PI);
  if (intensity < 0.05) return;

  const inner = FF.soulR * 0.98;
  const outer = FF.soulR * 1.20;

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

// ── CONSOLIDATION — birleşik cüzdanlar güneşin etrafında ay'lar olarak ──
// walletCount > 1 ise N-1 belirgin satellite, TDH güneşinin flare alanı DIŞINDA.
function drawConsolidationMoons(ctx) {
  const count = Math.max(1, soul.walletCount || 1);
  if (count <= 1) return;
  const moonN = count - 1;

  // Orbit radius güneş flare'inin bitiş bölgesinin ötesinde olmalı
  // Flare max ≈ coreR × (4.5 + tdhN*3 + boostN*2.5) → çok uzak
  // Moons için: TDH halkasının iç çeperine yakın ama ondan içeride
  const tdhRingR  = LAYERS[0].rf * FF.soulR;        // ≈ 0.18 × soulR
  const orbitR    = tdhRingR * 0.65;                // TDH halkasının %65'i — flare'dan kurtulur
  const moonR     = 6 * FF.soulScale + 3;           // belirgin boyut
  const hue       = soul.baseHue;
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

    // Dış halo — geniş ve parlak
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, moonR * 5);
    glow.addColorStop(0,    `hsla(${hue}, 95%, 92%, ${0.75 + d * 0.25})`);
    glow.addColorStop(0.3,  `hsla(${hue}, 100%, 76%, ${0.40 + d * 0.25})`);
    glow.addColorStop(0.7,  `hsla(${hue}, 100%, 55%, ${0.12 + d * 0.10})`);
    glow.addColorStop(1,    'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, moonR * 5, 0, Math.PI * 2);
    ctx.fill();

    // Sıcak çekirdek
    ctx.beginPath();
    ctx.arc(p.x, p.y, moonR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(0, 0%, 100%, ${0.90 + d * 0.10})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── REP — Inbound Rays (dışarıdan REP halkasına akan sinyaller) ──
// Başkalarından sana gelen sosyal sermaye; ray sayısı sqrt(rep/4M) ile ölçeklenir.
// Her ray üzerinde içeri doğru kayan parlak bir sinyal noktası var.
function drawRepRays(ctx) {
  const rep = soul.rep || 0;
  if (rep <= 0) return;

  const repScale  = Math.min(1, Math.sqrt(rep / 4_000_000));
  const rayCount  = 4 + Math.floor(repScale * 46);   // 4–50 ray
  const outerR    = FF.soulR * 0.97;
  const innerR    = FF.soulR * 0.66;                 // REP halkasının radyusu
  const baseHue   = 110;                             // sage
  const travelSec = 4.0;                             // 4s'de sinyal içeri varır
  const focused   = (_hoveredLayerKey === 'rep' || _pinnedLayerKey === 'rep');
  const focusMul  = focused ? 1.5 : 1.0;

  // Ray yönlerini Fibonacci sphere ile seed-jittered üret (her cüzdana özgü yıldız deseni)
  const rng = soulRng(soulHash(organism.seed + 607));
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

    // Ray çizgisi — dışta silik, iç uca doğru parlaklık artar (sinyal güçleniyor)
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

    // İçeri kayan sinyal noktası (0 = outer, 1 = REP halkasına varış)
    const travelT = ((T + ray.phase * travelSec / (Math.PI * 2)) % travelSec) / travelSec;
    const sx = ox + (ix - ox) * travelT;
    const sy = oy + (iy - oy) * travelT;
    const sz = oz + (iz - oz) * travelT;
    const pp = project3D(sx, sy, sz);
    const r  = (0.8 + travelT * 1.6) * FF.soulScale;
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

// ── FULL SET — dikenli dış çember, teal (yoksa görünmez) ──
// Kalın dikenler + aralarda noktalar. 60s'de yavaş dönüş, 2s'de bir nabız (blink).
function drawFullSetThornyShell(ctx) {
  if (!soul.fullSet) return;
  const radius     = FF.soulR * 0.95;
  const spikeCount = 24;
  const spikeLen   = 32 * FF.soulScale;                          // bir tık daha kalın
  const segs       = perfMode ? 64 : 128;
  const slowRot    = (T / 60) * Math.PI * 2;                     // 60s tam tur
  const baseHue    = 155;
  const focused    = (_hoveredLayerKey === 'fullSet' || _pinnedLayerKey === 'fullSet');
  const focusMul   = focused ? 1.4 : 1.0;

  // 2s periyotlu nabız — sin(πT) 2s'de tam cycle
  const blinkRaw = 0.5 + 0.5 * Math.sin(T * Math.PI);
  const blink    = (0.30 + 0.70 * blinkRaw) * focusMul;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Base ring — kalın teal çember
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

  // Dikenler + aralardaki noktalar
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
    ctx.lineWidth   = 2.8 + depth * 1.4;                         // bir tık daha kalın
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(pIn.x, pIn.y);
    ctx.lineTo(pOut.x, pOut.y);
    ctx.stroke();

    // Diken arasındaki nokta
    const aMid = a + Math.PI / spikeCount;
    const dot3 = ringPt(aMid, radius, 0, 0);
    const pDot = project3D(dot3.x, dot3.y, dot3.z);
    const dr   = (2.6 + 0.8 * pDot.depth) * FF.soulScale;        // bir tık daha kalın
    const dHue = chromaHue(baseHue, i * 0.2);
    ctx.beginPath();
    ctx.arc(pDot.x, pDot.y, dr, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${dHue}, 95%, 82%, ${(0.60 + pDot.depth * 0.35) * blink})`;
    ctx.fill();
  }

  ctx.restore();
}

// ── NAKAMOTO — altın bilezik (iki altın çerçeve + ritimli altın noktalar + hızlı top) ──
// Cüzdan seed'iyle unique eğim/azimut. Sistemle birlikte döner.
function drawNakamotoBracelet(ctx) {
  if (!soul.nakamoto) return;
  const segs      = perfMode ? 128 : 192;
  const radius    = FF.soulR * 0.88;
  const braceletW = 9 * FF.soulScale;
  const dotCount  = 36;
  const sizeCycle = [1.2, 2.4, 1.2, 3.4, 1.2, 2.4];
  const focused   = (_hoveredLayerKey === 'nakamoto' || _pinnedLayerKey === 'nakamoto');
  const focusMul  = focused ? 1.4 : 1.0;

  const seedIncl = (((organism.seed >>> 0) % 1000) / 1000 - 0.5) * Math.PI * 0.75;
  const seedAz   = (((organism.seed >>> 0) % 10000) / 10000) * Math.PI * 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Baz + iki çerçeve çizgisinin noktalarını ön hesapla
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

  // İki altın çerçeve çizgisi (her ikisi de saf altın)
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

  // Altın noktalar — merkez çizgide, ritimli boyut örüntüsü
  for (let i = 0; i < dotCount; i++) {
    const segIdx = Math.floor((i / dotCount) * segs);
    const p      = basePts[segIdx];
    const sz     = sizeCycle[i % sizeCycle.length] * FF.soulScale;
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

  // ── Hızlı dönen altın top — bilezik boyunca 3s'de tam tur ──
  const ballT     = (T / 3) % 1;
  const ballIdx   = Math.floor(ballT * segs);
  const bp        = basePts[ballIdx];
  const br        = 6 * FF.soulScale + bp.depth * 2.2;
  const ballAlpha = (0.85 + bp.depth * 0.15) * focusMul;

  // Dış glow
  const glow = ctx.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, br * 6);
  glow.addColorStop(0,    `hsla(54, 100%, 96%, ${ballAlpha})`);
  glow.addColorStop(0.22, `hsla(48, 100%, 74%, ${ballAlpha * 0.55})`);
  glow.addColorStop(0.55, `hsla(44, 100%, 55%, ${ballAlpha * 0.18})`);
  glow.addColorStop(1,    'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, br * 6, 0, Math.PI * 2);
  ctx.fill();

  // Sıcak beyaz çekirdek
  ctx.beginPath();
  ctx.arc(bp.x, bp.y, br * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(56, 100%, 98%, ${Math.min(1, ballAlpha + 0.05)})`;
  ctx.fill();

  ctx.restore();
}

// (Eski emanation kaldırıldı — Meme Artist artık 7. orbital ring, rainbow)

// ── TDH Solar Core — kompakt ışın patlaması (kristal burst) ───────
// Referans: küçük yoğun çekirdek + 4/6 kollu crystal flare rays
function drawSolarCore(ctx, cx, cy) {
  const tdhN   = normalizeTDH(soul.tdh);
  const breath = 1 + Math.sin(T * LOOP_BREATH) * 0.08 + Math.sin(T * LOOP_BREATH * 2.3) * 0.03;
  const r      = lerp(10, 22, tdhN) * breath * FF.soulScale;  // kompakt
  const hue    = soul.baseHue;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Flare ışınları — 6 kollu crystal burst, TDH + BOOST ile uzar
  const rayN    = 6;
  const boostN  = FF.layerStrength ? (FF.layerStrength[1] || 0) : 0;
  const rayLen  = r * (4.5 + tdhN * 3.0 + boostN * 2.5);
  const rayRng  = soulRng(soulHash(organism.seed + 313));
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

  // Kompakt iç glow
  const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
  inner.addColorStop(0,    `hsla(${hue}, 90%, 96%, ${0.85})`);
  inner.addColorStop(0.25, `hsla(${hue}, 95%, 80%, ${0.55})`);
  inner.addColorStop(0.6,  `hsla(${hue}, 100%, 60%, ${0.18})`);
  inner.addColorStop(1,    'transparent');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Çekirdek — beyaz-sıcak kristal nokta
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(0, 0%, 100%, ${0.95})`;
  ctx.fill();

  ctx.restore();
}

// ── Overlay — temiz kozmik: bloom + vignette ──
function drawOverlay() {
  const W = FF.logicalW || window.innerWidth;
  const H = FF.logicalH || window.innerHeight;
  ctx3.clearRect(0, 0, W, H);

  // Bloom — kozmik parıltı, TDH'yle artar. Logical dims ile çiz (DPR korunur).
  if (!perfMode) {
    const tdhN = normalizeTDH(soul.tdh);
    ctx3.save();
    ctx3.globalCompositeOperation = 'screen';
    ctx3.globalAlpha = 0.22 + tdhN * 0.18;
    ctx3.filter = `blur(${Math.round(lerp(14, 36, tdhN))}px)`;
    ctx3.drawImage(c2, 0, 0, W, H);
    ctx3.restore();
    ctx3.filter = 'none';
  }

  // Vignette — ruh boşlukta yüzsün. Tier 7+ (MONUMENT+) için kenar daha yumuşak.
  // FF.soulR kullanıyoruz ki vignette mobilde de soul etrafını sıkıca çevrelesin.
  const softEdge = (FF.tier || 1) >= 7;
  const vEdgeAlpha = softEdge ? 0.82 : 0.95;
  const vMidAlpha  = softEdge ? 0.42 : 0.55;
  const vr = FF.soulR;
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
//  RING HOVER / PIN — cursor halkaların üstüne geldiğinde bilgi
// ══════════════════════════════════════════════════════════
// Her katman için kısa bilgi: etiket + değer fonksiyonu + yüzeysel açıklama
// Param bilgileri — hem orbital hem rare formlar (hover card için)
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
  nakamoto: { name: 'NAKAMOTO',    desc: 'card #4 holder',      hue:  48, value: () => 'YES' },
};

// Hover/pin state — key based ('tdh', 'artist', 'fullSet', 'nakamoto', ...)
let _mouseX = -1, _mouseY = -1;
let _hoveredLayerKey = null;
let _pinnedLayerKey  = null;

// ── Zoom (view zoom, ayrı canvas transform) ──
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

// Hover'lanabilir tüm "ring"ler: orbital LAYERS + rare formlar (sahipse)
function getHoverableRings() {
  const rings = [];
  for (const layer of LAYERS) {
    if (layer.onlyIf && !soul[layer.onlyIf]) continue;
    rings.push({ key: layer.key, radius: layer.rf * FF.soulR, incl: layer.incl, az: layer.az });
  }
  if (soul.fullSet) {
    rings.push({ key: 'fullSet', radius: FF.soulR * 0.95, incl: 0, az: 0 });
  }
  if (soul.nakamoto) {
    const ni = (((organism.seed >>> 0) % 1000) / 1000 - 0.5) * Math.PI * 0.75;
    const na = (((organism.seed >>> 0) % 10000) / 10000) * Math.PI * 2;
    rings.push({ key: 'nakamoto', radius: FF.soulR * 0.88, incl: ni, az: na });
  }
  return rings;
}

// Hit-test — cursor hangi ring'in üstünde? { key } döndürür, yoksa null
// viewZoom aktifse client koordinatları canvas iç koordinatlarına geri maplanır.
function hitTestLayers(mx, my) {
  if (!FF || !soul) return null;
  // Zoom compensation: CSS scale(k) ortasından ise, client(x,y) ↔ canvas(cx+(x-cx)/k, cy+(y-cy)/k)
  const zmx = FF.cx + (mx - FF.cx) / viewZoom;
  const zmy = FF.cy + (my - FF.cy) / viewZoom;
  const segs = 96;
  const threshold = 22 / viewZoom;   // zoom out'ta hit alanı da küçülmesin
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
  if (!key || !soul) {
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
  val.textContent = info.value(soul);
  dsc.textContent = info.desc;
  card.classList.add('visible');
  card.classList.toggle('pinned', key === _pinnedLayerKey);
}

function positionHoverCard(x, y) {
  const card = document.getElementById('hoverCard');
  if (!card) return;
  // Cursor'un sağ-üstüne offset (+18, -12). Ekrandan taşmasın → sola yaslan
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

// animate() her frame'de hit-test yapar (halkalar dönüyor, stasis'de bile değişebilir)
function updateHoverFromFrame() {
  if (_mouseX < 0) return;
  if (_pinnedLayerKey) return;  // pin aktif → değişmesin
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

// Canvas üzerinde etkileşim
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
    // Aynı halkaya tıkla → unpin; farklı → yeni pin
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

// ── Zoom: mouse wheel (PC) + slider drag (mobil/pc) ──
(function initZoom() {
  // Wheel zoom — canvas üstünde scroll → zoom
  window.addEventListener('wheel', (e) => {
    if (!soul) return;
    const t = e.target;
    if (t && t.closest && (t.closest('#exportBar') || t.closest('#topCtrls') || t.closest('#zoomSlider'))) {
      return;  // UI öğelerinin üstündeyken zoom tetiklenmesin
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

  // Track'e tıkla → o pozisyona atla
  track.addEventListener('pointerdown', (e) => {
    if (e.target !== track) return;
    setFromY(e.clientY);
  });

  // + / − buttons
  if (plus)  plus .addEventListener('click', () => setViewZoom(viewZoom + 0.15));
  if (minus) minus.addEventListener('click', () => setViewZoom(viewZoom - 0.15));
})();

// ══════════════════════════════════════════════════════════
//  6529 API — direkt client fetch (CORS açık) + build-time artist index
// ══════════════════════════════════════════════════════════
const API_BASE = 'https://api.6529.io';
let _artistIndex = null;
async function loadArtistIndex() {
  if (_artistIndex) return _artistIndex;
  try {
    const resp = await fetch('./artist-index.json');
    if (!resp.ok) throw new Error(`artist-index HTTP ${resp.status}`);
    _artistIndex = await resp.json();
  } catch (err) {
    console.warn('[artist-index] load failed:', err.message);
    _artistIndex = { handles: {}, wallets: {} };
  }
  // Cache max card count across all artists — drives bead cap dinamik olarak
  // (6529er bugünün zirvesi; biri kırarsa artist-index rebuild ile otomatik güncellenir)
  const counts = Object.values(_artistIndex.handles || {});
  _artistIndex._maxCount = counts.length ? Math.max(...counts) : 25;
  return _artistIndex;
}

async function fetchSoulFromApi(addr) {
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

    const idx = await loadArtistIndex();
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
    nic,
    rep,
    memeArtist:      memeArtistCount > 0,
    memeArtistCount,
    walletCount:     Math.max(1, walletCount),
  };
}

// ══════════════════════════════════════════════════════════
//  LIVE DATA — 10 dk'da bir otomatik refresh + manuel retrigger
// ══════════════════════════════════════════════════════════
let _currentAddr      = null;
let _lastFetchedAt    = null;
let _refreshInterval  = null;
let _timestampInterval = null;
const REFRESH_MS = 10 * 60 * 1000;  // 10 dakika

function updateLiveTimestamp() {
  const el = document.getElementById('liveText');
  if (!el) return;
  if (!_lastFetchedAt) { el.textContent = 'LIVE'; return; }
  const mins = Math.floor((Date.now() - _lastFetchedAt) / 60000);
  if (mins < 1)  el.textContent = 'LIVE · just now';
  else if (mins < 60) el.textContent = `LIVE · ${mins}m ago`;
  else           el.textContent = `LIVE · ${Math.floor(mins/60)}h ago`;
}

async function refreshSoulData() {
  if (!soul || !_currentAddr) return;
  const indicator = document.getElementById('liveIndicator');
  if (indicator) {
    indicator.classList.remove('stale');
    indicator.classList.add('refreshing');
  }
  try {
    const data = await fetchSoulFromApi(_currentAddr);
    if (data.unborn) throw new Error('became unborn');
    if (data.error)  throw new Error(data.error);

    // Soul alanlarını güncelle (enrichSoul her şeyi normalize eder)
    const updated = enrichSoul({ ...data, address: soul.address });
    Object.assign(soul, updated);

    // Layer strength + tier güncelle — animasyon durmaz, sadece değerler değişir
    if (FF && FF.layerStrength) {
      const tdhN    = normalizeTDH(soul.tdh);
      const boostN  = clamp((soul.boost - 1.0) / 1.3, 0, 1);
      const levelN  = clamp(soul.level / 100, 0, 1);
      const uniN    = clamp(soul.unique / 484, 0, 1);
      const nicN    = normalizeNic(soul.nic);
      const repN    = normalizeRep(soul.rep);
      const artistN = soul.memeArtist ? 1 : 0;
      FF.layerStrength[0] = tdhN;
      FF.layerStrength[1] = boostN;
      FF.layerStrength[2] = uniN;
      FF.layerStrength[3] = nicN;
      FF.layerStrength[4] = repN;
      FF.layerStrength[5] = levelN;
      if (FF.layerStrength.length > 6) FF.layerStrength[6] = artistN;
      if (typeof getSoulClass === 'function') {
        FF.tier = getSoulClass(soul.tdh).tier || 1;
      }
    }

    // HUD metinlerini yenile
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
  _refreshInterval   = setInterval(refreshSoulData, REFRESH_MS);
  _timestampInterval = setInterval(updateLiveTimestamp, 60 * 1000);
}
function stopAutoRefresh() {
  if (_refreshInterval)   clearInterval(_refreshInterval);
  if (_timestampInterval) clearInterval(_timestampInterval);
  _refreshInterval = _timestampInterval = null;
}

// ══════════════════════════════════════════════════════════
//  SHARE TO X — mevcut ruhun paylaşılır linkiyle Twitter intent
// ══════════════════════════════════════════════════════════
function shareSoulToX() {
  if (!soul) return;
  // Mevcut URL'i kullan — _pushSoulUrl zaten ?addr=... yazmış olmalı
  const url = window.location.href;
  const cls = (typeof getSoulClass === 'function' && soul.tdh != null)
              ? getSoulClass(soul.tdh).name
              : '';
  const text = cls ? `6529 soul [${cls}] →` : `6529 soul →`;
  const intent = 'https://twitter.com/intent/tweet'
    + '?text=' + encodeURIComponent(text)
    + '&url='  + encodeURIComponent(url);
  window.open(intent, '_blank', 'noopener,noreferrer');
}

// ══════════════════════════════════════════════════════════
//  EXPORT — GIF (540×540 / 12fps / 12s) + MP4 (720×720 / 15fps / 15s)
//  Her iki format da tam 1 tur rotY ile seamless loop.
//  Sadece canvas yakalanır (HUD DOM overlay, dahil değil).
// ══════════════════════════════════════════════════════════

// Ortak — capture başlangıcı, state kaydı + animasyon duraklat
function beginSoulCapture() {
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  return {
    T:         T,
    rotY:      FF.rotY,
    rotX:      FF.rotX,
    particles: particles.map(p => ({ ...p })),
  };
}

// Ortak — state restore + animasyonu devam ettir
function endSoulCapture(state) {
  T         = state.T;
  FF.rotY   = state.rotY;
  FF.rotX   = state.rotX;
  particles = state.particles;
  lastTs    = 0;
  animate(performance.now());
}

// Ortak — tek bir frame'i offscreen'e yaz (seamless tFrac 0→1)
function drawSoulCaptureFrame(tFrac, duration, savedRotY, offCtx, exportSize, sx, sy, cropSize) {
  T       = tFrac * duration;
  FF.rotY = savedRotY + tFrac * Math.PI * 2;   // tam 1 tur → seamless loop
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

// Ortak — file download tetikle
function downloadSoulBlob(blob, ext) {
  const url  = URL.createObjectURL(blob);
  const addr = (soul.address || 'soul').toString().replace(/[^a-z0-9]/gi, '_').slice(0, 20);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `soul-${addr}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Export bar toggle — EXPORT butonu alt bar'ı açıp kapatır ──
function toggleExportBar() {
  const bar = document.getElementById('exportBar');
  const btn = document.getElementById('exportBtn');
  if (!bar || !btn) return;
  if (btn.classList.contains('busy')) return;         // export sürerken açma
  bar.classList.toggle('visible');
}

function closeExportBar() {
  const bar = document.getElementById('exportBar');
  if (bar) bar.classList.remove('visible');
}

// Dışarı tıklanınca bar'ı kapat
document.addEventListener('click', (e) => {
  const bar = document.getElementById('exportBar');
  const btn = document.getElementById('exportBtn');
  if (!bar || !bar.classList.contains('visible')) return;
  if (bar.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeExportBar();
});

// ── PNG EXPORT — tek kare. c1 artık DPR-scaled physical piksellerle. ──
async function exportSoulPng() {
  if (!soul) return;
  closeExportBar();
  const btn = document.getElementById('exportBtn');
  if (btn && btn.classList.contains('busy')) return;

  const dpr  = window._dpr || 1;
  const Wlog = FF.logicalW || window.innerWidth;
  const Hlog = FF.logicalH || window.innerHeight;
  // Kare kırpma bölgesi — logical min'e göre, ruh etrafına hafif margin
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
    downloadSoulBlob(blob, 'png');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ DOWNLOADED';
      setTimeout(() => { btn.textContent = orig || '⬇ EXPORT'; }, 1200);
    }
  }, 'image/png');
}

// ── GIF EXPORT — 540×540 / 12fps / 12s / quality 10 (~8-10MB, <15MB garanti) ─
async function exportSoulGif() {
  if (!soul) return;
  if (typeof GIF === 'undefined') { console.error('gif.js yüklenmedi'); return; }
  closeExportBar();
  const btn = document.getElementById('exportBtn');
  if (!btn || btn.classList.contains('busy')) return;
  btn.classList.add('busy');

  const EXPORT_SIZE = 540;
  const FPS         = 12;
  const DURATION    = 12;
  const FRAME_COUNT = FPS * DURATION;  // 144 frame

  const state = beginSoulCapture();

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
      drawSoulCaptureFrame(i / FRAME_COUNT, DURATION, state.rotY, offCtx, EXPORT_SIZE, sx, sy, cropSize);
      gif.addFrame(offCtx, { delay: Math.round(1000 / FPS), copy: true });
      btn.textContent = `⬇ CAPTURING ${Math.round(((i + 1) / FRAME_COUNT) * 100)}%`;
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    endSoulCapture(state);  // capture bitti, normal animasyonu geri al

    btn.textContent = '⚙ ENCODING 0%';
    gif.on('progress',  p => { btn.textContent = `⚙ ENCODING ${Math.round(p * 100)}%`; });
    gif.on('finished',  blob => {
      downloadSoulBlob(blob, 'gif');
      btn.classList.remove('busy');
      btn.textContent = '⬇ EXPORT';
    });
    gif.render();
  } catch (err) {
    console.error('GIF export failed:', err);
    endSoulCapture(state);
    btn.classList.remove('busy');
    btn.textContent = '⬇ EXPORT';
  }
}

// ── MP4 EXPORT — sitedeki tam kalite (native pixel, 30fps, 8Mbps) ──
// MediaRecorder API. MP4 desteği yoksa WebM'e düşer (Firefox genelde WebM).
async function exportSoulMp4() {
  if (!soul) return;
  if (typeof MediaRecorder === 'undefined') {
    alert('Video kaydı bu tarayıcıda desteklenmiyor.');
    return;
  }
  closeExportBar();
  const btn = document.getElementById('exportBtn');
  if (!btn || btn.classList.contains('busy')) return;

  // MIME type detect: MP4 tercih, WebM fallback
  const candidates = [
    { mime: 'video/mp4;codecs=avc1.42E01E',    ext: 'mp4'  },
    { mime: 'video/mp4',                        ext: 'mp4'  },
    { mime: 'video/webm;codecs=vp9',            ext: 'webm' },
    { mime: 'video/webm;codecs=vp8',            ext: 'webm' },
    { mime: 'video/webm',                       ext: 'webm' },
  ];
  const picked = candidates.find(c => MediaRecorder.isTypeSupported(c.mime));
  if (!picked) {
    alert('Tarayıcı hiçbir video formatını desteklemiyor.');
    return;
  }

  btn.classList.add('busy');

  // Native pixel kalitesi — c1 DPR-scaled, physical min tarafı (max 1080, upscale yok)
  const dprMp4 = window._dpr || 1;
  const Wlog2  = FF.logicalW || window.innerWidth;
  const Hlog2  = FF.logicalH || window.innerHeight;
  const physMin = Math.min(Wlog2, Hlog2) * dprMp4;
  const EXPORT_SIZE = Math.min(Math.round(physMin), 1080);
  const FPS         = 30;
  const DURATION    = 15;
  const FRAME_COUNT = FPS * DURATION;  // 450 frame

  const state = beginSoulCapture();

  const off    = document.createElement('canvas');
  off.width    = EXPORT_SIZE;
  off.height   = EXPORT_SIZE;
  const offCtx = off.getContext('2d');

  const cropSize = physMin;
  const sx       = FF.cx * dprMp4 - cropSize / 2;
  const sy       = FF.cy * dprMp4 - cropSize / 2;

  // Stream — captureStream(FPS), MediaRecorder frame-rate ile senkron
  const stream   = off.captureStream(FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType:            picked.mime,
    videoBitsPerSecond:  8_000_000,   // 8 Mbps — premium, gradient detay korunur
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
    // İlk frame'i çiz (stream aktivasyonu)
    drawSoulCaptureFrame(0, DURATION, state.rotY, offCtx, EXPORT_SIZE, sx, sy, cropSize);

    const frameInterval = 1000 / FPS;
    const startTime     = performance.now();

    for (let i = 1; i <= FRAME_COUNT; i++) {
      const target = startTime + i * frameInterval;
      const wait   = Math.max(1, target - performance.now());
      await new Promise(r => setTimeout(r, wait));
      drawSoulCaptureFrame(i / FRAME_COUNT, DURATION, state.rotY, offCtx, EXPORT_SIZE, sx, sy, cropSize);
      btn.textContent = `⬇ RECORDING ${Math.round((i / FRAME_COUNT) * 100)}%`;
    }

    recorder.stop();
    await stoppedPromise;

    endSoulCapture(state);

    const blob = new Blob(chunks, { type: picked.mime });
    downloadSoulBlob(blob, picked.ext);
    btn.classList.remove('busy');
    btn.textContent = '⬇ EXPORT';
  } catch (err) {
    console.error('MP4 export failed:', err);
    try { recorder.stop(); } catch {}
    endSoulCapture(state);
    btn.classList.remove('busy');
    btn.textContent = '⬇ EXPORT';
  }
}
