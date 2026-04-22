#!/usr/bin/env node
// Build-time sigil index generator.
// Run: node build-sigil-index.js  → writes sigil-index.json
// Requires Node 18+ (native fetch).
//
// Strategy (as of the "top 1420" expansion):
//   1. Fetch the Memes NFT catalog  → builds the artist handle → cards map
//      (so we can flag any wallet as memeArtist regardless of kin pool size).
//   2. Fetch /api/community-members/top paginated until we have ≥ TOP_N entries.
//   3. For each of those identities, fetch /api/tdh/consolidation/{wallet} to
//      enrich with boost / unique / nakamoto / fullSet / consolidation_display
//      / consolidation_wallets — fields community-members/top does not expose.
//   4. Compute modifier/archetype/suffix/sigilName client-side and store all
//      components in the `profiles` object (keyed by lowercased handle).
//
// KIN pool = top TOP_N identities by TDH. Artists with low TDH that fall below
// the cutoff are still detected via the artist handle map when their sigil is
// viewed — they just don't appear as candidate kin for others.

const fs   = require('fs');
const path = require('path');

const MEMES_COLLECTION = 'The Memes by 6529';
const PAGE_SIZE    = 1000;
const TOP_N        = 1420;
const TOP_PAGE_SIZE = 100;
const CHUNK_SIZE   = 5;     // parallel fetches (kept low — API rate-limits aggressively)
const CHUNK_DELAY  = 150;   // ms between chunks
const SAFETY_LIMIT = 50;    // pagination safety loop bound
const RETRY_MAX    = 3;
const RETRY_DELAY  = 400;   // ms — exponential backoff base

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}
// Retry fetch — 404 returns null immediately, 429/5xx retried with exponential backoff.
async function fetchJsonOrNull(url) {
  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      await sleep(RETRY_DELAY * (attempt + 1));
    } catch {
      await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
  return null;
}

// ── MEMES NFT CATALOG (for artist handle → card count map) ────────
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

// ── TOP IDENTITIES (by boosted TDH) ───────────────────────────────
async function fetchTopIdentities(targetN) {
  const all = [];
  let url = `https://api.6529.io/api/community-members/top?page_size=${TOP_PAGE_SIZE}`;
  let page = 0;
  while (url && all.length < targetN) {
    page++;
    process.stdout.write(`\r[top] page ${page} · ${all.length} / ${targetN}... `);
    const d = await fetchJsonOrNull(url);
    if (!d || !Array.isArray(d.data) || d.data.length === 0) break;
    for (const m of d.data) all.push(m);
    if (!d.next) break;
    url = `https://api.6529.io/api/community-members/top?page_size=${TOP_PAGE_SIZE}&page=${page + 1}`;
  }
  process.stdout.write(`\r[top] ${Math.min(all.length, targetN)} identities fetched across ${page} pages\n`);
  return all.slice(0, targetN);
}

// ── SIGIL NAME LOGIC (MUST stay in sync with sigil-organism.js) ──
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
  if (tdh >= 20_000_000) return 9;
  if (tdh >= 15_000_000) return 8;
  if (tdh >= 10_000_000) return 7;
  if (tdh >=  5_000_000) return 6;
  if (tdh >=  1_000_000) return 5;
  if (tdh >=    500_000) return 4;
  if (tdh >=    100_000) return 3;
  if (tdh >=     10_000) return 2;
  return 1;
}

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

function pickSigilModifier(s) {
  if (!s) return '';
  const seed   = sigilHash((s.address || 'manual') + ':mod');
  const tier   = getTier(s.tdh || 0);
  const tdhN   = normalizeTDH(s.tdh || 0);
  const repN   = normalizeRep(s.rep || 0);
  const nicN   = normalizeNic(s.nic || 0);
  const boostN = clamp(((s.boost || 1) - 1.0) / 1.3, 0, 1);
  const levelN = clamp((s.level || 0) / 100, 0, 1);

  if (s.nakamoto)                                    return seededPick(SIGIL_MODIFIERS.nakamoto,  seed);
  if (s.fullSet)                                     return seededPick(SIGIL_MODIFIERS.fullSet,   seed);
  if (tier >= 8)                                     return seededPick(SIGIL_MODIFIERS.tier8,     seed);
  if (tier >= 6)                                     return seededPick(SIGIL_MODIFIERS.tier6,     seed);
  if (tier >= 5)                                     return seededPick(SIGIL_MODIFIERS.tier5,     seed);
  if ((s.tdh || 0) === 0 && (s.unique || 0) === 0)   return seededPick(SIGIL_MODIFIERS.unborn,    seed);
  if (tdhN < 0.30 && (repN > 0.45 || levelN > 0.45)) return seededPick(SIGIL_MODIFIERS.rising,    seed);
  if (repN > 0.65)                                   return seededPick(SIGIL_MODIFIERS.luminous,  seed);
  if (boostN > 0.5)                                  return seededPick(SIGIL_MODIFIERS.amplified, seed);
  if (nicN < 0.10)                                   return seededPick(SIGIL_MODIFIERS.quiet,     seed);
  return seededPick(SIGIL_MODIFIERS.modest, seed);
}

