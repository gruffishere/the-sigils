#!/usr/bin/env node
// Build-time artist index generator.
// Run: node build-artist-index.js  → writes artist-index.json
// Requires Node 18+ (native fetch).
//
// Source: /api/nfts — returns all of 6529's collections (Memes + Gradient).
// We only want "The Memes by 6529" collection; the others are filtered out.
//
// For each artist we also fetch TDH/consolidation + profile and compute the Sigil Name.
// The `profiles` field in artist-index.json is used for client-side KIN matching.

const fs   = require('fs');
const path = require('path');

const MEMES_COLLECTION = 'The Memes by 6529';
const PAGE_SIZE    = 1000;
const CHUNK_SIZE   = 5;     // parallel fetch count (kept low for rate limits)
const CHUNK_DELAY  = 150;   // ms — wait between chunks
const SAFETY_LIMIT = 50;    // pagination loop guard
const RETRY_MAX    = 3;     // how many times to retry failed requests
const RETRY_DELAY  = 400;   // ms — wait before retry (exponential)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
// Fetch with retry — on 429/5xx it retries with increasing backoff, on 404 it stops.
async function fetchJsonOrNull(url) {
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;                 // not found → no retry
      // 429 or 5xx → retry
      await sleep(RETRY_DELAY * (attempt + 1));
    } catch {
      await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
  return null;
}

// ── NFT CATALOG ─────────────────────────────────────────────────
async function fetchAllMemes() {
  const all = [];
  let url = `https://api.6529.io/api/nfts?page_size=${PAGE_SIZE}`;
  let safety = SAFETY_LIMIT;
  let page = 0;
  let totalSeen = 0;
  while (url && safety-- > 0) {
    page++;
    process.stdout.write(`\r[nfts] page ${page}... `);
    const d = await fetchJson(url);
    for (const n of d.data || []) {
      totalSeen++;
      if (n.collection === MEMES_COLLECTION) all.push(n);
    }
    url = d.next || null;
  }
  const dropped = totalSeen - all.length;
  process.stdout.write(`\r[nfts] ${all.length} Memes fetched (${dropped} non-Memes filtered) across ${page} pages\n`);
  return all;
}

