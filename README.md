# 📡 GitHub Pulse

A live radar of the busiest hour on GitHub, rebuilt every 3 hours from the
entire public [GH Archive](https://www.gharchive.org/) event stream.

**Live: https://github-pulse.surge.sh** · **RSS: https://github-pulse.surge.sh/data/digest.xml**

## What it shows

- **🔥 Hottest repos** — activity heat (stars×8, forks×5, PRs×5, issues×3,
  releases×15, capped pushes, actor diversity×3). Push-bots and CI-demo repos
  are auto-detected and demoted so they can't game the chart.
- **🧠 Human signal** — repos where people actually did things (PRs, issues,
  reviews, stars, releases), bot pushes filtered out entirely.
- **👤 Top actors / 🗣 languages / 🚀 releases** — who moved code, in what, and what shipped.
- **🤖 Bot watch** — push-farms: repos with ≥40 pushes/hr from ≤2 actors.
  Includes the % of ALL GitHub pushes that are farm spam each hour.
- **🧟 Botnet watch** — farms that come back hour after hour (persistent
  offenders across the last 12 hours).

## How it works

1. `pipeline/pulse.cjs` (plain Node, zero deps) downloads the latest complete
   GH Archive hour (~20 MB gzipped), streams and aggregates ~160K events.
2. Backfills any missing hours so history stays gapless.
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

- ~1.4–2.5% of ALL GitHub pushes are push-farm spam.
- `LiamBruhin/SillyStuff` pushed 452× in one hour from a single actor.
- CI-demo repos (e.g. `merge-demo/mergequeue-st`) churn hundreds of
  pushes/hour forever and will top naive "most active" rankings.

## Run it

```bash
node pipeline/pulse.cjs              # process latest hour
MAX_BACKFILL=13 node pipeline/pulse.cjs  # backfill up to 13 missing hours
bash scripts/refresh.sh              # full refresh + deploy
```