function pickSigilArchetype(s) {
  if (!s) return '';
  const seed = sigilHash((s.address || 'manual') + ':core');

  if (s.nakamoto && s.memeArtist) return seededPick(SIGIL_ARCHETYPES.nakamotoArtist, seed);
  if (s.nakamoto)                 return seededPick(SIGIL_ARCHETYPES.nakamoto,       seed);
  if (s.memeArtist)               return seededPick(SIGIL_ARCHETYPES.artist,         seed);
  if (s.fullSet)                  return seededPick(SIGIL_ARCHETYPES.fullSet,        seed);

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

// Some seize-handles return 404 on the profile endpoint (e.g. "gruffishere" has
// no match; "gruffdzn.eth" does). Automation-friendly fallback layer.
const SEIZE_HANDLE_FALLBACKS = {
  'gruffishere': 'gruffdzn.eth',
};

// ── ARTIST WALLET MAP (handle → wallets → cards) ─────────────────
// Memes artist_seize_handle and 6529 display handle can drift apart (e.g. a
// meme was submitted under "gruffishere" but the current display handle on
// 6529 is "gruff"). To detect memeArtist correctly for top-N identities we
// also build a wallet → cards map by resolving each artist handle to its
// consolidation wallets. Later, top-N enrichment checks both handle AND
// wallet for a match.
async function resolveArtistWallets(handleCount) {
  const walletToCount = {};
  const handles = Object.keys(handleCount);
  let done = 0, failed = 0;
  for (let i = 0; i < handles.length; i += CHUNK_SIZE) {
    const chunk = handles.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (h) => {
      try {
        const count = handleCount[h] || 0;
        let data = await fetchJsonOrNull(`https://api.6529.io/api/profiles/${encodeURIComponent(h)}`);
        if (!data) data = await fetchJsonOrNull(`https://api.6529.io/api/profiles/${encodeURIComponent(h)}.eth`);
        if (!data && SEIZE_HANDLE_FALLBACKS[h]) {
          data = await fetchJsonOrNull(`https://api.6529.io/api/profiles/${encodeURIComponent(SEIZE_HANDLE_FALLBACKS[h])}`);
        }
        if (!data) { failed++; return; }
        const wallets = (data.consolidation?.wallets || []).map(w => w?.wallet?.address).filter(Boolean);
        for (const addr of wallets) {
          const key = String(addr).toLowerCase();
          walletToCount[key] = Math.max(walletToCount[key] || 0, count);
        }
        const primary = data.profile?.primary_wallet;
        if (primary) {
          const key = String(primary).toLowerCase();
          walletToCount[key] = Math.max(walletToCount[key] || 0, count);
        }
      } catch { failed++; }
      finally { done++; }
    }));
    process.stdout.write(`\r[artists] ${done}/${handles.length} resolved (${failed} failed)`);
    if (i + CHUNK_SIZE < handles.length) await sleep(CHUNK_DELAY);
  }
  process.stdout.write('\n');
  return walletToCount;
}

// ── PER-IDENTITY ENRICHMENT (rare flags from tdh/consolidation) ───
// We already have handle / tdh / level / rep / cic from community-members/top.
// This call adds boost / unique / nakamoto / fullSet / wallets / consolidation_display.
async function enrichIdentity(member, memeCount) {
  async function tryLookup(id) {
    return await fetchJsonOrNull(`https://api.6529.io/api/tdh/consolidation/${encodeURIComponent(id)}`);
  }
  const handleLower = String(member.display || '').toLowerCase();
  const wallet      = member.wallet;
  // Prefer wallet (never 404s), fallback to handle variants
  let td = wallet ? await tryLookup(wallet) : null;
  if (!td) td = await tryLookup(member.display);
  if (!td) td = await tryLookup(member.display + '.eth');
  if (!td && SEIZE_HANDLE_FALLBACKS[handleLower]) {
    td = await tryLookup(SEIZE_HANDLE_FALLBACKS[handleLower]);
  }
  if (!td) return null;

  const tdh            = td?.boosted_tdh || td?.tdh || member.tdh || 0;
  const unique         = td?.unique_memes || 0;
  const boost          = td?.boost || 1.0;
  const fullSet        = (td?.memes_cards_sets || 0) >= 1;
  const nakamotoCount  = td?.nakamoto || 0;
  const nakamoto       = nakamotoCount > 0;
  const address        = td?.consolidation_display || member.display || wallet || handleLower;
  const wallets        = (td?.wallets || []).filter(Boolean);

  const stats = {
    tdh, boost, unique, fullSet, nakamoto, nakamotoCount,
    level:           member.level || 0,
    rep:             member.rep || 0,
    nic:             member.cic || 0,
    memeArtist:      memeCount > 0,
    memeArtistCount: memeCount,
    walletCount:     wallets.length || 1,
  };

  const seeded    = { address, ...stats };
  const modifier  = pickSigilModifier(seeded);
  const archetype = pickSigilArchetype(seeded);
  const suffix    = pickSigilSuffix(seeded);
  const sigilName = `${modifier} ${archetype} ${suffix}`.trim();

  return {
    handle:         member.display,
    primary_wallet: wallet,
    address,
    consolidation_wallets: wallets,
    tier: getTier(tdh),
    sigilName,
    modifier,
    archetype,
    suffix,
    stats,
  };
}