function collectHandleCounts(nfts) {
  const counts = {};
  for (const nft of nfts) {
    const raw = nft.artist_seize_handle;
    if (!raw) continue;
    const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
    for (const h of parts) {
      const key = h.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

// ── SIGIL NAME LOGIC (must be IDENTICAL to sigil-organism.js) ──
// We replicate these functions here so the names we compute at build time
// exactly match the ones shown on the client.
function sigilHash(value) {
  let h = 2166136261;
  const text = String(value || 'sigil');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededPick(arr, seed) {
  if (!arr || arr.length === 0) return '';
  return arr[(seed >>> 0) % arr.length];
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function normalizeTDH(tdh) {
  if (tdh <= 0) return 0;
  return clamp(Math.log1p(tdh) / Math.log1p(300_000_000), 0, 1);
}
function normalizeRep(rep) {
  if (rep <= 0) return 0;
  return clamp(Math.log1p(rep) / Math.log1p(8_000_000), 0, 1);
}
function normalizeNic(nic) {
  if (nic <= 0) return 0;
  return clamp(Math.log1p(nic) / Math.log1p(2_500_000), 0, 1);
}

function getTier(tdh) {
  if (tdh >= 20_000_000) return 9;  // PHENOMENON
  if (tdh >= 15_000_000) return 8;  // LEGEND
  if (tdh >= 10_000_000) return 7;  // MONUMENT
  if (tdh >=  5_000_000) return 6;  // PILLAR
  if (tdh >=  1_000_000) return 5;  // ANCHOR
  if (tdh >=    500_000) return 4;  // RESONANCE
  if (tdh >=    100_000) return 3;  // EMERGING
  if (tdh >=     10_000) return 2;  // SIGNAL
  return 1;                          // ECHO
}

function generateSigilName(s) {
  if (!s) return '';
  const addr    = s.address || 'manual';
  const seedM   = sigilHash(addr + ':mod');
  const seedC   = sigilHash(addr + ':core');

  let modifier;
  const tier   = getTier(s.tdh);
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
    const uniN = clamp((s.unique || 0) / 484, 0, 1);
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

// Some seize-handles return 404 when looked up directly on the 6529 API
// (e.g. "gruffishere" has no match on the profile endpoint, but "gruffdzn.eth" does).
// This map is an automation-friendly fallback layer — the build-time script reads it,
// and new edge cases just get another line here; no manual commands required.
const SEIZE_HANDLE_FALLBACKS = {
  'gruffishere': 'gruffdzn.eth',
  // New cases: 'seize_handle_lowercase': 'working_lookup_id',
};

// ── ARTIST PROFILE FETCH — TDH + profile + Sigil Name ─────────────
async function fetchArtistProfile(handle, memeCount) {
  // 3-stage lookup: direct → append .eth → custom fallback map
  async function tryLookup(id) {
    const [td, profile] = await Promise.all([
      fetchJsonOrNull(`https://api.6529.io/api/tdh/consolidation/${encodeURIComponent(id)}`),
      fetchJsonOrNull(`https://api.6529.io/api/profiles/${encodeURIComponent(id)}`),
    ]);
    return profile ? { td, profile } : null;
  }

  let result = await tryLookup(handle);
  if (!result) result = await tryLookup(`${handle}.eth`);
  if (!result && SEIZE_HANDLE_FALLBACKS[handle]) {
    result = await tryLookup(SEIZE_HANDLE_FALLBACKS[handle]);
  }
  if (!result) return null;

  const { td, profile } = result;

  const tdh           = td?.boosted_tdh || td?.tdh || 0;
  const unique        = td?.unique_memes || 0;
  const boost         = td?.boost || 1.0;
  const fullSet       = (td?.memes_cards_sets || 0) >= 1;
  const nakamotoCount = td?.nakamoto || 0;
  const nakamoto      = nakamotoCount > 0;
  const address       = td?.consolidation_display || profile.profile?.handle || handle;
  const wallets       = (profile.consolidation?.wallets || []).map(w => w?.wallet?.address).filter(Boolean);
  const primary       = profile.profile?.primary_wallet || null;

  const stats = {
    tdh, boost, unique, fullSet, nakamoto, nakamotoCount,
    level:           profile.level            || 0,
    rep:             profile.rep              || 0,
    nic:             profile.cic?.cic_rating  || 0,
    memeArtist:      memeCount > 0,
    memeArtistCount: memeCount,
    walletCount:     wallets.length || 1,
  };

  const sigilName = generateSigilName({ address, ...stats });
  const [modifier, ...coreParts] = sigilName.split(' ');
  const archetype = coreParts.join(' ');

  return {
    handle: profile.profile?.handle || handle,
    address,
    primary_wallet: primary,
    consolidation_wallets: wallets,
    tier: getTier(tdh),
    sigilName,
    modifier,
    archetype,
    stats,
  };
}

async function resolveArtists(handleCount) {
  const walletCount = {};
  const profiles    = {};                  // keyed by lowercased handle
  const handles = Object.keys(handleCount);
  let done = 0, failed = 0, skipped = 0;

  for (let i = 0; i < handles.length; i += CHUNK_SIZE) {
    const chunk = handles.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (h) => {
      try {
        const count = handleCount[h] || 0;
        const data  = await fetchArtistProfile(h, count);
        if (!data) { failed++; return; }

        // 1) walletCount — for wallet matching (existing behavior)
        for (const addr of data.consolidation_wallets) {
          const key = addr.toLowerCase();
          walletCount[key] = (walletCount[key] || 0) + count;
        }
        if (data.primary_wallet) {
          const key = data.primary_wallet.toLowerCase();
          if (!walletCount[key]) walletCount[key] = count;
        }

        // 2) profiles — for KIN matching (new field)
        // Exclude unborn artists (TDH=0 & unique=0) from the kin pool
        const s = data.stats;
        if (s.tdh === 0 && s.unique === 0) {
          skipped++;
        } else {
          profiles[h] = {
            handle:         data.handle,
            primary_wallet: data.primary_wallet,
            tier:           data.tier,
            sigilName:       data.sigilName,
            modifier:       data.modifier,
            archetype:      data.archetype,
            stats:          s,
          };
        }
      } catch {
        failed++;
      } finally {
        done++;
      }
    }));
    process.stdout.write(`\r[profiles] ${done}/${handles.length} resolved (${failed} failed, ${skipped} unborn)`);
    if (i + CHUNK_SIZE < handles.length) await sleep(CHUNK_DELAY);
  }
  process.stdout.write('\n');
  return { walletCount, profiles };
}

// ── MAIN ────────────────────────────────────────────────────────
(async function main() {
  const t0 = Date.now();
  console.log('[build] fetching Memes NFT catalog...');
  const nfts = await fetchAllMemes();

  console.log('[build] aggregating artist handles...');
  const handleCount = collectHandleCounts(nfts);
  console.log(`[build] ${Object.keys(handleCount).length} unique handles`);

  console.log('[build] resolving handles → stats + Sigil Name + wallets...');
  const { walletCount, profiles } = await resolveArtists(handleCount);

  const output = {
    lastBuild: new Date().toISOString(),
    nftCount:  nfts.length,
    handles:   handleCount,
    wallets:   walletCount,
    profiles,  // handle → { sigilName, modifier, archetype, tier, stats, ... }
  };

  const outPath = path.join(__dirname, 'artist-index.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[build] done in ${dt}s → ${outPath}`);
  console.log(`[build] ${Object.keys(handleCount).length} handles · ${Object.keys(walletCount).length} wallets · ${Object.keys(profiles).length} kin-eligible · ${nfts.length} NFTs`);
})().catch(err => {
  console.error('[build] FAILED:', err);
  process.exit(1);
});
