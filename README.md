# THE SIGILS
### A mirror, not a score.

Every 6529 wallet carries an identity — not chosen, but accrued. **The Sigils** reads your on-chain identity and renders it as a living orbital sigil. Every tier walks with dignity. Every maker shines first. Deterministic, yet no two sigils dance alike.

Your 6529 accrual, given a face.

---

## How it works

1. Enter a wallet (`0x…`, ENS name, or 6529 handle)
2. The app reads nine parameters from the 6529 API (TDH, boost, level, unique memes, NIC, REP, full-set, Nakamoto, artist credits, consolidation)
3. A fully generative orbital sigil is drawn in real time on HTML5 canvas
4. Data refreshes every 10 minutes — your sigil evolves as you do

No external images. No server. Everything is computed from the wallet.

---

## Tier system

| TDH range       | Tier        | Unlock                              |
|-----------------|-------------|-------------------------------------|
| 0               | UNBORN      | no render                           |
| < 10K           | ECHO        | baseline                            |
| 10K – 99K       | SIGNAL      | baseline                            |
| 100K – 499K     | EMERGING    | + particle density                  |
| 500K – 999K     | RESONANCE   | + second armillary frame            |
| 1M – 4.9M       | ANCHOR      | + outer prestige ring               |
| 5M – 9.9M       | PILLAR      | + sparkle density                   |
| 10M – 14.9M     | MONUMENT    | + softened vignette                 |
| 15M – 19.9M     | LEGEND      | + cosmic dust drift                 |
| 20M+            | PHENOMENON  | + golden corona flash every 10s     |

Each tier adds a visual layer on top of previous ones — the sigil never strips down, it only deepens.

---

## Parameter → visual mapping

| Parameter      | Visual                                                          |
|----------------|-----------------------------------------------------------------|
| TDH            | Amber solar core + flare length + orbital form scale + particle density |
| BOOST          | Magenta companion ring + extra flare length                     |
| UNIQUE         | Cyan 484-bead necklace (one lit bead per meme held)             |
| NIC            | Lavender ring + turbulent particle field                        |
| REP            | Sage inbound rays from the void + sparkle density               |
| LEVEL          | Coral progress arc — fills proportional to level/100            |
| FULL SET       | Teal thorny outer shell (pulses every 2s)                       |
| NAKAMOTO       | Gold bracelet on a tilted great circle + orbiting gold ball     |
| MEME ARTIST    | Rainbow ring + iridescent pearl beads (one per extra card)      |
| WALLET COUNT   | Small moons orbiting the sun (one per extra consolidated wallet)|

---

## Sigil Name

Every wallet carries a three-part sigil name — `modifier + archetype + suffix` — chosen deterministically from your dominant signals.

Examples:
- `Gilded Prime Maker of the Seize` — Nakamoto holder + Memes artist
- `Rising Maker of the Spark` — early-tier artist on an upward trajectory
- `Luminous Herald of the Archive` — high REP relative to TDH
- `Ancient Pillar of the Ledger` — deep, long-held identity
- `Dormant Drifter of the Unseen` — wallet with no current participation

Names are picked from pools of ~55 modifiers, ~60 archetypes, and 33 suffixes, giving ~100k possible combinations. The name is shown in the top-right HUD beneath the tier.

---

## Running locally

No build, no install. Just a static server (browsers block `fetch` from `file://`):

```bash
# Python
python -m http.server 8000

# Node
npx serve
```

Then open `http://localhost:8000`.

---

## Sigil index

The `sigil-index.json` file contains three things:

- **`handles`** — every Memes artist handle → card count (from the full Memes NFT catalog)
- **`wallets`** — each artist's consolidated wallets → card count (for wallet-based artist detection)
- **`profiles`** — the top **1,420 identities** by boosted TDH, each with a pre-computed sigil name (modifier / archetype / suffix), tier, and enriched stats

The profiles pool drives KIN matching — anyone visiting the app can find kin among 1,420 active 6529 souls.

The index is regenerated automatically every day at 06:00 UTC by a GitHub Actions workflow. Manual rebuild:

```bash
node build-sigil-index.js
```

Requires Node 18+ (native `fetch`). Takes ~15 minutes (1 catalog fetch + 1,420 consolidation fetches with rate-limit backoff). Only the `The Memes by 6529` collection is used for artist detection; other 6529 collections (Gradient etc.) are filtered out.

---

## Exports

- **PNG** — 1080×1080, one frame
- **GIF** — 540×540, 12 fps, 12 seconds, seamless loop
- **MP4** — native pixel size (up to 1080×1080), 30 fps, 15 seconds, 8 Mbps

All exports render a tight crop around the sigil, no HUD overlay, seamless rotational loop.

---

## File layout

```
the-sigils/
├── index.html               entry UI + app bootstrap
├── about.html               manifesto + parameter reference
├── sigil-organism.js        all rendering, animation, API, KIN logic
├── wrapper.html             tiny IPFS shell (iframes the GitHub Pages URL)
├── sigil-index.json        pre-computed artist + sigil-name map
├── build-sigil-index.js    rebuilds sigil-index.json
├── .github/workflows/       daily auto-rebuild of sigil-index
├── vendor/gif.js            GIF encoder (Jnordberg)
└── README.md
```

---

## Deploy

- **GitHub Pages** serves the app at `https://gruffishere.github.io/the-sigils/`
- **IPFS wrapper** (pinned via Pinata) hosts a minimal iframe pointing at the GitHub Pages URL — this is the CID submitted to 6529 Memes

Any change pushed to `main` redeploys Pages automatically. The IPFS CID stays stable because the wrapper only references the Pages URL.

---

## Credits

Built by [gruffdzn.eth](https://6529.io/gruffishere).
Data from the 6529 API.

A mirror, not a score. A love letter to The Memes.