async function resolveTopIdentities(top, handleCount, artistWallets) {
  const walletCount = { ...artistWallets };  // start with pre-resolved artist wallets
  const profiles    = {};     // keyed by lowercased handle
  let done = 0, failed = 0, skipped = 0;

  for (let i = 0; i < top.length; i += CHUNK_SIZE) {
    const chunk = top.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (member) => {
      try {
        const handleLower = String(member.display || '').toLowerCase();
        // Primary: handle match. Secondary: any consolidation wallet in artistWallets.
        // This catches identities whose display handle differs from their seize handle.
        let memeCount = handleCount[handleLower] || 0;
        const data = await enrichIdentity(member, memeCount);
        if (!data) { failed++; return; }
        if (memeCount === 0) {
          const candidates = [data.primary_wallet, ...data.consolidation_wallets].filter(Boolean);
          for (const addr of candidates) {
            const c = artistWallets[String(addr).toLowerCase()] || 0;
            if (c > memeCount) memeCount = c;
          }
          if (memeCount > 0) {
            // Recompute stats + sigil name with correct memeArtist flag
            data.stats.memeArtist      = true;
            data.stats.memeArtistCount = memeCount;
            const seeded    = { address: data.address, ...data.stats };
            data.modifier  = pickSigilModifier(seeded);
            data.archetype = pickSigilArchetype(seeded);
            data.suffix    = pickSigilSuffix(seeded);
            data.sigilName = `${data.modifier} ${data.archetype} ${data.suffix}`.trim();
          }
        }

        // walletCount — merge any new artist wallets we discover
        for (const addr of data.consolidation_wallets) {
          const key = String(addr).toLowerCase();
          if (memeCount) walletCount[key] = Math.max(walletCount[key] || 0, memeCount);
        }
        if (data.primary_wallet && memeCount) {
          const key = String(data.primary_wallet).toLowerCase();
          walletCount[key] = Math.max(walletCount[key] || 0, memeCount);
        }

        // Exclude unborn (no activity) from kin pool
        const s = data.stats;
        if (s.tdh === 0 && s.unique === 0) {
          skipped++;
        } else {
          profiles[handleLower] = {
            handle:         data.handle,
            primary_wallet: data.primary_wallet,
            tier:           data.tier,
            sigilName:      data.sigilName,
            modifier:       data.modifier,
            archetype:      data.archetype,
            suffix:         data.suffix,
            stats:          s,
          };
        }
      } catch {
        failed++;
      } finally {
        done++;
      }
    }));
    process.stdout.write(`\r[enrich] ${done}/${top.length} (${failed} failed, ${skipped} unborn)`);
    if (i + CHUNK_SIZE < top.length) await sleep(CHUNK_DELAY);
  }
  process.stdout.write('\n');
  return { walletCount, profiles };
}

// ── MAIN ────────────────────────────────────────────────────────
(async function main() {
  const t0 = Date.now();

  console.log('[build] fetching Memes NFT catalog...');
  const nfts = await fetchAllMemes();
  const handleCount = collectHandleCounts(nfts);
  console.log(`[build] ${Object.keys(handleCount).length} unique artist handles`);

  console.log('[build] resolving artist handles → wallets (for cross-handle detection)...');
  const artistWallets = await resolveArtistWallets(handleCount);
  console.log(`[build] ${Object.keys(artistWallets).length} artist wallets resolved`);

  console.log(`[build] fetching top ${TOP_N} identities by TDH...`);
  const top = await fetchTopIdentities(TOP_N);

  console.log(`[build] enriching ${top.length} identities with consolidation data...`);
  const { walletCount, profiles } = await resolveTopIdentities(top, handleCount, artistWallets);

  const output = {
    lastBuild:   new Date().toISOString(),
    nftCount:    nfts.length,
    topN:        top.length,
    handles:     handleCount,   // artist handle → Memes card count
    wallets:     walletCount,   // wallet address → Memes card count (artists' wallets only)
    profiles,                    // handle → { sigilName, modifier, archetype, suffix, tier, stats, ... }
  };

  const outPath = path.join(__dirname, 'sigil-index.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[build] done in ${dt}s → ${outPath}`);
  console.log(
    `[build] ${Object.keys(handleCount).length} artist handles · ` +
    `${Object.keys(walletCount).length} artist wallets · ` +
    `${Object.keys(profiles).length} kin-eligible profiles · ` +
    `${nfts.length} NFTs · top ${top.length}`
  );
})().catch(err => {
  console.error('[build] FAILED:', err);
  process.exit(1);
});
