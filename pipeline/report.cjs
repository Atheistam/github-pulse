#!/usr/bin/env node
/* pipeline/report.cjs — generates site/report.html ("State of GitHub Spam").
 * Zero dependencies. Reads site/data/history/*.json, aggregates, renders a
 * self-contained static page (inline CSS + inline SVG charts).
 * Regenerates on every refresh; safe to run any time.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HIST = path.join(ROOT, 'site', 'data', 'history');
const OUT = path.join(ROOT, 'site', 'report.html');

const files = fs.readdirSync(HIST)
  .filter(f => /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f))
  .sort((a, b) => {
    // chronological, not lexicographic: 2026-08-13-19 < 2026-08-13-2
    const key = f => { const p = f.replace('.json', '').split('-'); return Date.parse(p.slice(0, 3).join('-') + 'T00:00:00Z') / 86400000 * 24 + Number(p[3]); };
    return key(a) - key(b);
  });
if (!files.length) { console.error('no history files'); process.exit(1); }

const hours = files.map(f => JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));

// ---------- aggregates ----------
const series = hours.map(h => ({
  hour: h.hour,
  label: h.hour.slice(5),                       // MM-DD-H
  day: h.hour.slice(5, 10),
  events: h.events || 0,
  repos: h.repos_seen || 0,
  spam: h.push_spam_pct || 0,
  farms: (h.bot_watch || []).length,
  farmPushes: (h.bot_watch || []).reduce((a, b) => a + (b.pushes || 0), 0),
  demoted: h.demoted_total || 0,
  suspicious: h.suspicious_total || 0,
  starLoops: (h.star_radar && h.star_radar.loops) || 0,
  starOnly: (h.star_radar && h.star_radar.repos - h.star_radar.loops) || 0,
  watchers: (h.star_radar && h.star_radar.watch_only_actors) || 0,
}));

const totalEvents = series.reduce((a, s) => a + s.events, 0);
const totalRepos  = series.reduce((a, s) => a + s.repos, 0);
const avgSpam     = series.reduce((a, s) => a + s.spam, 0) / series.length;
const cur = series[series.length - 1];
const maxSpam = series.reduce((a, s) => (s.spam > a.spam ? s : a), series[0]);
const maxFarms = series.reduce((a, s) => (s.farmPushes > a.farmPushes ? s : a), series[0]);
const maxDemoted = series.reduce((a, s) => (s.demoted > a.demoted ? s : a), series[0]);
const totalDemoted = series.reduce((a, s) => a + s.demoted, 0);
const totalSuspicious = series.reduce((a, s) => a + s.suspicious, 0);

// all-time persistent farm ledger (best view per repo across hours)
const farms = new Map();
for (const h of hours) {
  for (const f of (h.botnet_watch || [])) {
    const e = farms.get(f.repo) || { repo: f.repo, hours_seen: 0, max_pushes: 0, first: f.first_seen, last: f.last_seen };
    e.hours_seen = Math.max(e.hours_seen, f.hours_seen || 0);
    e.max_pushes = Math.max(e.max_pushes, f.max_pushes || 0);
    if (f.first_seen && f.first_seen < e.first) e.first = f.first_seen;
    if (f.last_seen && f.last_seen > e.last) e.last = f.last_seen;
    farms.set(f.repo, e);
  }
}
const farmList = [...farms.values()]
  .sort((a, b) => b.hours_seen - a.hours_seen || b.max_pushes - a.max_pushes);

// ---------- cadence & account factory (v5.7) ----------
// spam peaks = local maxima >= 50% of push_spam_pct
const peaks = [];
for (let i = 1; i < series.length - 1; i++) {
  const a = series[i - 1], b = series[i], c = series[i + 1];
  if (b.spam >= 50 && b.spam > a.spam && b.spam >= c.spam) peaks.push(b);
}
// new-account batches = farm-ledger actors by first_seen hour
const LEDGER = path.join(ROOT, 'site', 'data', 'farm_actors.json');
const batchByHour = {};
let ledgerCount = 0;
try {
  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  ledgerCount = Object.keys(ledger).length;
  for (const e of Object.values(ledger)) {
    const key = h => { const p = h.split('-'); return Date.parse(p.slice(0, 3).join('-') + 'T00:00:00Z') / 86400000 * 24 + Number(p[3]); };
    const hrs = (e.hours || []).slice().sort((x, y) => key(x) - key(y)); // chronological: hour labels are NOT zero-padded
    if (hrs[0]) batchByHour[hrs[0]] = (batchByHour[hrs[0]] || 0) + 1;
  }
} catch (e) { /* ledger unavailable -> cadence panel degrades to peaks only */ }
const hourNum = h => parseInt(h.split('-')[3], 10);
const padH = h => { const p = h.split('-'); p[3] = String(hourNum(h)).padStart(2, '0'); return p.join('-'); };
const batchAt = h => batchByHour[h] || batchByHour[padH(h)] || 0;
const cadenceRows = peaks.map(pk => {
  const hh = hourNum(pk.hour), day = pk.hour.slice(0, 10);
  let lead = null, maxBatch = 0, leadBatch = 0;
  for (let k = 0; k <= 4; k++) {
    const b = batchAt(day + '-' + String(hh - k));
    if (b > maxBatch) maxBatch = b;
    if (b >= 500 && lead === null) { lead = k; leadBatch = b; }
  }
  return { hour: pk.hour, label: pk.hour.slice(5), spam: pk.spam, lead, leadBatch, maxBatch };
});
const factorySurges = cadenceRows.filter(r => r.lead !== null).length;
const leadAvg = (() => {
  const ls = cadenceRows.filter(r => r.lead !== null).map(r => r.lead);
  return ls.length ? (ls.reduce((a, b) => a + b, 0) / ls.length).toFixed(1) : 'n/a';
})();

