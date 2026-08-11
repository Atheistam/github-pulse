#!/usr/bin/env node
/**
 * GitHub Pulse — pipeline v2
 * Fetches GH Archive hours, aggregates GitHub activity, writes snapshot +
 * rolling history + digest for the static site.
 *
 * v2 changes:
 *  - heat metric (stars*5 + forks*3 + prs*3 + issues*2 + pushes + releases*10)
 *    because Watch/Fork events are scarce in the archive → star-based ranking
 *    alone is nearly dead. "hottest" = weighted activity heat.
 *  - top_actors: most active users this hour.
 *  - backfill: fills ALL missing hours between the earliest known hour and the
 *    latest complete hour (history stays gapless, not just newest-hour).
 *  - trends: rank deltas vs previous hour on top_hot / top_active lists.
 *  - digest.json: compact human-readable summary (Telegram/newsletter-ready).
 *
 * Snapshot schema:
 * {
 *   as_of, hour, events, repos_seen, prev_hour,
 *   vs_prev: {events_pct, repos_pct},
 *   top_hot:    [{repo, heat, events, pushes, prs, issues, stars, forks,
 *                 releases, language, desc, url, prev_rank, rank_delta, trend}],
 *   top_active: [{repo, events, language, desc, url, prev_rank, rank_delta, trend}],
 *   top_actors: [{actor, events, repos, top_repo, url}],
 *   top_languages: [{language, stars, forks, repos}],
 *   top_releases:  [{repo, release, tag, desc, url, actor}]
 * }
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SITE_DATA = path.join(__dirname, '..', 'site', 'data');
const HIST_DIR = path.join(SITE_DATA, 'history');
const MAX_BACKFILL = Number(process.env.MAX_BACKFILL || 4); // max missing hours to fetch in one run

function pad(n) { return String(n).padStart(2, '0'); }

function dateStrUTC(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseHour(label) {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{1,2})$/.exec(label);
  if (!m) throw new Error('bad hour label: ' + label);
  return { date: m[1], hour: Number(m[2]) };
}

/** Hour label → comparable integer (days-since-epoch × 24 + hour). */
function hourNum(label) {
  const { date, hour } = parseHour(label);
  return Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000) * 24 + hour;
}

function prevHourLabel(label) {
  const { date, hour } = parseHour(label);
  if (hour > 0) return `${date}-${hour - 1}`;
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return `${dateStrUTC(d)}-23`;
}

