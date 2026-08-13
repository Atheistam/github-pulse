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
const MAX_BACKFILL = Number(process.env.MAX_BACKFILL || 12); // max missing hours to fetch in one run

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
// v5: farms adapted — names now come as word+digits+[hyphen-suffix]
// (quoctuan21112009-maker, johnschwinghamer94-lab, loan96060-tech, 206+
// ledger entries). Optional -suffix keeps the old bare pattern working.
// GitHub-suggested names (gentle-wren891020) are deliberately NOT matched —
// they're also given to real new users; those farms get caught via
// ownerPushesItself seeding + push-loop rules instead.
const AUTONAME_OWNER = /^[a-z]+[0-9]{2,}[a-z]*(?:-[a-z0-9]+)?$/; // smithhoward5868, quoctuan21112009-maker
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
// v5: SELF-PR ADAPTATION — farms now open PRs/issues on their own repos to
// fake human signal (quoctuan21112009-maker/pull-request: 4 PRs, 45 pushes,
// all by the same 1 actor). A PR/issue only counts as human signal if
// authored by someone OTHER than the pushers. Shared bots stay human-ish:
// docker-hardened-images/log is a real project whose dhi-app[bot] opens the
// PRs — a [bot] account is legit automation, never a farm impersonation.
// v5.1: the self-test now compares against PUSH actors only (tracked per repo
// as push_actors during aggregation). v5 compared against actor_names — which
// contains actors of ALL event types (capped at 8) — so any repo whose PR
// authors merely APPEAR among its actors looked "self-authored". That
// mis-flagged mass-contribution repos (EaseMotion-css: 38 real PRs from 5
// distinct contributors zeroed as fake) and the outcome depended on
// actor_names truncation order. The self-flags are precomputed at
// aggregation close (r.selfPR / r.selfISS).
function prsAreSelfFlag(r) {
  return !!r.selfPR;
}
function issAreSelfFlag(r) {
  return !!r.selfISS;
}
// v5.4: BOT REVIEWS ARE NOT HUMAN SIGNAL — review/comment events from shared
// bots (renovate[bot] approving its own dependency bumps, release-manager bots
// commenting on their release PRs) are automation churn, same as bot PRs.
// TimSchoenle/actions escaped the v5.3 bot-loop rule on a single review from
// one of its 4 all-bot actors. Self-reviews (authored by the repo's own
// pushers, r.selfREV) are fake signal and zeroed too. Reviews count ONLY
// when authored by an outside human.
function humanReviews(r) {
  if (r.selfREV) return 0;
  return (r.review_actors || []).some((a) => !isSharedBot(a)) ? (r.reviews || 0) : 0;
}
function flagOf(r, farmActors = null) {
  const name = String(r.repo || '').toLowerCase();
  // rawHuman excludes self-authored PRs/issues (fake signal, doesn't rescue a push loop)
  const rawHuman = (prsAreSelfFlag(r) ? 0 : (r.prs || 0)) + (issAreSelfFlag(r) ? 0 : (r.issues || 0)) +
    (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + humanReviews(r);
  const pushes = r.pushes || 0;
  const actors = r.actors || 0;
  const owner = name.split('/')[0];
  const ownerAutoGen = AUTONAME_OWNER.test(owner);
  const autoGen = ownerAutoGen && AUTONAME_REPO.test(name.split('/')[1] || '');
  const zeroHuman = rawHuman === 0;
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
  //  · v5: auto-gen OWNER + high-volume pure push loop even when the repo name
  //    is generic (farms rotate repo names too now: pull-request, list-check,
  //    api-server). Real repos owned by digit-suffixed users have human
  //    engagement; a 25+/hr zero-human push loop is bot behavior regardless.
  //  · high-volume zero-human churner (≥25 pushes, ≤2 actors) with a
  //    real-looking name — ONLY confident if corroborated (known farm actor,
  //    farm-owner history, or auto-gen name). Otherwise it's a 'push-loop':
  //    demoted from heat, but not publicly called a bot, so a solo dev's
  //    automated data pipeline isn't shamed as spam.
  if (autoGen && zeroHuman && pushes >= 5 && actors <= 2) return 'push-bot';
  if (ownerAutoGen && zeroHuman && pushes >= 25 && actors <= 2) return 'push-bot';
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
  // v5.1: ISSUE-LOOP ADAPTATION — with push-heavy farms demoted, operators
  // switched to faking human signal with ZERO pushes: the operator opens 5-16
  // issues/PRs on their own fresh repo (meronrudy/usaBOXING_repo: 16 self-
  // issues → #3 hottest; spcsorg/daylens: 14 → #4). Every push rule needs
  // pushes, so a pure self-signal loop sailed past them and ranked on heat
  // (issues ×3). Fingerprint: ≥5 PRs+issues, ≤2 pushes, zero stars/forks/
  // releases, and ALL non-bot PR/issue authors (≤2 of them) are the repo's
  // only non-bot actors — nobody outside the loop touched it. Demoted as
  // suspicious, never called a bot (a solo dev triaging their own repo opens
  // 1-2 issues/hour, never 5+ with zero other activity).
  const sigActors = [...new Set([...(r.pr_actors || []), ...(r.issue_actors || [])])].filter((a) => !isSharedBot(a));
  const nonBotActors = (r.actor_names || []).filter((a) => !isSharedBot(a));
  if (sigActors.length > 0 && sigActors.length <= 2 && nonBotActors.length <= 2 &&
      sigActors.every((a) => nonBotActors.includes(a)) &&
      (r.prs || 0) + (r.issues || 0) >= 5 && pushes <= 2 &&
      (r.stars || 0) + (r.forks || 0) + (r.releases || 0) === 0) {
    return 'issue-loop';
  }
  if (/mergequeue|merge-queue|merge-demo|octo-org|githubtraining|sandbox|playground|hello-world|ci-demo|test-repo/.test(name) &&
      pushes >= 10 && actors <= 4 && rawHuman <= 2) return 'ci-demo';
  // v5.3: BOT-LOOP — the hottest chart's blind spot. A repo whose ONLY
  // activity is shared-platform-bot pushes (release/CI automation) ranks on
  // pure churn: TimSchoenle/actions topped an hour with 55 pushes from 3
  // [bot] accounts and zero human touch. Demoted ×0.3, badged 🤖, never
  // called a farm, never seeded (shared bots can't seed; a real owner with
  // any non-bot actor is untouched). Also catches farms that launder pushes
  // through GitHub Actions under a clean-looking owner — bots only, can't rank.
  // PRs/issues count as human signal ONLY if authored by a non-bot (a PR from
  // automatic-release-manager[bot] is still automation churn), and the
  // per-actor check guards against actor_names truncation on crowded repos.
  if (nonBotActors.length === 0 && pushes >= 10) {
    const humanPr = (r.pr_actors || []).some((a) => !isSharedBot(a));
    const humanIss = (r.issue_actors || []).some((a) => !isSharedBot(a));
    const humanSig = (prsAreSelfFlag(r) ? 0 : (humanPr ? (r.prs || 0) : 0)) +
      (issAreSelfFlag(r) ? 0 : (humanIss ? (r.issues || 0) : 0)) +
      (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + humanReviews(r);
    if (humanSig === 0) return 'bot-loop';
  }
  // v5.2: STAR-BOMB RADAR — with pushes, PRs and issues all demoted (×0.05-0.3),
  // stars (×8) are the last untaxed heat vector, so star-bombing is the obvious
  // next adaptation. A repo whose ONLY activity is stars looks identical to a
  // viral launch in a single archive hour, so the discriminator is the
  // WATCHERS, not the repo:
  //   · 'star-only' (informational, NOT demoted): ≥3 pure-lurker stars, zero
  //     other activity. Surfaced in the star_radar panel — a legit repo that
  //     hits HN/Reddit has exactly this profile for one hour.
  //   · 'star-loop' (suspicious, ×0.3): star-only profile PLUS one of
  //     (a) ≥2 watchers who co-starred ≥2 other bare repos this hour — the
  //         correlated-lurker cluster is the farm fingerprint (organic traffic
  //         doesn't share the same watcher pool across multiple empty repos),
  //     (b) any confirmed known-farm actor among the watchers, or
  //     (c) ≥5 pure-lurker stars on a repo that has NEVER appeared in any prior
  //         hour's top lists (a bomb appears out of nowhere, then stops).
  // A real viral repo survives the 0.3× shave (it tops charts with 30+ stars);
  // a farm can't afford 5-20 fresh accounts per bomb per hour.
  if (r._bare) {
    if (r._coStarCount >= 2 || r._knownFarmStars >= 1) return 'star-loop';
    if (r._starOnlyCount >= 5 && !KNOWN_REPOS.has(String(r.repo))) return 'star-loop';
    if (r._starOnlyCount >= 3) return 'star-only';
  }
  return null;
}
const DEMOTE = { 'push-bot': 0.05, 'push-loop': 0.3, 'ci-demo': 0.1, 'issue-loop': 0.3, 'star-loop': 0.3, 'star-only': 1, 'bot-loop': 0.3 };
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
// v5.2: repos seen in ANY prior hour's top lists (top_hot/top_active/top_human/
// demoted/bot_watch). Used by the star-bomb radar: a star-only repo that has
// never appeared before is a bomb shape; one with prior history is a project
// that was already visible. Rebuilt once per run from history files.
let KNOWN_REPOS = new Set();
const FARM_ACTOR_MIN_HOURS = 2;
const FARM_ACTOR_TTL_HOURS = 48;
function pruneFarmActors(curHour) {
  for (const [a, e] of FARM_ACTORS) {
    if (hourNum(curHour) - hourNum(e.lastSeen) > FARM_ACTOR_TTL_HOURS) FARM_ACTORS.delete(a);
  }
}
// v5.2: rebuild KNOWN_REPOS from ALL history files' top lists — used by the
// star-bomb radar's "appeared out of nowhere" test. Cheap: ~40 files × ~75
// repos per file.
function rebuildKnownRepos() {
  KNOWN_REPOS = new Set();
  const files = readHistoryIndex().filter((f) => f !== 'index.json');
  for (const f of files) {
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(HIST_DIR, f), 'utf8')); } catch { continue; }
    for (const list of [snap.top_hot, snap.top_active, snap.top_human, snap.demoted, snap.bot_watch]) {
      for (const b of list || []) if (b && b.repo) KNOWN_REPOS.add(String(b.repo));
    }
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
  // v5.1: self-authored PRs/issues are fake signal — never count them toward
  // heat (a farm opening its own issues must not rank #3 hottest).
  const prs = prsAreSelfFlag(r) ? 0 : (r.prs || 0);
  const iss = issAreSelfFlag(r) ? 0 : (r.issues || 0);
  const h = (r.stars || 0) * 8 + (r.forks || 0) * 5 + prs * 5 + iss * 3 +
    (r.releases || 0) * 15 + Math.min(r.pushes || 0, 50) +
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
          r = { repo: name, stars: 0, forks: 0, issues: 0, prs: 0, releases: 0, pushes: 0, reviews: 0, events: 0, actors: 0, _as: null, actor_names: [], _prActors: new Set(), _issActors: new Set(), _revActors: new Set(), _pushActors: new Set(), _starActors: new Set(), language: null, desc: null, url: `https://github.com/${name}` };
          repos.set(name, r);
        }
        r.events++;
        const a = e.actor ? (e.actor.login || '') : '';
        switch (e.type) {
          case 'WatchEvent': r.stars++; if (a) r._starActors.add(a); break;
          case 'ForkEvent': r.forks++; break;
          case 'IssuesEvent': r.issues++; if (a) r._issActors.add(a); break;
          case 'PullRequestEvent': r.prs++; if (a) r._prActors.add(a); break;
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
          case 'PushEvent': r.pushes++; if (a) r._pushActors.add(a); break;
          case 'PullRequestReviewEvent':
          case 'PullRequestReviewCommentEvent':
          case 'IssueCommentEvent':
          case 'CommitCommentEvent':
            r.reviews++;
            if (a) r._revActors.add(a);
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
          if (!ac) { ac = { actor: a, events: 0, repos: new Set(), repoCounts: new Map(), nonWatch: 0, starRepos: new Set() }; actors.set(a, ac); }
          ac.events++;
          ac.repos.add(name);
          ac.repoCounts.set(name, (ac.repoCounts.get(name) || 0) + 1);
          // v5.2 star-bomb radar: track who ONLY stars (watch-only lurkers are
          // the raw material of a star-bomb — a repo whose entire signal is
          // stars from accounts that do nothing else all hour).
          if (e.type === 'WatchEvent') ac.starRepos.add(name); else ac.nonWatch++;
          if (!r._as) r._as = new Set();
          r._as.add(a);
        }
      });

      rl.on('close', () => {
        // v5.2 star-bomb radar stats: identify watch-only actors (their ONLY
        // activity this hour is starring) and bare repos (stars but zero
        // pushes/PRs/issues/releases/reviews). A watch-only actor that starred
        // ≥2 bare repos in one hour is a co-starring cluster member — the
        // farm fingerprint. Shared bots never count as watchers.
        const bareRepos = new Set();
        for (const r of repos.values()) {
          if ((r.stars || 0) >= 3 && !(r.pushes || 0) && !(r.prs || 0) && !(r.issues || 0) &&
              !(r.releases || 0) && !(r.reviews || 0)) bareRepos.add(r.repo);
        }
        const watchOnly = new Set();
        for (const ac of actors.values()) if (ac.events > 0 && ac.nonWatch === 0) watchOnly.add(ac.actor);
        const coStar = new Set();
        for (const ac of actors.values()) {
          if (ac.events > 0 && ac.nonWatch === 0) {
            let bareStars = 0;
            for (const rn of ac.starRepos) if (bareRepos.has(rn)) bareStars++;
            if (bareStars >= 2) coStar.add(ac.actor);
          }
        }
        for (const r of repos.values()) {
          r.actors = r._as ? r._as.size : 0;
          const pushActors = r._pushActors || new Set();
          // v5.1 self-flags: a PR/issue is fake signal only if authored by the
          // repo's own PUSHERS (the farm operator pushes AND opens its own
          // PRs). Contributors who don't push (mass-contribution repos) are
          // real humans and must count.
          const nonBotPr = [...(r._prActors || [])].filter((a) => !isSharedBot(a));
          const nonBotIss = [...(r._issActors || [])].filter((a) => !isSharedBot(a));
          r.selfPR = pushActors.size > 0 && nonBotPr.length > 0 && nonBotPr.every((a) => pushActors.has(a));
          r.selfISS = pushActors.size > 0 && nonBotIss.length > 0 && nonBotIss.every((a) => pushActors.has(a));
          // v5.4: self-REVIEWS are fake signal too — a review/comment authored
          // by the repo's own pushers (Wonder0208/androidtest: 42 pushes + 1
          // self-review was the ONLY thing keeping it out of the zero-human
          // push-bot profile). Mirror the selfPR/selfISS treatment.
          const nonBotRev = [...(r._revActors || [])].filter((a) => !isSharedBot(a));
          r.selfREV = pushActors.size > 0 && nonBotRev.length > 0 && nonBotRev.every((a) => pushActors.has(a));
          r.pr_actors = [...(r._prActors || [])]; delete r._prActors;
          r.issue_actors = [...(r._issActors || [])]; delete r._issActors;
          r.review_actors = [...(r._revActors || [])]; delete r._revActors;
          // v5.2 star-bomb radar per-repo stats (consumed by flagOf).
          r._bare = bareRepos.has(r.repo);
          r._starOnlyCount = r._bare ? [...(r._starActors || [])].filter((a) => watchOnly.has(a) && !isSharedBot(a)).length : 0;
          r._coStarCount = r._bare ? [...(r._starActors || [])].filter((a) => coStar.has(a) && !isSharedBot(a)).length : 0;
          r._knownFarmStars = r._bare ? [...(r._starActors || [])].filter((a) => {
            const e = FARM_ACTORS.get(a.toLowerCase());
            return e && e.hours.size >= FARM_ACTOR_MIN_HOURS;
          }).length : 0;
          delete r._starActors;
          delete r._pushActors;
          delete r._as;
        }
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
        resolve({ repos, langs, releases, events, parsed, actorList, starStats: { watchOnly: watchOnly.size, coStar: coStar.size, bareRepos: bareRepos.size } });
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
  // v5: also exclude self-PR farms (fake human signal authored by the pusher).
  const humanScore = (r) => (prsAreSelfFlag(r) ? 0 : (r.prs || 0)) * 4 + (issAreSelfFlag(r) ? 0 : (r.issues || 0)) * 3 +
    (r.stars || 0) * 5 + (r.forks || 0) * 3 + (r.releases || 0) * 8 + humanReviews(r) * 2;
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
  const allSuspicious = all.filter((r) => ['push-loop', 'issue-loop', 'star-loop'].includes(flagOf(r, FARM_ACTORS)));
  const allBotLoop = all.filter((r) => flagOf(r, FARM_ACTORS) === 'bot-loop');
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
  for (const b of [...allFlagged, ...allSuspicious, ...allBotLoop]) {
    const fl = flagOf(b, FARM_ACTORS);
    const seedActors = [];
    if (fl === 'star-loop') {
      // Star-bombs are run by WATCH-ONLY lurker accounts whose only other
      // activity is starring — seeding them would blacklist accounts that
      // star thousands of legit repos and demote anything they touch. Only
      // the OWNER is seeded, and only if it looks bulk-created.
      const owner = String(b.repo || '').split('/')[0].toLowerCase();
      if (owner && !isSharedBot(owner) && AUTONAME_OWNER.test(owner)) seedActors.push(owner);
    } else {
      seedActors.push(...(b.actor_names || []).map((a) => a.toLowerCase()).filter((a) => !isSharedBot(a)));
    }
    // Seed the repo OWNER only if it looks like the OPERATOR, not any org:
    //  · auto-generated name (betorj04, smithhoward5868) — bulk-account fingerprint
    //  · owner itself is among the pushing actors (LiamBruhin, ugmoddev, jvhoang)
    // A big org (PostHog, microsoft) whose CI-heavy side repo trips a flag must
    // NOT get its flagship repo blacklisted via owner evidence — PostHog/posthog
    // was falsely flagged exactly this way (a side repo seeded 'posthog', then
    // the 10-18-actor main repo matched known-farm-owner).
    if (fl !== 'star-loop') {
      const owner = String(b.repo || '').split('/')[0].toLowerCase();
      const ownerPushesItself = (b.actor_names || []).some((a) => a.toLowerCase() === owner);
      if (owner && !isSharedBot(owner) && (AUTONAME_OWNER.test(owner) || ownerPushesItself)) {
        seedActors.push(owner);
      }
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
  const demoted = [...allFlagged, ...allSuspicious, ...allBotLoop]
    .sort((a, b) => (b.pushes || 0) - (a.pushes || 0))
    .slice(0, 15)
    .map((r) => ({ repo: r.repo, flag: flagOf(r, FARM_ACTORS), pushes: r.pushes, actors: r.actors, human: (prsAreSelfFlag(r) ? 0 : (r.prs || 0)) + (issAreSelfFlag(r) ? 0 : (r.issues || 0)) + (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + (r.reviews || 0), actor_names: r.actor_names }));
  // Farm adaptation probe — farms duck the ≤2-actor rule by splitting pushes
  // across 3-6 fresh accounts (predicted next adaptation). Bucket
  // zero-human push-heavy repos by actor count every hour so a shift toward
  // multi-actor farms shows up immediately, not after they top the charts.
  // v5: self-PR farms count as zero-human here too (their "human" is fake).
  const probe = (min, max) => {
    const bucket = all.filter((r) =>
      (r.pushes || 0) >= 10 &&
      (prsAreSelfFlag(r) ? 0 : (r.prs || 0)) + (issAreSelfFlag(r) ? 0 : (r.issues || 0)) +
        (r.stars || 0) + (r.forks || 0) + (r.releases || 0) + (r.reviews || 0) === 0 &&
      r.actors >= min && r.actors <= max);
    return {
      repos: bucket.length,
      pushes: bucket.reduce((n, r) => n + (r.pushes || 0), 0),
      top: bucket.sort((a, b) => (b.pushes || 0) - (a.pushes || 0)).slice(0, 5)
        .map((r) => ({ repo: r.repo, pushes: r.pushes, actors: r.actors })),
    };
  };
  const farm_probe = {
    actors_1_2: probe(1, 2),
    actors_3_4: probe(3, 4),
    actors_5_8: probe(5, 8),
    actors_9_plus: probe(9, Infinity),
  };
  const star_radar = (() => {
    const starOnly = all.filter((r) => ['star-only', 'star-loop'].includes(flagOf(r, FARM_ACTORS)));
    const loops = all.filter((r) => flagOf(r, FARM_ACTORS) === 'star-loop');
    return {
      repos: starOnly.length,
      loops: loops.length,
      watch_only_actors: (agg.starStats && agg.starStats.watchOnly) || 0,
      co_star_actors: (agg.starStats && agg.starStats.coStar) || 0,
      bare_repos: (agg.starStats && agg.starStats.bareRepos) || 0,
      top: starOnly.sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 5)
        .map((r) => ({ repo: r.repo, stars: r.stars, watchers: r._starOnlyCount, co_star: r._coStarCount, flag: flagOf(r, FARM_ACTORS), url: `https://github.com/${r.repo}` })),
      loops_top: loops.sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 5)
        .map((r) => ({ repo: r.repo, stars: r.stars, watchers: r._starOnlyCount, co_star: r._coStarCount, reason: r._knownFarmStars ? 'known-farm star' : r._coStarCount >= 2 ? 'co-star cluster' : 'out-of-nowhere' })),
    };
  })();
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
    bot_loop_total: allBotLoop.length,
    bot_loop_top: allBotLoop.length ? allBotLoop.sort((a, b) => (b.pushes || 0) - (a.pushes || 0))[0].repo : null,
    star_radar,
    farm_probe,
    ledger_size: FARM_ACTORS.size,
    ledger_confirmed: [...FARM_ACTORS.values()].filter((e) => e.hours.size >= FARM_ACTOR_MIN_HOURS).length,
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
    ...(s.star_radar ? [`🔭 star-only radar: ${s.star_radar.repos} repos · ${s.star_radar.loops} star-loops · ${s.star_radar.watch_only_actors} pure-watcher accounts${s.star_radar.top[0] ? ` — top: ${s.star_radar.top[0].repo} (+${s.star_radar.top[0].stars}★, ${s.star_radar.top[0].watchers} lurker★)` : ''}`] : []),
    ...(s.bot_loop_total ? [`🤖 bot-driven: ${s.bot_loop_total} repos (pure automation churn, demoted ×0.3)${s.bot_loop_top ? ` — top: ${s.bot_loop_top}` : ''}`] : []),
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
      if (b.pushes > e.lastPushes) { e.lastPushes = b.pushes; e.lastActors = b.actors; }
      e.last_seen = snap.hour; // refresh on EVERY sighting, not just new records
    }
  }
  // merge current hour
  for (const b of cur.bot_watch || []) {
    let e = seen.get(b.repo);
    if (!e) { e = { hours: new Set(), lastPushes: 0, lastActors: 0, first_seen: cur.hour, last_seen: cur.hour }; seen.set(b.repo, e); }
    e.hours.add(cur.hour);
    if (b.pushes > e.lastPushes) { e.lastPushes = b.pushes; e.lastActors = b.actors; }
    e.last_seen = cur.hour; // refresh on EVERY sighting, not just new records
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
  rebuildKnownRepos();
  console.log(`[pulse] ${KNOWN_REPOS.size} repos known from history (star-bomb radar)`);

  const known = new Set(readHistoryIndex().map((f) => f.replace(/\.json$/, '')));

  // Backfill plan: walk backward from the latest complete hour, collecting
  // missing hours until we hit the earliest known hour (or MAX_BACKFILL
  // missing hours). Known hours in between are skipped, so gaps in the
  // middle of history get filled, not just the newest hour.
  // v5 fix: the old "start of today" break left a permanent gap (previous
  // day's 19-23h were never backfilled once a run crossed a day boundary).
  // Now we walk across day boundaries, bounded by the earliest known hour
  // and a hard sanity cap (72h) so a fresh site can't trigger a huge crawl.
  const earliestKnown = known.size ? [...known].sort((a, b) => hourNum(a) - hourNum(b))[0] : null;
  const earliestKnownNum = earliestKnown ? hourNum(earliestKnown) : null;
  const missing = [];
  let cur = latest;
  let walked = 0;
  while (missing.length < MAX_BACKFILL && walked < 72) {
    if (earliestKnownNum !== null && hourNum(cur) <= earliestKnownNum && known.has(cur)) break;
    if (!known.has(cur)) missing.unshift(cur);
    cur = prevHourLabel(cur);
    walked++;
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