// ---------- v5.8 epilogue: the cadence breaks ----------
const lastPeak = peaks.length ? peaks[peaks.length - 1] : null;
const hoursSincePeak = lastPeak ? series.length - 1 - series.findIndex(s => s.hour === lastPeak.hour) : null;
const recent7 = series.slice(-7).map(s => s.spam);
const recentAvg = recent7.length ? (recent7.reduce((a, b) => a + b, 0) / recent7.length).toFixed(1) : null;
const recentMax = recent7.length ? Math.max(...recent7) : null;
const mintRecent = ['2026-08-14-1', '2026-08-14-2', '2026-08-14-3']
  .map(h => [h, batchAt(h)]).filter(x => x[1] > 0);
const mintNow = batchAt('2026-08-14-3');

// ---------- v5.10 verdict: the surge lands (outer edge) ----------
const verdictMint = ['2026-08-14-2', '2026-08-14-3', '2026-08-14-4', '2026-08-14-5', '2026-08-14-6']
  .map(h => [h, batchAt(h)]).filter(x => x[1] > 0);
const vSpam = ['2026-08-14-4', '2026-08-14-5', '2026-08-14-6']
  .map(h => { const s = series.find(x => x.hour === h); return s ? s.spam : null; })
  .filter(x => x !== null);
const vDemoted6 = (() => {
  const s = series.find(x => x.hour === '2026-08-14-6');
  return s ? (s.demoted || []).length : 0;
})();

// all-time languages (summed event-weight per hour it charted)
const langs = new Map();
for (const h of hours) {
  for (const l of (h.top_languages || [])) {
    const e = langs.get(l.language) || { language: l.language, events: 0, hours: 0 };
    e.events += l.events || 0; e.hours++;
    langs.set(l.language, e);
  }
}
const langList = [...langs.values()].sort((a, b) => b.events - a.events).slice(0, 12);

// hot-chart regulars (repos that keep appearing in the top-25)
const hot = new Map();
for (const h of hours) {
  for (const r of (h.top_hot || [])) {
    const e = hot.get(r.repo) || { repo: r.repo, appears: 0, heat: 0 };
    e.appears++; e.heat += r.heat || 0;
    hot.set(r.repo, e);
  }
}
const hotList = [...hot.values()].sort((a, b) => b.appears - a.appears || b.heat - a.heat).slice(0, 10);

const n = series.length;
const firstLabel = series[0].hour;
const lastLabel = series[n - 1].hour;

// v5.2 star-bomb radar: latest radar state (from the newest hour that has one)
const radarHours = hours.filter(h => h.star_radar);
const curRadar = radarHours.length ? radarHours[radarHours.length - 1].star_radar : null;
const starLoopTotal = series.reduce((a, s) => a + (s.starLoops || 0), 0);

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const pct = (x) => (Math.round(x * 10) / 10).toFixed(1) + '%';

// cadence table rows (built after esc/fmt exist)
const cadenceTable = cadenceRows.slice(-10).reverse().map(r =>
  `<tr><td class="mono">${esc(r.label)}</td><td class="mono">${r.spam}%</td>` +
  `<td class="mono">${r.lead === null ? '—' : r.lead + 'h'}</td><td class="mono">${r.leadBatch ? fmt(r.leadBatch) : (r.maxBatch ? '≤' + fmt(r.maxBatch) : '—')}</td></tr>`
).join('');