/** Probe availability of an archive file; true if HTTP 200/206 */
function probeExists(hourLabel) {
  return new Promise((resolve) => {
    const req = https.request(`https://data.gharchive.org/${hourLabel}.json.gz`, { method: 'HEAD' }, (res) => {
      res.resume();
      resolve([200, 206].includes(res.statusCode));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(12000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/** Find the most recent complete hour file (file for hour H exists ⇒ H finished) */
async function findLatestHour() {
  const now = new Date();
  for (let back = 0; back < 3; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const ds = dateStrUTC(d);
    let h = d.getUTCHours() - 1;
    if (back === 0 && h < 0) { h = 23; }
    for (let i = h; i >= 0; i--) {
      const label = `${ds}-${i}`;
      if (await probeExists(label)) return label;
    }
  }
  throw new Error('No recent GH Archive file found');
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = {
      headers: Object.assign({
        'User-Agent': 'github-pulse-bot/2.0',
        'Accept': 'application/vnd.github+json',
      }, headers),
    };
    mod.get(url, opts, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// Anti-spam heat: quality signals (stars/forks/PRs/issues/releases) weighted
// highest, pushes capped (push-bots spam hundreds/hour), plus distinct-actor
// diversity — 40 pushes from 12 humans beats 364 pushes from 1 bot.
//
// Flagging: repos whose "activity" is really an automated push loop get a
// demotion multiplier so they can't top the hottest chart:
//   push-bot — v3 (arms-race proof): the farms adapt their push volume to duck
//              any fixed threshold (we've seen 40 → 30 → 25 → 24). So instead
//              of a volume threshold we use *profile* signals that cost them:
//                · zero human signal: 0 PRs/issues/stars/forks/releases/reviews
//                  (a real repo gets SOME human touch within an hour)
//                · ≤2 actors doing ALL the pushing
//                · auto-generated names: "word+digits" owner (smithhoward5868,
//                  conleyricky202) with a 4-8 char lowercase gibberish repo
//                  (faiucd, babjhl) — the fingerprint of bulk account creation
//                · known farm actors: accounts seen flagging in previous runs
//                  (repos rotate, actors persist — this is the durable signal)
//   ci-demo   — demo/sandbox/training-named repo that is push-heavy from a
//              handful of actors (e.g. mergequeue CI demo repos that churn
//              hundreds of pushes/hr forever).
const AUTONAME_OWNER = /^[a-z]+[0-9]{2,}[a-z]*$/; // e.g. smithhoward5868, conleyricky202
const AUTONAME_REPO = /^[a-z]{4,8}$/;             // e.g. faiucd, babjhl
// Shared platform bot accounts must NEVER enter the farm ledger. Farms
// launder pushes through GitHub Actions (github-actions[bot] does the actual
// pushing), so a naive "all actors of a flagged repo" rule blacklists a bot
// account shared by millions of legit repos — then ANY repo it touches gets
// demoted. The durable signal for Actions-laundered farms is the OWNER
// (betorj04, ugmoddev), not the actor.
const SHARED_BOTS = new Set([
  'github-actions[bot]', 'dependabot[bot]', 'dependabot-preview[bot]',
  'renovate[bot]', 'github-classroom[bot]', 'codecov[bot]', 'snyk-bot',
  'coveralls[bot]', 'semantic-release-bot', 'release-please[bot]',
  'changeset-bot', 'goreleaserbot', 'github-advanced-security[bot]',
  'imgbot[bot]', 'dependabot[bot]', 'pre-commit-ci[bot]', 'sonarcloud[bot]',
  'lgtm-com[bot]', 'deepcode-ai[bot]', 'codacy-production[bot]',
  // conda-forge's automation account (pushes conda-forge-bot-data 40+/hr)
  'regro-cf-autotick-bot', 'regro-cf-autotick-bot-staging',
]);
// Any GitHub App bot ends in '[bot]' — none of them can be farm operators
// (farms are bulk-created human-looking accounts). Covers aws-connector-for-
// github[bot], clawsweeper[bot], trunk-io[bot], cursor[bot] and any future app.
const isSharedBot = (a) => SHARED_BOTS.has(a) || /\[bot\]$/.test(a);
function isAutoGeneratedName(repo) {
  const [owner = '', rname = ''] = String(repo || '').toLowerCase().split('/');
  return AUTONAME_OWNER.test(owner) && AUTONAME_REPO.test(rname);
}
function flagOf(r, farmActors = null) {
  const name = String(r.repo || '').toLowerCase();
  // weighted human signal — a lone PR or issue shouldn't rescue a push loop
  const human = (r.prs || 0) * 4 + (r.issues || 0) * 3 + (r.stars || 0) * 5 +
    (r.forks || 0) * 3 + (r.releases || 0) * 8 + (r.reviews || 0) * 2;
  const rawHuman = (r.prs || 0) + (r.issues || 0) + (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + (r.reviews || 0);
  const pushes = r.pushes || 0;
  const actors = r.actors || 0;
  const autoGen = isAutoGeneratedName(r.repo);
  const zeroHuman = rawHuman === 0;
  const owner = name.split('/')[0];
  const ownerEntry = farmActors ? farmActors.get(owner) : null;
  const knownFarmTouch = (farmActors && (r.actor_names || []).some((a) => {
    const e = farmActors.get(a.toLowerCase());
    return e && e.hours.size >= FARM_ACTOR_MIN_HOURS;
  })) || (ownerEntry && ownerEntry.hours.size >= FARM_ACTOR_MIN_HOURS);
  // Corroboration for real-looking names: a repo whose OWNER has a long
  // bot_watch history (≥2 of last 24h) is a repeat offender, not a solo dev
  // who tripped the zero-human rule once (e.g. importing a big repo).
  const ownerHistoryConfirmed = CONFIRMED_FARM_OWNERS.has(owner);
  // CONFIDENT push-bot — the farms' fingerprints:
  //  · auto-generated account name (bulk-created "word+digits" owner, gibberish
  //    4-8 char repo) doing a pure push loop — they've tried 40, 30, 25 and 24
  //    pushes, so no fixed volume threshold: the NAME is the durable signal.
  //  · high-volume zero-human churner (≥25 pushes, ≤2 actors) with a
  //    real-looking name — ONLY confident if corroborated (known farm actor,
  //    farm-owner history, or auto-gen name). Otherwise it's a 'push-loop':
  //    demoted from heat, but not publicly called a bot, so a solo dev's
  //    automated data pipeline isn't shamed as spam.
  if (autoGen && zeroHuman && pushes >= 5 && actors <= 2) return 'push-bot';
  if (zeroHuman && pushes >= 25 && actors <= 2 &&
      (knownFarmTouch || ownerHistoryConfirmed)) return 'push-bot';
  // SUSPICIOUS push-loop: all-push profile at moderate volume with a
  // real-looking name — could be a small farm OR a solo dev importing a big
  // repo. Demote from heat but don't call it a bot in the UI.
  if (zeroHuman && pushes >= 10 && actors <= 2) return 'push-loop';
  // KNOWN FARM TOUCH at low volume: the ledger exists so repos that rotate
  // (farms adapt push volume DOWN — 40→30→25→24) get caught BEFORE they ramp
  // up. Any repo a confirmed farm actor/owner touches with ≤2 human signals,
  // ≥5 pushes AND a farm-like actor count (≤2 actors — a real org repo like
  // PostHog/posthog has 10-18 actors and must never be caught by owner
  // evidence alone) is suspect — light 'push-loop' tier unless auto-gen named.
  // History-confirmed owners (≥2 bot_watch appearances in 24h) count too, so
  // a rotating farm's fresh repo is caught on hour one, not after it re-enters
  // the ledger.
  if ((knownFarmTouch || ownerHistoryConfirmed) && rawHuman <= 2 && pushes >= 5 && actors <= 2) {
    return autoGen ? 'push-bot' : 'push-loop';
  }
  if (/mergequeue|merge-queue|merge-demo|octo-org|githubtraining|sandbox|playground|hello-world|ci-demo|test-repo/.test(name) &&
      pushes >= 10 && actors <= 4 && rawHuman <= 2) return 'ci-demo';
  return null;
}
const DEMOTE = { 'push-bot': 0.05, 'push-loop': 0.3, 'ci-demo': 0.1 };
// farmActors: Map<actor|owner, {lastSeen, hours:Set<hourLabel>}> persisted in
// site/data/farm_actors.json. An entry is created when its repo is confidently
// flagged push-bot (auto-gen name OR high-volume zero-human profile); shared
// platform bot accounts are never added. An entry only DEMOTES other repos
// once seen flagged in ≥2 distinct hours (repeat offender), and stale entries
// (not seen for 48h) are pruned so the ledger can't grow unbounded. Repos
// rotate, actors persist — this is the durable signal.
let FARM_ACTORS = new Map();
// Owners with a long bot_watch history (≥2 of last 24h) — corroboration that
// a real-looking name is a repeat farm operator, not a solo dev who tripped
// the zero-human rule once. Rebuilt each run from history files.
let CONFIRMED_FARM_OWNERS = new Set();
const FARM_ACTOR_MIN_HOURS = 2;
const FARM_ACTOR_TTL_HOURS = 48;
function pruneFarmActors(curHour) {
  for (const [a, e] of FARM_ACTORS) {
    if (hourNum(curHour) - hourNum(e.lastSeen) > FARM_ACTOR_TTL_HOURS) FARM_ACTORS.delete(a);
  }
}
// Rebuild CONFIRMED_FARM_OWNERS from history: scan the last 24h of bot_watch
// AND demoted entries, count appearances per repo OWNER — but only for owners
// that look like OPERATORS (auto-gen name, or the owner itself is among the
// pushing actors). A big org like conda-forge whose bot pushes a data repo
// (conda-forge-bot-data, 40+/hr) appears in demoted every hour, but 'conda-
// forge' must NOT become a confirmed farm owner — its real repos have 10+
// actors and zero bot profile. bot_watch alone would also miss the word-name
// farms (wave-res, xolirx) that only reach the push-loop tier, so demoted is
// scanned too — with the operator test applied to both lists.
function rebuildConfirmedFarmOwners(curHour) {
  CONFIRMED_FARM_OWNERS = new Set();
  const counts = new Map();
  const files = readHistoryIndex()
    .sort((a, b) => hourNum(a.replace(/\.json$/, '')) - hourNum(b.replace(/\.json$/, '')))
    .filter((f) => f !== `${curHour}.json`)
    .slice(-24);
  for (const f of files) {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), 'utf8')); } catch { continue; }
    const entries = [...(snap.bot_watch || []), ...(snap.demoted || [])];
    for (const b of entries) {
      const owner = String(b.repo || '').split('/')[0].toLowerCase();
      if (!owner || isSharedBot(owner)) continue;
      const ownerPushesItself = (b.actor_names || []).some((a) => a.toLowerCase() === owner);
      if (!(AUTONAME_OWNER.test(owner) || ownerPushesItself)) continue; // operator test
      counts.set(owner, (counts.get(owner) || 0) + 1);
    }
  }
  for (const [owner, n] of counts) if (n >= 2) CONFIRMED_FARM_OWNERS.add(owner);
}
const heatOf = (r) => {
  const f = flagOf(r, FARM_ACTORS);
  const h = (r.stars || 0) * 8 + (r.forks || 0) * 5 + (r.prs || 0) * 5 +
    (r.issues || 0) * 3 + (r.releases || 0) * 15 + Math.min(r.pushes || 0, 50) +
    Math.min(r.actors || 0, 20) * 3;
  return f ? Math.max(1, Math.round(h * DEMOTE[f])) : h;
};

/** Stream one archive hour and aggregate. Returns raw aggregates (no API calls). */
function processHour(hourLabel, localFile) {
  return new Promise((resolve, reject) => {
    const url = `https://data.gharchive.org/${hourLabel}.json.gz`;
    const useLocal = localFile && fs.existsSync(localFile);
    console.log(`[pulse] ${useLocal ? 'using local' : 'downloading'} ${url} ...`);
    const src = useLocal ? Promise.resolve(fs.readFileSync(localFile)) : get(url);
    src.then((buf) => {
      console.log(`[pulse] got ${(buf.length / 1048576).toFixed(1)} MB compressed`);
      const gunzip = zlib.createGunzip();
      gunzip.end(buf);
      const readline = require('readline');
      const rl = readline.createInterface({ input: gunzip });

      const repos = new Map();
      const langs = new Map();
      const actors = new Map();
      const releases = [];
      let events = 0, parsed = 0;

      rl.on('line', (line) => {
        if (!line.trim()) return;
        parsed++;
        let e;
        try { e = JSON.parse(line); } catch { return; }
        if (!e || !e.repo || !e.repo.name) return;
        events++;
        const name = e.repo.name;
        let r = repos.get(name);
        if (!r) {
          r = { repo: name, stars: 0, forks: 0, issues: 0, prs: 0, releases: 0, pushes: 0, reviews: 0, events: 0, actors: 0, _as: null, actor_names: [], language: null, desc: null, url: `https://github.com/${name}` };
          repos.set(name, r);
        }
        r.events++;
        const a = e.actor ? (e.actor.login || '') : '';
        switch (e.type) {
          case 'WatchEvent': r.stars++; break;
          case 'ForkEvent': r.forks++; break;
          case 'IssuesEvent': r.issues++; break;
          case 'PullRequestEvent': r.prs++; break;
          case 'ReleaseEvent':
            r.releases++;
            const rel = (e.payload && e.payload.release) || {};
            releases.push({
              repo: name,
              release: rel.name || rel.tag_name || 'release',
              tag: rel.tag_name,
              desc: (rel.body || '').slice(0, 160),
              url: `https://github.com/${name}/releases`,
              actor: a,
            });
            break;
          case 'PushEvent': r.pushes++; break;
          case 'PullRequestReviewEvent':
          case 'PullRequestReviewCommentEvent':
          case 'IssueCommentEvent':
          case 'CommitCommentEvent':
            r.reviews++;
            break;
        }
        if (e.repo.language && e.repo.language !== 'null') r.language = e.repo.language;
        if (e.payload && e.payload.description && !r.desc) r.desc = String(e.payload.description).slice(0, 200);
        if (e.repo.language && e.repo.language !== 'null') {
          let l = langs.get(e.repo.language);
          if (!l) { l = { language: e.repo.language, stars: 0, forks: 0, events: 0, repos: 0 }; langs.set(e.repo.language, l); }
          l.events++;
        }
        if (a) {
          if (r.actor_names.length < 8 && !r.actor_names.includes(a)) r.actor_names.push(a);
          let ac = actors.get(a);
          if (!ac) { ac = { actor: a, events: 0, repos: new Set(), repoCounts: new Map() }; actors.set(a, ac); }
          ac.events++;
          ac.repos.add(name);
          ac.repoCounts.set(name, (ac.repoCounts.get(name) || 0) + 1);
          if (!r._as) r._as = new Set();
          r._as.add(a);
        }
      });

      rl.on('close', () => {
        for (const r of repos.values()) { r.actors = r._as ? r._as.size : 0; delete r._as; }
        for (const [lang, l] of langs) {
          for (const r of repos.values()) {
            if (r.language === lang) { l.stars += r.stars; l.forks += r.forks; l.repos++; }
          }
        }
        const actorList = [...actors.values()].map((ac) => {
          let topRepo = null, topN = 0;
          for (const [rn, n] of ac.repoCounts) { if (n > topN) { topN = n; topRepo = rn; } }
          return { actor: ac.actor, events: ac.events, repos: ac.repos.size, top_repo: topRepo, url: `https://github.com/${ac.actor}` };
        }).sort((a, b) => b.events - a.events).slice(0, 15);
        resolve({ repos, langs, releases, events, parsed, actorList });
      });
      rl.on('error', reject);
      gunzip.on('error', reject);
    }).catch(reject);
  });
}

/** Turn raw aggregates into ranked lists (pure, no network). */
function buildSnapshot(hourLabel, agg) {
  const { repos, langs, releases, events, actorList } = agg;
  const all = [...repos.values()];
  const hotSort = (a, b) => heatOf(b) - heatOf(a);
  const withFlag = (r, scoreKey) => Object.assign({ [scoreKey]: heatOf(r), flag: flagOf(r, FARM_ACTORS) }, r);
  const topHot = all.filter((r) => heatOf(r) > 0).sort(hotSort).slice(0, 25)
    .map((r) => withFlag(r, 'heat'));
  const topActive = all.sort((a, b) => b.events - a.events).slice(0, 25)
    .map((r) => Object.assign({ flag: flagOf(r, FARM_ACTORS) }, r));
  // Human signal: rank purely on human events (PRs, issues, stars, forks,
  // releases, reviews) — the push-bot noise is filtered out entirely.
  const humanScore = (r) => (r.prs || 0) * 4 + (r.issues || 0) * 3 + (r.stars || 0) * 5 +
    (r.forks || 0) * 3 + (r.releases || 0) * 8 + (r.reviews || 0) * 2;
  const topHuman = all.filter((r) => humanScore(r) > 0).sort((a, b) => humanScore(b) - humanScore(a)).slice(0, 25)
    .map((r) => Object.assign({ human: humanScore(r) }, r));
  const topLangs = [...langs.values()].sort((a, b) => (b.events * 4 + b.stars * 2 + b.forks) - (a.events * 4 + a.stars * 2 + a.forks)).slice(0, 15);
  // Bot watch: push-farms — repos flagged CONFIDENT push-bot by the v3 rules
  // (auto-generated names + zero human signal, known farm actors, or ≥25
  // zero-human pushes). No fixed push threshold for auto-gen farms: they adapt
  // it (40→30→25→24). Profile-based detection is the arms-race-proof version.
  const botWatch = all
    .filter((r) => flagOf(r, FARM_ACTORS) === 'push-bot')
    .sort((a, b) => b.pushes - a.pushes)
    .slice(0, 15)
    .map((r) => Object.assign({ bot_score: Math.round((r.pushes || 0) / Math.max(r.actors || 1, 1)) }, r));
  const totalPushes = all.reduce((n, r) => n + (r.pushes || 0), 0);
  // spam share uses ALL confident push-bot repos' pushes (not just top-15)
  const allFlagged = all.filter((r) => flagOf(r, FARM_ACTORS) === 'push-bot');
  const allSuspicious = all.filter((r) => flagOf(r, FARM_ACTORS) === 'push-loop');
  const spamPushes = allFlagged.reduce((n, r) => n + (r.pushes || 0), 0);
  // Farm-actor ledger: record actors AND owners behind confident push-bot
  // farms so future runs demote any repo they touch (repos rotate, actors
  // persist). v4: seeds from ALL flagged repos (push-bot + push-loop) — the
  // word-name farms (jvhoang, ugmoddev, loan96060-tech) must be tracked too,
  // and a push-loop that repeats for ≥2 hours escalates to push-bot via the
  // ledger. Shared platform bots (github-actions[bot] etc.) never seed —
  // farms launder pushes through them, and a shared bot must not demote the
  // repos it touches. The ≥2-distinct-hours gate stays: a real solo dev who
  // trips the zero-human rule once is NOT blacklisted forever; the profile
  // rules re-catch them per-hour anyway.
  for (const b of [...allFlagged, ...allSuspicious]) {
    const seedActors = (b.actor_names || []).map((a) => a.toLowerCase()).filter((a) => !isSharedBot(a));
    // Seed the repo OWNER only if it looks like the OPERATOR, not any org:
    //  · auto-generated name (betorj04, smithhoward5868) — bulk-account fingerprint
    //  · owner itself is among the pushing actors (LiamBruhin, ugmoddev, jvhoang)
    // A big org (PostHog, microsoft) whose CI-heavy side repo trips a flag must
    // NOT get its flagship repo blacklisted via owner evidence — PostHog/posthog
    // was falsely flagged exactly this way (a side repo seeded 'posthog', then
    // the 10-18-actor main repo matched known-farm-owner).
    const owner = String(b.repo || '').split('/')[0].toLowerCase();
    const ownerPushesItself = (b.actor_names || []).some((a) => a.toLowerCase() === owner);
    if (owner && !isSharedBot(owner) && (AUTONAME_OWNER.test(owner) || ownerPushesItself)) {
      seedActors.push(owner);
    }
    for (const a of seedActors) {
      let e = FARM_ACTORS.get(a);
      if (!e) { e = { hours: new Set(), lastSeen: hourLabel }; FARM_ACTORS.set(a, e); }
      e.hours.add(hourLabel);
      e.lastSeen = hourLabel;
    }
  }
  pruneFarmActors(hourLabel);
  // Demotion transparency: what got demoted out of the heat ranking this hour.
  const demoted = [...allFlagged, ...allSuspicious]
    .sort((a, b) => (b.pushes || 0) - (a.pushes || 0))
    .slice(0, 15)
    .map((r) => ({ repo: r.repo, flag: flagOf(r, FARM_ACTORS), pushes: r.pushes, actors: r.actors, human: (r.prs || 0) + (r.issues || 0) + (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + (r.reviews || 0), actor_names: r.actor_names }));
  return {
    as_of: `${hourLabel.slice(0, 10)}T${pad(Number(hourLabel.slice(11)))}:00:00Z`,
    hour: hourLabel,
    events,
    repos_seen: repos.size,
    prev_hour: null,
    vs_prev: null,
    top_hot: topHot,
    top_active: topActive,
    top_human: topHuman,
    top_actors: actorList,
    top_languages: topLangs,
    top_releases: releases.slice(0, 20),
    bot_watch: botWatch,
    push_spam_pct: totalPushes ? Math.round((spamPushes / totalPushes) * 1000) / 10 : 0,
    demoted,
    demoted_total: allFlagged.length,
    suspicious_total: allSuspicious.length,
  };
}

/** GitHub API enrichment: language + description for visible top repos. Cached. */
async function enrich(snapshot) {
  const META = path.join(SITE_DATA, 'repo_meta.json');
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(META, 'utf8')); } catch {}
  const want = new Map();
  const add = (list) => (list || []).forEach((r) => {
    if (r && r.repo && !meta[r.repo] && !want.has(r.repo)) want.set(r.repo, r);
  });
  add(snapshot.top_hot);
  add(snapshot.top_active);
  add(snapshot.top_releases);
  const toFetch = [...want.keys()].slice(0, 60);
  let fetched = 0, failed = 0, rateLimited = false;
  for (const name of toFetch) {
    if (rateLimited || fetched >= 60) break;
    try {
      const buf = await get(`https://api.github.com/repos/${name}`);
      const j = JSON.parse(buf.toString('utf8'));
      if (j.language || j.description) {
        meta[name] = { language: j.language || null, description: (j.description || '').slice(0, 200) || null, fetched_at: new Date().toISOString() };
        fetched++;
      }
    } catch (e) {
      if (/403|rate limit/i.test(e.message)) { rateLimited = true; break; }
      failed++;
      if (failed > 5) break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (fetched) fs.writeFileSync(META, JSON.stringify(meta));
  const apply = (list) => (list || []).forEach((r) => {
    const m = meta[r.repo];
    if (m) { r.language = r.language || m.language; if (!r.desc && m.description) r.desc = m.description; }
  });
  apply(snapshot.top_hot);
  apply(snapshot.top_active);
  apply(snapshot.top_releases);
  // Rebuild language aggregates from enriched top repos — the GH Archive has
  // no repo.language field in this dataset, so API enrichment is the only
  // language source. Rank by number of top repos per language.
  const langAgg = new Map();
  for (const r of [...(snapshot.top_hot || []), ...(snapshot.top_active || [])]) {
    if (!r.language) continue;
    let l = langAgg.get(r.language);
    if (!l) { l = { language: r.language, stars: 0, forks: 0, repos: 0, events: 0 }; langAgg.set(r.language, l); }
    l.stars += r.stars || 0; l.forks += r.forks || 0; l.repos++; l.events += r.events || 0;
  }
  snapshot.top_languages = [...langAgg.values()]
    .sort((a, b) => (b.repos * 10 + b.events) - (a.repos * 10 + a.events)).slice(0, 15);
  console.log(`[pulse] enrichment: fetched ${fetched}, rateLimited=${rateLimited}, cache=${Object.keys(meta).length}`);
  return snapshot;
}

/** Attach rank deltas vs the previous hour's snapshot. */
function applyTrends(snapshot, prev) {
  if (!prev) return;
  const hotRanks = new Map((prev.top_hot || []).map((r, i) => [r.repo, i]));
  const actRanks = new Map((prev.top_active || []).map((r, i) => [r.repo, i]));
  const humanRanks = new Map((prev.top_human || []).map((r, i) => [r.repo, i]));
  const trendFor = (ranks, repo, idx) => {
    const p = ranks.get(repo);
    if (p === undefined) return { prev_rank: null, rank_delta: null, trend: 'new' };
    const delta = p - idx; // >0 moved up
    return { prev_rank: p, rank_delta: delta, trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same' };
  };
  (snapshot.top_hot || []).forEach((r, i) => Object.assign(r, trendFor(hotRanks, r.repo, i)));
  (snapshot.top_active || []).forEach((r, i) => Object.assign(r, trendFor(actRanks, r.repo, i)));
  (snapshot.top_human || []).forEach((r, i) => Object.assign(r, trendFor(humanRanks, r.repo, i)));
  snapshot.prev_hour = prev.hour;
  snapshot.vs_prev = {
    events_pct: prev.events ? Math.round(((snapshot.events - prev.events) / prev.events) * 1000) / 10 : null,
    repos_pct: prev.repos_seen ? Math.round(((snapshot.repos_seen - prev.repos_seen) / prev.repos_seen) * 1000) / 10 : null,
  };
}

/** Compact Telegram/newsletter-ready digest. */
function buildDigest(s) {
  const hot = (s.top_hot || []).slice(0, 5).map((r) => {
    const t = r.trend === 'up' ? ` ▲${r.rank_delta}` : r.trend === 'new' ? ' 🆕' : r.trend === 'down' ? ` ▼${-r.rank_delta}` : '';
    return `  ${r.repo} — heat ${r.heat} (${r.pushes} pushes, ${r.prs} PRs, +${r.stars}★, ${r.actors || 0}👥)${t}`;
  }).join('\n');
  const actor = (s.top_actors || [])[0];
  const lang = (s.top_languages || [])[0];
  const rel = s.top_releases || [];
  const human = (s.top_human || [])[0];
  const bots = s.bot_watch || [];
  const bot0 = bots[0];
  const nets = s.botnet_watch || [];
  const net0 = nets[0];
  const dem = s.demoted || [];
  const lines = [
    `📡 GITHUB PULSE — hour ${s.hour}`,
    `${s.events.toLocaleString()} events · ${s.repos_seen.toLocaleString()} repos`,
    ...(s.vs_prev ? [`vs ${s.prev_hour}: ${s.vs_prev.events_pct > 0 ? '+' : ''}${s.vs_prev.events_pct}% events`] : []),
    '',
    '🔥 HOTTEST:',
    hot,
    '',
    `👤 busiest: ${actor ? `${actor.actor} (${actor.events} events)` : 'n/a'}`,
    `🧠 human top: ${human ? `${human.repo} (${human.prs || 0} PRs, ${human.issues || 0} issues, +${human.stars || 0}★)` : 'n/a'}`,
    `🗣 top language: ${lang ? lang.language : 'n/a'}`,
    `🚀 releases: ${rel.length ? rel.length : 0} (${rel[0] ? rel[0].repo + ' ' + (rel[0].tag || '') : ''})`,
    `🤖 bot watch: ${bots.length} push-farms · ${s.push_spam_pct != null ? s.push_spam_pct : 'n/a'}% of all pushes are spam${bot0 ? ` — top: ${bot0.repo} (${bot0.pushes} pushes, ${bot0.actors}👥)` : ''}`,
    ...(nets.length ? [`🧟 botnet watch: ${nets.length} persistent farms (${nets[0].hours_seen}+ hrs) — top: ${net0.repo} (seen ${net0.hours_seen}h, ${net0.max_pushes} pushes/hr)`] : []),
    ...(dem.length ? [`🚫 demoted ${s.demoted_total != null ? s.demoted_total : dem.length} farm repos${s.suspicious_total ? ` (+${s.suspicious_total} suspicious push-loops)` : ''} from heat — top: ${dem[0].repo} (${dem[0].pushes} pushes, ${dem[0].actors}👥, ${dem[0].flag})`] : []),
  ];
  return {
    hour: s.hour,
    as_of: s.as_of,
    events: s.events,
    repos_seen: s.repos_seen,
    vs_prev: s.vs_prev,
    hottest: (s.top_hot || []).slice(0, 5).map((r) => ({ repo: r.repo, heat: r.heat, pushes: r.pushes, stars: r.stars, actors: r.actors, trend: r.trend, rank_delta: r.rank_delta })),
    top_actor: actor || null,
    top_language: lang ? lang.language : null,
    releases: rel.length,
    bot_farms: bots.length,
    push_spam_pct: s.push_spam_pct,
    top_bot: bot0 ? { repo: bot0.repo, pushes: bot0.pushes, actors: bot0.actors } : null,
    botnets: nets.length,
    top_botnet: net0 ? { repo: net0.repo, hours_seen: net0.hours_seen, max_pushes: net0.max_pushes } : null,
    demoted_total: s.demoted_total != null ? s.demoted_total : (dem.length || 0),
    suspicious_total: s.suspicious_total != null ? s.suspicious_total : 0,
    text: lines.join('\n'),
  };
}

/** Botnet watch: which push-farms are persistent, not one-off noise.
 *  Scans the last N history hours and counts how often each farm appears
 *  in bot_watch. Persistent farms (>=3 of last 12h) are true botnets —
 *  the same repo pushing hundreds of times, hour after hour.
 */
function buildBotnetWatch(cur, lookbackHours = 12, minAppearances = 3) {
  const files = readHistoryIndex()
    .sort((a, b) => hourNum(a.replace(/\.json$/, '')) - hourNum(b.replace(/\.json$/, '')))
    .filter((f) => f !== `${cur.hour}.json`)
    .slice(-lookbackHours);
  const seen = new Map(); // repo -> {hours: Set<hour>, lastPushes, lastActors}
  for (const f of files) {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), 'utf8')); } catch { continue; }
    for (const b of snap.bot_watch || []) {
      let e = seen.get(b.repo);
      if (!e) { e = { hours: new Set(), lastPushes: 0, lastActors: 0, first_seen: snap.hour, last_seen: snap.hour }; seen.set(b.repo, e); }
      e.hours.add(snap.hour);
      if (b.pushes > e.lastPushes) { e.lastPushes = b.pushes; e.lastActors = b.actors; e.last_seen = snap.hour; }
    }
  }
  // merge current hour
  for (const b of cur.bot_watch || []) {
    let e = seen.get(b.repo);
    if (!e) { e = { hours: new Set(), lastPushes: 0, lastActors: 0, first_seen: cur.hour, last_seen: cur.hour }; seen.set(b.repo, e); }
    e.hours.add(cur.hour);
    if (b.pushes > e.lastPushes) { e.lastPushes = b.pushes; e.lastActors = b.actors; e.last_seen = cur.hour; }
  }
  const botnets = [...seen.entries()]
    .filter(([, e]) => e.hours.size >= minAppearances)
    .map(([repo, e]) => ({
      repo,
      hours_seen: e.hours.size,
      window_hours: files.length + 1,
      first_seen: e.first_seen,
      last_seen: e.last_seen,
      max_pushes: e.lastPushes,
      max_actors: e.lastActors,
      url: `https://github.com/${repo}`,
    }))
    .sort((a, b) => b.hours_seen - a.hours_seen)
    .slice(0, 15);
  // annotate current bot_watch entries with persistence info
  for (const b of cur.bot_watch || []) {
    const e = seen.get(b.repo);
    if (e) { b.hours_seen = e.hours.size; b.first_seen = e.first_seen; }
  }
  return botnets;
}

/** RSS 2.0 feed of hourly digests — lets anyone subscribe to the radar. */
function writeRss() {
  const files = readHistoryIndex()
    .sort((a, b) => hourNum(a.replace(/\.json$/, '')) - hourNum(b.replace(/\.json$/, '')))
    .slice(-24).reverse();
  const items = files.map((f) => {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), 'utf8')); } catch { return null; }
    const d = buildDigest(snap);
    const date = new Date(d.as_of);
    const rfc = isNaN(date) ? new Date().toUTCString() : date.toUTCString();
    const desc = d.text.split('\n').map((l) =>
      l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('<br/>');
    return `    <item>
      <title>GitHub Pulse — hour ${escXml(d.hour)}</title>
      <link>https://github-pulse.surge.sh/</link>
      <guid isPermaLink="false">github-pulse-${escXml(d.hour)}</guid>
      <pubDate>${rfc}</pubDate>
      <description>${desc}</description>
    </item>`;
  }).filter(Boolean);
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>GitHub Pulse — hourly radar</title>
    <link>https://github-pulse.surge.sh/</link>
    <description>The busiest hour on GitHub, ranked: hottest repos, human signal, languages, releases and bot farms — fresh from the GH Archive every hour.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>
`;
  fs.writeFileSync(path.join(SITE_DATA, 'digest.xml'), feed);
  console.log(`[pulse] wrote digest.xml (${items.length} items)`);
}

function escXml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function readHistoryIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(HIST_DIR, 'index.json'), 'utf8')).files || []; }
  catch { return []; }
}

function writeHistoryFile(snap) {
  fs.writeFileSync(path.join(HIST_DIR, `${snap.hour}.json`), JSON.stringify(snap));
  const files = fs.readdirSync(HIST_DIR).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  fs.writeFileSync(path.join(HIST_DIR, 'index.json'), JSON.stringify({ files }));
}

async function main() {
  const explicitHour = process.argv[2];
  const localFile = process.argv[3];
  const latest = explicitHour || await findLatestHour();
  console.log(`[pulse] latest complete hour: ${latest}`);

  // Load the persistent farm-actor ledger (repos rotate, actors persist).
  const FARM_FILE = path.join(SITE_DATA, 'farm_actors.json');
  try {
    const obj = JSON.parse(fs.readFileSync(FARM_FILE, 'utf8'));
    if (obj && typeof obj === 'object') {
      // Scrub shared platform bots that polluted earlier versions of the
      // ledger (github-actions[bot] got blacklisted because farms push via
      // Actions) — a shared bot must never demote the repos it touches.
      let scrubbed = 0;
      FARM_ACTORS = new Map(Object.entries(obj)
        .filter(([a]) => {
          if (isSharedBot(a.toLowerCase())) { scrubbed++; return false; }
          return true;
        })
        .map(([a, e]) => [a.toLowerCase(), { hours: new Set(e.hours || []), lastSeen: e.lastSeen || latest }]));
      if (scrubbed) console.log(`[pulse] scrubbed ${scrubbed} shared bot accounts from farm ledger`);
      pruneFarmActors(latest);
      console.log(`[pulse] loaded ${FARM_ACTORS.size} known farm actors (${[...FARM_ACTORS.values()].filter((e) => e.hours.size >= FARM_ACTOR_MIN_HOURS).length} confirmed)`);
    }
  } catch {}
  // Corroboration layer: owners with ≥2 bot_watch appearances in the last 24h
  // are confirmed repeat offenders — real-looking names get the push-bot flag.
  rebuildConfirmedFarmOwners(latest);
  console.log(`[pulse] ${CONFIRMED_FARM_OWNERS.size} confirmed farm owners from history`);

  const known = new Set(readHistoryIndex().map((f) => f.replace(/\.json$/, '')));

  // Backfill plan: walk backward from the latest complete hour, collecting
  // missing hours until we hit the earliest known hour or the start of today
  // (or MAX_BACKFILL missing hours). Known hours in between are skipped, so
  // gaps in the middle of history get filled, not just the newest hour.
  const earliestKnown = known.size ? [...known].sort((a, b) => hourNum(a) - hourNum(b))[0] : null;
  const earliestKnownNum = earliestKnown ? hourNum(earliestKnown) : null;
  const todayStartNum = hourNum(latest.slice(0, 10) + '-0');
  const missing = [];
  let cur = latest;
  while (missing.length < MAX_BACKFILL) {
    if (hourNum(cur) < todayStartNum) break;
    if (earliestKnownNum !== null && hourNum(cur) <= earliestKnownNum && known.has(cur)) break;
    if (!known.has(cur)) missing.unshift(cur);
    cur = prevHourLabel(cur);
  }
  if (missing.length) console.log(`[pulse] backfilling missing hours: ${missing.join(', ')}`);

  let prevSnap = null;
  // Cached meta (repo_meta.json) can enrich backfilled hours without API calls.
  let META_CACHE = {};
  try { META_CACHE = JSON.parse(fs.readFileSync(path.join(SITE_DATA, 'repo_meta.json'), 'utf8')); } catch {}
  const applyCachedMeta = (snap) => {
    const apply = (list) => (list || []).forEach((r) => {
      const m = META_CACHE[r.repo];
      if (m) { r.language = r.language || m.language; if (!r.desc && m.description) r.desc = m.description; }
    });
    apply(snap.top_hot); apply(snap.top_active); apply(snap.top_releases);
  };
  // 1) Backfill missing hours — history-only (no API enrichment, keeps it fast)
  for (const hour of missing) {
    const agg = await processHour(hour, null);
    const snap = buildSnapshot(hour, agg);
    applyCachedMeta(snap);
    console.log(`[pulse] history-only for ${hour} (events=${snap.events}, demoted=${snap.demoted_total})`);
    writeHistoryFile(snap);
    prevSnap = snap;
  }
  // 2) Always (re)process the latest complete hour → live snapshot + digest.
  //    The latest hour may already be in history (e.g. this run) but must be
  //    re-enriched and re-ranked with the freshest logic each run.
  const agg = await processHour(latest, localFile);
  const snap = buildSnapshot(latest, agg);
  await enrich(snap);
  // If the last backfilled hour == latest, the backfill just wrote the same
  // hour we're about to reprocess — fall back to the true previous hour.
  const prevForTrends = (prevSnap && prevSnap.hour !== latest) ? prevSnap : (() => {
    const prevHour = prevHourLabel(latest);
    try { return JSON.parse(fs.readFileSync(path.join(HIST_DIR, `${prevHour}.json`), 'utf8')); }
    catch { return null; }
  })();
  applyTrends(snap, prevForTrends);
  fs.mkdirSync(SITE_DATA, { recursive: true });
  // Botnet watch: scan the last 12 history hours (incl. this one, once it's
  // written below it joins the next run's window) for persistent farms.
  snap.botnet_watch = buildBotnetWatch(snap);
  fs.writeFileSync(path.join(SITE_DATA, 'snapshot.json'), JSON.stringify(snap));
  // Persist the farm-actor ledger for next run (serialize hours as arrays).
  if (FARM_ACTORS.size) {
    const out = {};
    for (const [a, e] of FARM_ACTORS) out[a] = { hours: [...e.hours].sort(), lastSeen: e.lastSeen };
    fs.writeFileSync(FARM_FILE, JSON.stringify(out));
  }
  const digest = buildDigest(snap);
  fs.writeFileSync(path.join(SITE_DATA, 'digest.json'), JSON.stringify(digest));
  writeRss();
  console.log(`[pulse] wrote snapshot.json + digest.json (events=${snap.events}, repos=${snap.repos_seen})`);
  console.log(`[pulse] hottest: ${(snap.top_hot[0] || {}).repo} (heat ${(snap.top_hot[0] || {}).heat})`);
  console.log('[pulse] digest:\n' + digest.text);
  writeHistoryFile(snap);
  if (!missing.length) console.log('[pulse] no missing hours — latest reprocessed only');
}

main().catch((e) => { console.error('[pulse] FAILED:', e.message); process.exit(1); });
