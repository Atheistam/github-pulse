# 📡 GitHub Pulse

A live radar of the busiest hour on GitHub, rebuilt every 3 hours from the
entire public [GH Archive](https://www.gharchive.org/) event stream.

**Live: https://github-pulse.surge.sh** · **RSS: https://github-pulse.surge.sh/data/digest.xml** · **Code: https://github.com/Atheistam/github-pulse**

## What it shows

- **🔥 Hottest repos** — activity heat (stars×8, forks×5, PRs×5, issues×3,
  releases×15, capped pushes, actor diversity×3). Push-bots and CI-demo repos
  are auto-detected and demoted so they can't game the chart.
- **🧠 Human signal** — repos where people actually did things (PRs, issues,
  reviews, stars, releases), bot pushes filtered out entirely.
- **👤 Top actors / 🗣 languages / 🚀 releases** — who moved code, in what, and what shipped.
- **🤖 Bot watch** — push-farms: repos whose activity is an automated push
  loop (zero human signal, ≤2 actors). Detection is profile-based — the farms
  adapt their push volume (40→30→25→24 pushes/hr) to duck any fixed
  threshold, so we flag on *patterns*, not volume: auto-generated account
  names, known farm actors (persistent ledger — repos rotate, actors persist),
  and high-volume zero-human churners corroborated by history. Includes the
  % of ALL GitHub pushes that are farm spam each hour.
- **🧟 Botnet watch** — farms that come back hour after hour (persistent
  offenders across the last 12 hours).

## How it works

1. `pipeline/pulse.cjs` (plain Node, zero deps) downloads the latest complete
   GH Archive hour (~20 MB gzipped), streams and aggregates ~160K events.
2. Backfills any missing hours so history stays gapless (v5: backfill now
   crosses day boundaries — the old "start of today" cutoff left a permanent
   gap on the first run of each day).
3. Enriches top repos with language/description via the GitHub API (cached).
4. Computes trends vs the previous hour, bot/botnet detection, digest, RSS.
5. Deploys static files to Surge.sh. `scripts/refresh.sh` does the whole cycle.

## Repo layout

```
pipeline/pulse.cjs   — data pipeline (aggregate → rank → digest → RSS)
site/                — static site (index.html, app.js, styles.css, data/)
scripts/refresh.sh   — one-shot refresh + deploy
scripts/verify.cjs   — headless Playwright check of the live site
```

## Data findings so far

- ~36% of ALL GitHub pushes are push-farm spam (hour 2026-08-12-0; was 48% at
  hour 18 — farms ebb and flow, detection holds).
- `LiamBruhin/SillyStuff` pushed 690× in a single hour from one actor, 13h+ straight.
- Farms launder pushes through GitHub Actions (`github-actions[bot]`) and
  rotate repo names (`vbpl-storage-tu-1` → `dp-2` → `dp-3`) — the durable
  signal is the *owner account*, tracked in a persistent ledger (16.3K actors).
- New farm wave (Aug 12): coordinated `trnfvn-`/`brnfvn-` repo names
  (`CentiCloudStir/trnfvn-HLRODS`, `MicroEnvoyTwist/trnfvn-ZSRFLV`,
  `YuqiGuo-cx0/brnfvn-UAOYZP`) pushing ~325–345×/hr from single actors —
  caught on first sight by the profile rules.
- Adaptation probe (v5): every hour, zero-human push-heavy repos are bucketed
  by actor count (1-2 / 3-4 / 5-8 / 9+). The 3-4 actor bucket is tiny (6 repos,
  ~104 pushes) — the farms have NOT yet split accounts to duck the ≤2-actor rule.
- Real-name farms (jvhoang, ugmoddev, zerotraceh1, elad-cmd) push 150–690×/hr
  for 20+ hours straight with zero human signal; they're flagged push-bot
  once corroborated (2+ hours in history/ledger), push-loop before that, so a
  solo dev's automated pipeline is never publicly called a bot on first sight.
- CI-demo repos (e.g. `merge-demo/mergequeue-st`) churn hundreds of
  pushes/hour forever and will top naive "most active" rankings.

## Run it

```bash
node pipeline/pulse.cjs              # process latest hour
MAX_BACKFILL=13 node pipeline/pulse.cjs  # backfill up to 13 missing hours
bash scripts/refresh.sh              # full refresh + deploy
```