// inline SVG sparkline/line chart — returns <svg> string
function lineChart(series, opts) {
  const W = 920, H = 240, PL = 46, PR = 14, PT = 18, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const vals = series.map(s => s[opts.key]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (opts.floor != null) lo = Math.min(lo, opts.floor);
  if (opts.ceil != null) hi = Math.max(hi, opts.ceil);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const X = (i) => PL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => PT + ih - ((v - lo) / (hi - lo)) * ih;
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
  const grid = [0.25, 0.5, 0.75].map(g => {
    const y = PT + ih * g; const v = hi - (hi - lo) * g;
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="#1d1d2e" stroke-width="1"/><text x="${PL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="ax">${opts.unit ? Math.round(v) + opts.unit : v.toFixed(0)}</text>`;
  }).join('');
  const step = Math.max(1, Math.ceil(n / 14));
  const xl = series.map((s, i) => i % step === 0
    ? `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ax">${esc(s.label)}</text>` : '').join('');
  const area = opts.fill ? `<polygon points="${PL},${PT + ih} ${pts.join(' ')} ${X(n - 1).toFixed(1)},${PT + ih}" fill="${opts.color}" opacity="0.12"/>` : '';
  const dots = opts.dots !== false ? pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.6" fill="${opts.color}"/>`).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">
${grid}<line x1="${PL}" y1="${PT + ih}" x2="${W - PR}" y2="${PT + ih}" stroke="#2a2a40" stroke-width="1"/>${area}
<polyline points="${pts.join(' ')}" fill="none" stroke="${opts.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xl}
</svg>`;
}

function bars(series, opts) {
  const W = 920, H = 200, PL = 46, PR = 14, PT = 14, PB = 34;
  const iw = W - PL - PR, ih = H - PT - PB;
  const vals = series.map(s => s[opts.key]);
  const hi = Math.max(...vals, 1);
  const bw = Math.min(26, iw / n - 3);
  const X = (i) => PL + (i + 0.5) * (iw / n);
  const step = Math.max(1, Math.ceil(n / 14));
  const bars = vals.map((v, i) => {
    const bh = Math.max(v > 0 ? 3 : 0, (v / hi) * ih);
    const y = PT + ih - bh;
    const hl = opts.hl ? series[i][opts.hl] : true;
    return `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${hl ? opts.color : '#2a2a40'}"><title>${esc(series[i].label)}: ${fmt(v)}${opts.unit || ''}</title></rect>`;
  }).join('');
  const xl = series.map((s, i) => i % step === 0
    ? `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="ax">${esc(s.label)}</text>` : '').join('');
  const grid = [0.25, 0.5, 0.75].map(g => {
    const y = PT + ih * g; const v = hi * (1 - g);
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="#1d1d2e" stroke-width="1"/><text x="${PL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="ax">${Math.round(v)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">${grid}${bars}${xl}</svg>`;
}

// ---------- narrative timeline (data-backed, from run history) ----------
const timeline = [
  { when: 'Aug 11 · 00:00 UTC', title: 'GitHub Pulse goes live', body: 'The first full hour of the public GitHub event stream is processed: 147K events across 39.8K repos. A live radar of everything happening on GitHub, ranked by heat.' },
  { when: 'Aug 11 · hours 0–6', title: 'The pattern emerges', body: 'The raw push stream hides a machine underneath: single actors pushing 200–700× per hour into freshly-created gibberish repos (smithhoward5868/faiucd, conleyricky202/babjhl…). Zero stars, zero issues, zero PRs — zero humans.' },
  { when: 'Aug 11 · hours 6–12', title: 'The farms adapt', body: 'Every push-volume threshold I set (40 → 30 → 25 → 24 pushes/hr) is matched within hours. Detection switches from thresholds to profiles: no human signal + ≤2 actors + auto-generated account names + a persistent ledger — repos rotate, accounts persist.' },
  { when: 'Aug 11 · 18:00 UTC', title: 'LiamBruhin/SillyStuff', body: 'The longest-running farm appears and never leaves: 13 consecutive hours, peaking at 690 pushes in a single hour. Still active 12 hours later (259/hr at Aug 12 06:00).' },
  { when: 'Aug 12 · 00:00 UTC', title: 'A new wave', body: 'trnfvn-/brnfvn- prefixed accounts arrive (CentiCloudStir, MicroEnvoyTwist, YuqiGuo-cx0) pushing 325–345/hr. The ledger catches them on hour one.' },
  { when: 'Aug 12 · 03:00–06:00 UTC', title: 'The upswing', body: 'Spam climbs from 34.6% to 58.5% of ALL pushes. Demoted farm repos jump from 983 to 2,503 per hour. The botnet economy is having a busy morning.' },
  { when: 'Aug 12 · hours 10–12', title: 'The self-PR adaptation', body: 'With push-only repos demoted, farms open PRs on their own repos to fake human signal (quoctuan21112009-maker/pull-request hit #2 hottest). Detection flips from "any PR counts" to "PRs by the pusher don\'t".' },
  { when: 'Aug 12 · hour 15', title: 'The issue-loop', body: 'The next mutation: zero pushes at all. Operators open 14–16 issues on their own fresh repos (meronrudy/usaBOXING_repo, spcsorg/daylens) to rank #3–4 hottest on issue-weight alone. Caught the same hour — self-authored issues now demote like self-PRs.' },
  { when: 'Aug 12 · hours 12–15', title: 'The wave regroups', body: 'Spam % swings like a tide: 63.8% → 43.4% → back to 54.9%. The farms don\'t disappear — they shift volume between shifts of accounts. LiamBruhin/SillyStuff has now pushed 690×/hr for 13+ hours straight, every hour, one actor.' },
  { when: 'Aug 12 · hour 18', title: 'Star-bomb radar (v5.2)', body: 'With pushes (×0.05–0.3), self-PRs and issue-loops (×0.3) all demoted, stars are the last untaxed heat vector (×8) — so star-bombing became the predicted next adaptation. The radar tracks pure-watcher accounts (whose only activity all hour is starring) and bare repos (stars with zero pushes/PRs/issues/releases). A ≥5-star burst appearing out of nowhere, or ≥2 watchers co-starring multiple bare repos, is demoted ×0.3 as a star-loop; anything ambiguous gets an informational 🔭 star-only badge instead of punishment. Historical replay: spinabot/brigade (7★, 7 lurker watchers, out of nowhere) WOULD have been caught; guillaumemeyer/watermarks-remover (4★) stays informational; famous repos (transformers, firecrawl) are never touched.' },
  { when: 'Aug 13 · hour 0', title: 'The bot-loop (v5.3)', body: 'The chart\'s quiet blind spot: a repo hot ONLY because release/CI automation churns pushes. TimSchoenle/actions hit #1 with 55 pushes from 3 shared [bot] accounts and zero human touch — indistinguishable from a farm by the ≤2-actor rules. New tier: zero non-bot actors + zero human signal + ≥10 pushes → 🤖 bot-loop, demoted ×0.3, never called a farm. Bonus: farms laundering pushes through GitHub Actions under a clean-looking owner now can\'t rank either.' },
  { when: 'Aug 13 · hour 3', title: 'The bot-review loophole (v5.4)', body: 'The bot-loop rule had a crack a day old: reviews counted as human signal no matter who wrote them. TimSchoenle/actions came back with 49 pushes from 4 all-bot actors (renovate[bot], actions-maintenance-bot[bot], automatic-release-manager[bot], github-actions[bot]) — and one bot-authored review was enough to keep it off the bot-loop tier and at #5 hottest. Fix: review authors are now tracked per repo; bot reviews and self-reviews (authored by the repo\'s own pushers — Wonder0208/androidtest was trying exactly that, 42 pushes + 1 self-review) count as zero human signal. Same hour both slipped through got caught: the chart is back to human repos (bun, vm0, EaseMotion-css).' },
  { when: "Aug 13 · hours 6–15", title: "The 3-hour cadence (v5.7)", body: "The spam share stops drifting and starts pulsing: 66.2% → 62.8% → 53.0% → 60.2%, a surge every ~3 hours with 23–40% lulls between. The 4th peak rebounded — not a farm in retreat. And the engine is visible: each surge is preceded within 1–2 hours by a minting run of ≥500 freshly-created throwaway accounts (1,081 + 1,721 in the two hours before the 66.2% peak). Aug 11's peaks had almost no fresh accounts — fleet rotation. Aug 12 onward: mint-and-burn. Twelve ledger actors have now been seen in every single hour of the 64-hour window." },
  { when: "Aug 13 · hours 18–24 → Aug 14 · hour 0", title: "The pulse breaks (v5.8)", body: "The cadence was a hypothesis, and it failed at the 5th expected beat: h18 landed at 43.6% instead of ~60%, and the next six hours stayed flat (38.6 / 36.3 / 37.4 / 38.8 / 40.4 / 38.7) — seven hours with no ≥50% surge. The cause is visible in the ledger: minting collapsed from 947 fresh accounts in the hour before the 60.2% peak to 77/hr the hour after, settling at ~100–150/hr. Sprint → trickle. The old guards (LiamBruhin/SillyStuff back up to 725 pushes/hr, ugmoddev/API-NEW-NAT-3-) never stopped pumping; the fleet just stopped minting at surge scale, so the synchronized bursts stopped with it. The rulebook flips: don't predict a peak at h21/h24 — watch the minting rate as the leading indicator. ~500+/hr minted = surge inbound; ~100/hr = flat." },
  { when: "Aug 14 · hours 1–3", title: "The factory restarts (v5.9)", body: "The lead-time rule gets its first live test. Hours 1–3 of Aug 14 mint 163 → 629 → 1,175 fresh throwaway ledger accounts — the strongest minting since the 60.2% peak — yet spam holds flat at 32.2 / 33.3 / 34.4%, and even the old guards downshift (LiamBruhin/SillyStuff 725 → 387 pushes/hr, ugmoddev 532 → 276). The factory is generating identities at sprint scale again while the surge hasn't landed. Either a ≥50% surge lands within ~1–4h of the 629/1,175 batches (rule confirmed, timing becomes predictable), or minting stops being a leading indicator and the farms have decoupled account creation from push bursts. Three distinct naming batches — glennjennifer427810-style, xongtle29-style, and bare numeric usernames (130556457) — hint the generation templates themselves are being rotated hourly." },
  { when: "Aug 14 · hours 4–6", title: "The surge lands (v5.10)", body: "Verdict: the lead-time rule held, at the outer edge of its window. Minting stayed hot (730 → 502 → 716 fresh accounts) while spam dipped to 27.0% at h4 — a false dawn, the minted batch not yet deployed — then climbed 37.6% → 49.6% by h6, the first ≥45% hour in 15. The surge was carried by the new batch, not the veterans: LiamBruhin/SillyStuff faded to 299 pushes/hr (from 725) and ugmoddev to 204 (from 532), while fresh accounts minted at h4/h5 — brownwhitney29, stephenspaul164, shepherdjohn909, joneswilliam18, thomaskatherine300 — each pushed 145–235×/hr. Mint-and-burn confirmed: mint ≥500/hr → deploy the batch 2–3h later → surge. 1,695 farm repos were demoted in h6 alone. The naming-generator rotation (firstname+digits → word+digits → bare numeric → firstname+digits again) is the factory's fingerprinting dodge." },
  { when: "Aug 14 · hours 7–9", title: "The breach lands — rule confirmed (v5.11)", body: "The formal ≥50% breach arrived at h8: spam 43.7% (h7, one pause hour) → 55.6% (h8) → 51.2% (h9). The run-23 prediction — minting 629/1,175 at h2/h3 → ≥50% surge — is fully confirmed; the timing landed at the outer edge +1 (h8, ~6h after the first ≥500 mint hour). The rotation is total: by h9 neither LiamBruhin nor ugmoddev appears in the top farm list at all — the surge is 100% fresh batch (sweeneyrachel2528 234, trujillojoshua139 230, thompsoncarrie2241 228, taylorlisa8 226, suttonveronica8 223, thomasmary5697 222 pushes/hr). Minting decelerated (h7 87 → h8 210 → h9 188 fresh accounts) — the batch is deployed, the factory is re-arming. Naming template: back to firstname+lastname+digits (template A), same as h4–h6." },
  { when: "Aug 14 · hours 10–12", title: "Double breach, fastest collapse, record re-arm (v5.12)", body: "The h8 breach didn't fade — it repeated: h10 hit 53.5%, the first back-to-back ≥50% pair since Aug 13, carried by a brand-new lowercase-gibberish batch (matkcrais 202, truilab-da 189, mouses61drg 186, mchaelheses2 183, lesiron-c 183 pushes/hr) while the sweeneyrachel batch vanished from the top-5 overnight. h11 decayed to 47.2% as ugmoddev re-ramped to 206/hr (first top-5 appearance since h8). Then h12 collapsed to 25.7% — a -21.5pt single-hour drop, the largest in the 85-hour window and the second-lowest hour ever — while the factory minted a RECORD 2,002 fresh accounts in that same hour, nearly double the previous peak (1,175 at h3). Naming generators rotated three templates in three hours (gibberish → hyphen+digits, winson-00178005-style → firstname+lastname+digits). The lead-time rule's next live test: 2,002 minted at h12 → next ≥50% surge window h13–h16." },
];

// ---------- page ----------
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>State of GitHub Spam — a ${series.length}-hour investigation by GitHub Pulse</title>
<meta name="description" content="How much of GitHub's public push traffic is automated spam? A live, hour-by-hour investigation: push-farms, botnets, adaptation, and the arms race to detect them.">
<meta property="og:type" content="article">
<meta property="og:title" content="State of GitHub Spam — the botnet economy inside the public event stream">
<meta property="og:description" content="${series.length} hours of the full GH Archive, audited: ~${Math.round(avgSpam)}% of all pushes are spam from automated farms. See the charts, the farms, and the arms race.">
<meta property="og:url" content="https://github-pulse.surge.sh/report.html">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧟</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#07070c;--panel:#0e0e18;--panel2:#12121f;--border:#1d1d2e;--text:#e8e8f2;--dim:#8b8ba3;--faint:#5a5a74;--accent:#7c6cff;--gold:#ffd166;--silver:#c0c7d1;--bronze:#e08e5a;--green:#34d399;--red:#f87171;--orange:#fb923c;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--sans:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}
.bg-glow{position:fixed;inset:0;pointer-events:none;background:radial-gradient(900px 500px at 75% -10%,rgba(124,108,255,.10),transparent 60%),radial-gradient(700px 420px at 10% 110%,rgba(248,113,113,.06),transparent 60%);z-index:0}
.bg-grid{position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(124,108,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(124,108,255,.045) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(ellipse 90% 60% at 50% 0%,#000 30%,transparent 75%);z-index:0}
.wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 20px}
.topbar{border-bottom:1px solid var(--border);background:rgba(7,7,12,.8);backdrop-filter:blur(8px);position:sticky;top:0;z-index:5}
.topbar-inner{display:flex;align-items:center;justify-content:space-between;height:58px}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--text);font-weight:700;letter-spacing:.02em}
.brand-mark{font-size:18px}
.brand-name{font-size:14px;letter-spacing:.18em}
.nav a{color:var(--dim);text-decoration:none;font-size:12.5px;margin-left:18px;transition:color .15s}
.nav a:hover{color:var(--accent)}
.nav .live{color:var(--accent);font-family:var(--mono)}
.hero{padding:72px 0 20px}
.kicker{font-family:var(--mono);font-size:12px;letter-spacing:.22em;color:var(--accent);text-transform:uppercase}
.hero h1{font-size:44px;line-height:1.08;letter-spacing:-.02em;margin:14px 0 16px;font-weight:700}
.hero h1 .accent{color:var(--accent)}
.hero p.sub{color:var(--dim);font-size:16.5px;max-width:760px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:36px 0 8px}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px 18px 14px}
.stat-num{font-family:var(--mono);font-size:24px;font-weight:600;color:var(--text)}
.stat-num.warn{color:var(--red)}
.stat-num.good{color:var(--green)}
.stat-label{font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.12em;margin-top:3px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:26px 26px 24px;margin:26px 0}
.panel-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.panel-head h2{font-size:18px;font-weight:600;letter-spacing:-.01em}
.h-num{color:var(--accent);font-family:var(--mono);font-size:13px}
.panel-sub{color:var(--faint);font-size:12.5px}
.lede{color:var(--dim);font-size:14.5px;max-width:820px;margin:8px 0 18px}
.chart{width:100%;height:auto;margin:10px 0 4px}
.chart .ax{fill:var(--faint);font-family:var(--mono);font-size:10px}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:12px}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--faint);text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);font-weight:500}
td{padding:8px 10px;border-bottom:1px solid #161624;color:var(--dim)}
td.mono,th.mono{font-family:var(--mono);font-size:12.5px}
tr:hover td{background:rgba(124,108,255,.04)}
td a{color:var(--text);text-decoration:none}
td a:hover{color:var(--accent)}
.badge{display:inline-block;font-family:var(--mono);font-size:10.5px;padding:2px 8px;border-radius:99px;border:1px solid var(--border);color:var(--dim)}
.badge.red{border-color:rgba(248,113,113,.4);color:var(--red)}
.badge.green{border-color:rgba(52,211,153,.35);color:var(--green)}
.tl{border-left:2px solid var(--border);margin:18px 0 6px;padding-left:24px}
.tl-item{position:relative;padding:0 0 26px}
.tl-item:last-child{padding-bottom:6px}
.tl-item::before{content:'';position:absolute;left:-29px;top:6px;width:10px;height:10px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(124,108,255,.15)}
.tl-item .when{font-family:var(--mono);font-size:11.5px;color:var(--accent);letter-spacing:.06em}
.tl-item h3{font-size:16px;font-weight:600;margin:3px 0 5px}
.tl-item p{color:var(--dim);font-size:14px;max-width:780px}
.anatomy{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px}
.an{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.an .k{font-family:var(--mono);font-size:11px;color:var(--red);letter-spacing:.08em;text-transform:uppercase}
.an p{color:var(--dim);font-size:13.5px;margin-top:4px}
.note{background:rgba(124,108,255,.06);border:1px solid rgba(124,108,255,.22);border-radius:12px;padding:16px 18px;font-size:13.5px;color:var(--dim);margin-top:16px}
.note b{color:var(--text)}
.footer{border-top:1px solid var(--border);margin-top:46px;padding:30px 0 60px;color:var(--faint);font-size:13px}
.footer a{color:var(--accent);text-decoration:none}
.footer .row{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:14px;font-size:13.5px}
@media(max-width:640px){.hero h1{font-size:32px}.panel{padding:20px 16px}}
</style>
</head>
<body>
<div class="bg-glow" aria-hidden="true"></div>
<div class="bg-grid" aria-hidden="true"></div>

<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="./"><span class="brand-mark">📡</span><span class="brand-name">GITHUB&nbsp;PULSE</span></a>
    <div class="nav">
      <a class="live" href="./">← live radar</a>
      <a href="data/digest.xml">RSS</a>
      <a href="https://github.com/Atheistam/github-pulse">source</a>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <div class="kicker">🧟 Investigation · ${esc(firstLabel)} → ${esc(lastLabel)} · auto-generated hourly</div>
    <h1>The <span class="accent">State of GitHub Spam</span></h1>
    <p class="sub">GitHub publishes every public event — push, PR, issue, star — into the GH Archive, hour by hour. We process the whole stream and found something strange: a large fraction of the pushes are not people. They are automated <b>push-farms</b> — fleets of auto-created accounts pushing to freshly-created gibberish repositories, hundreds of times per hour, forever. This is what ${n} hours of looking at them looks like.</p>
    <div class="stats">
      <div class="stat"><div class="stat-num">${fmt(n)}</div><div class="stat-label">hours observed</div></div>
      <div class="stat"><div class="stat-num">${fmt(totalEvents)}</div><div class="stat-label">events processed</div></div>
      <div class="stat"><div class="stat-num warn">${pct(avgSpam)}</div><div class="stat-label">avg share of pushes that are spam</div></div>
      <div class="stat"><div class="stat-num warn">${pct(cur.spam)}</div><div class="stat-label">right now (${esc(cur.label)})</div></div>
      <div class="stat"><div class="stat-num">${fmt(farmList.length)}</div><div class="stat-label">farms tracked</div></div>
      <div class="stat"><div class="stat-num">${fmt(totalDemoted + totalSuspicious)}</div><div class="stat-label">repos demoted from rankings</div></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">01</span> Half of GitHub's pushes are not human</h2></div>
    <div class="lede">Each bar is one hour. The line is the share of that hour's <i>pushes</i> judged to be farm spam — accounts with no human signal (no PRs, issues, stars, forks, or releases), pushing to fresh auto-generated repos. It swings between <b>${pct(Math.min(...series.map(s=>s.spam)))}</b> and <b>${pct(Math.max(...series.map(s=>s.spam)))}</b> — never below a third, sometimes above six-tenths. The farms ebb and flow; they never leave.</div>
    ${lineChart(series, { key: 'spam', color: '#f87171', unit: '%', label: 'spam share of all pushes per hour', floor: 0 })}
    <div class="lede" style="margin-top:14px">How much farm traffic was caught per hour: repos demoted out of the rankings for farm behaviour (red) plus suspicious push-loops (grey). The last hours are the most aggressive the farms have been since we started watching.</div>
    ${bars(series, { key: 'demoted', color: '#f87171', label: 'farm repos demoted per hour' })}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">02</span> The farms</h2><span class="panel-sub">persistent actors, tracked across hours — repos rotate, accounts persist</span></div>
    <div class="lede">These are the longest-running operations. <b>hours seen</b> counts distinct hours the farm appeared; <b>peak</b> is its most pushes in a single hour. LiamBruhin/SillyStuff — one account, one repo, up to 690 pushes in an hour — has outlasted every countermeasure so far.</div>
    <table>
      <tr><th>farm / repo</th><th class="mono">hours seen</th><th class="mono">peak pushes/hr</th><th class="mono">first → last seen</th></tr>
      ${farmList.slice(0, 20).map(f => `<tr><td><a href="https://github.com/${esc(f.repo)}" rel="noopener">${esc(f.repo)}</a></td><td class="mono">${f.hours_seen}</td><td class="mono">${fmt(f.max_pushes)}</td><td class="mono">${esc(f.first)} → ${esc(f.last)}</td></tr>`).join('')}
    </table>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">03</span> The 3-hour cadence &amp; the account factory</h2><span class="panel-sub">v5.12 — double breach (h8 55.6% / h10 53.5%), fastest collapse ever (h12 25.7%), record re-arm (2,002 minted/hr)</span></div>
    <div class="lede">Between Aug 13 06:00 and 15:00 UTC the spam share stopped drifting and started <b>pulsing</b>: 66.2% → 62.8% → 53.0% → 60.2% — a surge every ~3 hours with 23–40% lulls between. The engine was visible in the ledger: <b>${factorySurges} of ${cadenceRows.length} surges (≥50%) had a minting run of ≥500 freshly-created throwaway accounts within 4 hours prior</b>, average lead <b>${leadAvg}h</b> — accounts are minted, then deployed to push repos. Aug 11's peaks had almost no fresh accounts (fleet rotation); Aug 12 onward it was mint-and-burn.</div>
    <table style="margin-top:14px">
      <tr><th>surge (peak hour)</th><th class="mono">spam %</th><th class="mono">lead time</th><th class="mono">factory batch</th></tr>
      ${cadenceTable}
    </table>
    ${hoursSincePeak !== null ? `<div class="lede" style="margin-top:16px;border-left:3px solid #10b981;padding-left:12px"><b>Verdict (v5.12): the rule survived a second test — and the full cycle is now visible end-to-end twice.</b> The h8 breach didn't fade: spam held <b>≥50% again at h10 (53.5%)</b> — the first back-to-back ≥50% pair since Aug 13 — carried by an entirely new lowercase-gibberish batch (matkcrais 202, truilab-da 189, mouses61drg 186, mchaelheses2 183, lesiron-c 183 pushes/hr) while the h7–h9 sweeneyrachel batch vanished from the top-5 overnight. h11 decayed to 47.2% as ugmoddev re-ramped to 206/hr (first top-5 appearance since h8) alongside elad-cmd (186). Then <b>h12 collapsed to 25.7% — a -21.5pt single-hour drop, the largest in the ${series.length}-hour window (previous record -15.5pt) and the second-lowest hour ever</b> (low: 23.4%) — while the factory minted a <b>RECORD 2,002 fresh accounts in that same hour</b>, nearly double the previous peak (1,175 at h3). Mint → deploy → surge → collapse → re-arm. Naming generators rotated three templates in three hours (gibberish → hyphen+digits, winson-00178005-style → firstname+lastname+digits). With 2,002 minted at h12, the lead-time rule puts the next ≥50% surge window at <b>h13–h16 — the next refresh lands inside it</b>. Demotions held heavy: 1,646 / 1,630 / 1,064 farm repos, h10–h12.</div>` : ''}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">04</span> The star-bomb radar</h2><span class="panel-sub">v5.2 — watching the last untaxed heat vector</span></div>
    <div class="lede">Every heat vector the farms ever used — pushes, self-PRs, self-issues — now demotes them. That leaves <b>stars</b> (×8 heat) as the only remaining way to rank a repo, so star-bombing is the predicted next adaptation. The radar counts <b>pure-watcher accounts</b> (their only activity all hour is starring) and flags <b>bare repos</b> (stars with zero pushes/PRs/issues/releases). A repo whose stars come from co-starring lurker clusters, known-farm actors, or a ≥5★ burst that appears out of nowhere is demoted ×0.3 as a <b>star-loop</b>; ambiguous cases get an informational 🔭 badge instead of punishment — a legit viral repo is identical to a bomb for one hour, and we refuse to hide real launches.</div>
    ${curRadar ? `<div class="stats" style="margin:18px 0">
      <div class="stat"><div class="stat-num">${curRadar.loops}</div><div class="stat-label">star-loops demoted (latest hour)</div></div>
      <div class="stat"><div class="stat-num">${curRadar.repos - curRadar.loops}</div><div class="stat-label">star-only repos under watch</div></div>
      <div class="stat"><div class="stat-num">${fmt(curRadar.watch_only_actors)}</div><div class="stat-label">pure-watcher accounts</div></div>
      <div class="stat"><div class="stat-num">${starLoopTotal}</div><div class="stat-label">star-loops caught (all hours)</div></div>
    </div>` : ''}
    ${radarHours.length > 1 ? lineChart(series, { key: 'starLoops', color: '#38bdf8', label: 'star-loops demoted per hour' }) : ''}
    ${curRadar && curRadar.loops_top && curRadar.loops_top.length ? `<table style="margin-top:14px">
      <tr><th>star-loop repo</th><th class="mono">stars</th><th class="mono">lurker watchers</th><th class="mono">co-stars</th><th>why</th></tr>
      ${curRadar.loops_top.map(l => `<tr><td><a href="${esc(l.url || 'https://github.com/' + l.repo)}" rel="noopener">${esc(l.repo)}</a></td><td class="mono">+${l.stars}★</td><td class="mono">${l.watchers}</td><td class="mono">${l.co_star}</td><td class="dim">${esc(l.reason || '')}</td></tr>`).join('')}
    </table>` : `<div class="lede" style="margin-top:14px">No star-loops in the latest hour — the radar is quiet, which is exactly what we want to see while it's watching.</div>`}
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">05</span> The arms race</h2><span class="panel-sub">they read the radar and adapt — so does the radar</span></div>
    <div class="tl">
      ${timeline.map(t => `<div class="tl-item"><div class="when">${esc(t.when)}</div><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></div>`).join('')}
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">06</span> Anatomy of a push-farm</h2></div>
    <div class="anatomy">
      <div class="an"><div class="k">accounts</div><p>Auto-generated names — word + digits (<span class="mono">smithhoward5868</span>, <span class="mono">conleyricky202</span>), or bulk prefixes (<span class="mono">trnfvn-</span>, <span class="mono">brnfvn-</span>).</p></div>
      <div class="an"><div class="k">repos</div><p>Fresh gibberish names, one per account or rotating. Zero stars, forks, issues, PRs, or releases — no human ever touches them.</p></div>
      <div class="an"><div class="k">behaviour</div><p>100–700 pushes/hour from 1–2 actors. Often a single commit re-pushed to keep the repo “active” forever.</p></div>
      <div class="an"><div class="k">evasion</div><p>Volume adapts to detection thresholds (40 → 30 → 25 → 24/hr). Some launder pushes through GitHub Actions bots, or open PRs on their own repos to fake human signal.</p></div>
      <div class="an"><div class="k">newest trick</div><p>Aug 12: the issue-loop — zero pushes, the operator opens 14–16 issues on their own fresh repo to rank on activity alone. Caught by the self-signature rule the same hour it appeared. Next in the queue: star-bombing — watched by the v5.2 star-only radar (pure-watcher clusters, out-of-nowhere ≥5★ bursts).</p></div>
      <div class="an"><div class="k">motive</div><p>Unclear. Candidates: GitHub-contribution SEO, Actions-compute reselling, profile inflation. We are still not sure — ask them.</p></div>
      <div class="an"><div class="k">tells</div><p>Zero human signal + ≤2 actors + name fingerprint + repeat appearances in the ledger. That combination is now the detector, not any threshold.</p></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">07</span> What survives the noise</h2><span class="panel-sub">the human GitHub is still in there</span></div>
    <div class="lede">Repos that kept charting in the top-25 hottest across many hours, and the languages with the most event-weight. The farms can flood the raw push count, but they cannot fake a PR, a review, or a star — the human signal survives.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px" class="two-col">
      <div>
        <div class="lede" style="margin-bottom:2px">Most persistent in the hot chart (appearances across hours)</div>
        <table>
          <tr><th>repo</th><th class="mono">appearances</th><th class="mono">total heat</th></tr>
          ${hotList.map(r => `<tr><td><a href="https://github.com/${esc(r.repo)}" rel="noopener">${esc(r.repo)}</a></td><td class="mono">${r.appears}</td><td class="mono">${fmt(r.heat)}</td></tr>`).join('')}
        </table>
      </div>
      <div>
        <div class="lede" style="margin-bottom:2px">Top languages by event-weight</div>
        <table>
          <tr><th>language</th><th class="mono">events</th><th class="mono">hours charted</th></tr>
          ${langList.map(l => `<tr><td>${esc(l.language)}</td><td class="mono">${fmt(l.events)}</td><td class="mono">${l.hours}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head"><h2><span class="h-num">08</span> Method &amp; limits</h2></div>
    <div class="lede">Every hour the full GH Archive file for that hour is streamed (~150–170K events) and aggregated with zero dependencies. Spam judgement uses: absence of human interaction signals (PRs/issues/stars/forks/releases), actor counts, account-name fingerprints, and a persistent farm ledger with a 48-hour TTL (repos rotate, accounts persist).</div>
    <div class="note"><b>Honest caveats:</b> we see public events only — private activity, deleted repos and suspended accounts are invisible; Actions-generated traffic is a real signal source, so bots with <span class="mono">[bot]</span> suffixes are excluded unless they show farm behaviour; the percentage is of <i>pushes</i>, not events; and the farms adapt, so these numbers are a lower bound on the true share. Spam share may therefore be understated, not overstated.</div>
  </section>
</main>

<footer class="footer">
  <div class="wrap">
    <div class="row">
      <a href="./">📡 live radar</a>
      <a href="data/digest.xml">📰 RSS digest</a>
      <a href="https://github.com/Atheistam/github-pulse">🐙 source</a>
    </div>
    This page is generated automatically from ${fmt(n)} hourly snapshots (${esc(firstLabel)} → ${esc(lastLabel)}). Data: GH Archive (public GitHub events), ${pct(avgSpam)} average spam share, ${fmt(totalEvents)} events audited. Regenerated every hour with the live radar.
  </div>
</footer>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`[report] wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${n} hours, ${fmt(totalEvents)} events)`);
