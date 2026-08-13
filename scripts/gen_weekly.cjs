#!/usr/bin/env node
/* scripts/gen_weekly.cjs — generates site/weekly.html ("48h Digest").
 * Zero dependencies. Reads site/data/history/*.json, aggregates the rolling
 * window, renders a self-contained static page (inline CSS + inline SVG).
 * Regenerates on every refresh; safe to run any time.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HIST = path.join(ROOT, 'site', 'data', 'history');
const OUT = path.join(ROOT, 'site', 'weekly.html');

const files = fs.readdirSync(HIST)
  .filter(f => /^\d{4}-\d{2}-\d{2}-\d+\.json$/.test(f))
  .sort();
if (!files.length) { console.error('no history files'); process.exit(1); }

const hours = files.map(f => JSON.parse(fs.readFileSync(path.join(HIST, f), 'utf8')));
const n = hours.length;

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
  botLoop: h.bot_loop_total || 0,
  starLoops: (h.star_radar && h.star_radar.loops) || 0,
  starOnly: (h.star_radar && h.star_radar.repos - h.star_radar.loops) || 0,
  watchers: (h.star_radar && h.star_radar.watch_only_actors) || 0,
}));

const totalEvents = series.reduce((a, s) => a + s.events, 0);
const totalRepos  = series.reduce((a, s) => a + s.repos, 0);
const avgSpam     = series.reduce((a, s) => a + s.spam, 0) / n;
const cur = series[n - 1];
const maxSpam = series.reduce((a, s) => (s.spam > a.spam ? s : a), series[0]);
const totalDemoted = series.reduce((a, s) => a + s.demoted, 0);
const totalSuspicious = series.reduce((a, s) => a + s.suspicious, 0);
const totalBotLoop = series.reduce((a, s) => a + (s.botLoop || 0), 0);

// hot-chart regulars: sustained presence across the window
const hot = new Map();
for (const h of hours) {
  for (const r of (h.top_hot || [])) {
    const e = hot.get(r.repo) || { repo: r.repo, appears: 0, heat: 0, peak: 0, flag: null };
    e.appears++; e.heat += r.heat || 0; e.peak = Math.max(e.peak, r.heat || 0);
    if (r.flag) e.flag = r.flag;
    hot.set(r.repo, e);
  }
}
const hotList = [...hot.values()].sort((a, b) => b.appears - a.appears || b.heat - a.heat).slice(0, 12);

// human-chart regulars
const hum = new Map();
for (const h of hours) {
  for (const r of (h.top_human || [])) {
    const e = hum.get(r.repo) || { repo: r.repo, appears: 0, human: 0 };
    e.appears++; e.human += r.human || 0;
    hum.set(r.repo, e);
  }
}
const humList = [...hum.values()].sort((a, b) => b.appears - a.appears || b.human - a.human).slice(0, 10);

// biggest one-hour risers (highest heat among repos that were NEW to the chart)
const risers = [];
for (const h of hours) {
  for (const r of (h.top_hot || [])) {
    if (r.trend === 'new' && (r.heat || 0) >= 40) {
      risers.push({ hour: h.hour, repo: r.repo, heat: r.heat || 0, pushes: r.pushes || 0, actors: r.actors || 0, flag: r.flag });
    }
  }
}
risers.sort((a, b) => b.heat - a.heat);
const riserList = risers.slice(0, 10);

// persistent farm ledger (botnet_watch across hours)
const farms = new Map();
for (const h of hours) {
  for (const f of (h.botnet_watch || [])) {
    const e = farms.get(f.repo) || { repo: f.repo, hours_seen: 0, max_pushes: 0, first: f.first_seen, last: f.last_seen };
    e.hours_seen = Math.max(e.hours_seen, f.hours_seen || 0);
    e.max_pushes = Math.max(e.max_pushes, f.max_pushes || 0);
    if (f.first_seen && (!e.first || f.first_seen < e.first)) e.first = f.first_seen;
    if (f.last_seen && (!e.last || f.last_seen > e.last)) e.last = f.last_seen;
    farms.set(f.repo, e);
  }
}
const farmList = [...farms.values()]
  .sort((a, b) => b.hours_seen - a.hours_seen || b.max_pushes - a.max_pushes)
  .slice(0, 12);

// languages
const langs = new Map();
for (const h of hours) {
  for (const l of (h.top_languages || [])) {
    const e = langs.get(l.language) || { language: l.language, events: 0, hours: 0 };
    e.events += l.events || 0; e.hours++;
    langs.set(l.language, e);
  }
}
const langList = [...langs.values()].sort((a, b) => b.events - a.events).slice(0, 10);

// star radar cumulative
const starLoopTotal = series.reduce((a, s) => a + (s.starLoops || 0), 0);
const starOnlyTotal = series.reduce((a, s) => a + (s.starOnly || 0), 0);
const watcherTotal = series.reduce((a, s) => a + (s.watchers || 0), 0);

const firstLabel = series[0].hour;
const lastLabel = series[n - 1].hour;

// ---------- helpers ----------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const pct = (x) => (Math.round(x * 10) / 10).toFixed(1) + '%';
const fDate = (l) => {
  // 2026-08-13-3 -> Aug 13 · hour 3
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d+)$/.exec(l || '');
  if (!m) return l || '';
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MON[+m[2] - 1]} ${+m[3]} · hour ${m[4]}`;
};

// inline SVG line chart (mirrors report.cjs)
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
  const b = vals.map((v, i) => {
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
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(opts.label)}">${grid}${b}${xl}</svg>`;
}

const flagBadge = (f) => {
  if (!f) return '';
  const map = { 'push-bot': 'red', 'push-loop': 'red', 'bot-loop': 'red', 'issue-loop': 'red', 'star-loop': 'red', 'ci-demo': 'red', 'star-only': 'green' };
  return ` <span class="badge ${map[f] || ''}">${esc(f)}</span>`;
};

// ---------- page ----------
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>48h Digest — the last ${n} hours of GitHub, distilled · GitHub Pulse</title>
<meta name="description" content="The 48-hour digest from GitHub Pulse: ${n} hours, ${fmt(totalEvents)} events, ${fmt(totalRepos)} repos touched, ${pct(avgSpam)} average spam share. Hot-chart regulars, farm evolution, star-bomb radar, language mix.">
<meta property="og:type" content="article">
<meta property="og:title" content="48h Digest — what GitHub actually looked like for ${n} hours straight">
<meta property="og:description" content="${n} hours of the full GH event stream: ${fmt(totalEvents)} events, ${fmt(totalRepos)} repos, ${pct(avgSpam)} avg push-spam share, ${totalDemoted.toLocaleString('en-US')} farm repos demoted. Charts inside.">
<meta property="og:url" content="https://github-pulse.surge.sh/weekly.html">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#07070c;--panel:#0e0e18;--panel2:#12121f;--border:#1d1d2e;--text:#e8e8f2;--dim:#8b8ba3;--faint:#5a5a74;--accent:#7c6cff;--gold:#ffd166;--silver:#c0c7d1;--bronze:#e08e5a;--green:#34d399;--red:#f87171;--orange:#fb923c;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--sans:'Space Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}
.bg-glow{position:fixed;inset:0;pointer-events:none;background:radial-gradient(900px 500px at 75% -10%,rgba(124,108,255,.10),transparent 60%),radial-gradient(700px 420px at 10% 110%,rgba(255,209,102,.05),transparent 60%);z-index:0}
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
.stat-num.gold{color:var(--gold)}
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
.footer{border-top:1px solid var(--border);margin:40px 0 0;padding:26px 0 48px;color:var(--faint);font-size:12.5px}
.footer a{color:var(--dim)}
.note{font-family:var(--mono);font-size:11px;color:var(--faint)}
@media(max-width:640px){.hero h1{font-size:30px}.stats{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="bg-glow"></div><div class="bg-grid"></div>
<div class="topbar"><div class="wrap topbar-inner">
  <a class="brand" href="./index.html"><span class="brand-mark">📡</span><span class="brand-name">GITHUB&nbsp;PULSE</span></a>
  <nav class="nav">
    <a href="./index.html">live</a>
    <a href="./weekly.html" class="live">digest</a>
    <a href="./report.html">report</a>
    <a href="./api.html">api</a>
  </nav>
</div></div>
<div class="wrap">
  <div class="hero">
    <div class="kicker">48-hour digest · rolling window</div>
    <h1>The last <span class="accent">${n} hours</span> of GitHub, distilled.</h1>
    <p class="sub">Every hour, GitHub Pulse ingests the full public event stream and ranks it. This page is the cumulative view: ${fDate(firstLabel)} → ${fDate(lastLabel)}. ${fmt(totalEvents)} events across ${fmt(totalRepos)} repo-hours — and the machines hiding inside it.</p>
    <div class="stats">
      <div class="stat"><div class="stat-num">${n}</div><div class="stat-label">hours tracked</div></div>
      <div class="stat"><div class="stat-num">${fmt(totalEvents)}</div><div class="stat-label">events ingested</div></div>
      <div class="stat"><div class="stat-num">${fmt(totalRepos)}</div><div class="stat-label">repo-hours seen</div></div>
      <div class="stat"><div class="stat-num ${cur.spam > 50 ? 'warn' : 'good'}">${pct(cur.spam)}</div><div class="stat-label">push spam · latest hour</div></div>
      <div class="stat"><div class="stat-num ${avgSpam > 50 ? 'warn' : ''}">${pct(avgSpam)}</div><div class="stat-label">avg spam share</div></div>
      <div class="stat"><div class="stat-num warn">${fmt(totalDemoted)}</div><div class="stat-label">farm repos demoted</div></div>
      <div class="stat"><div class="stat-num gold">${farmList.length}</div><div class="stat-label">persistent farms</div></div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Spam pressure</h2><span class="h-num">push_spam_pct / hour</span></div>
    <div class="panel-sub">Share of ALL push events that came from confidently-flagged push-farm repos. Peak ${pct(maxSpam.spam)} at ${maxSpam.label}.</div>
    ${lineChart(series, { key: 'spam', color: '#f87171', unit: '%', fill: true, label: 'spam share per hour' })}
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Heat chart regulars</h2><span class="h-num">top_hot appearances</span></div>
    <div class="panel-sub">Repos that kept ranking in the top-25 hottest across the window — sustained momentum, not one-hour spikes.</div>
    <table>
      <tr><th>#</th><th>repo</th><th class="mono">appearances</th><th class="mono">cumulative heat</th><th class="mono">peak heat</th><th>flag</th></tr>
      ${hotList.map((r, i) => `<tr><td class="mono">${i + 1}</td><td><a href="https://github.com/${esc(r.repo)}" rel="noopener" target="_blank">${esc(r.repo)}</a></td><td class="mono">${r.appears}/${n}</td><td class="mono">${fmt(r.heat)}</td><td class="mono">${fmt(r.peak)}</td><td>${flagBadge(r.flag)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Human-signal chart regulars</h2><span class="h-num">top_human appearances</span></div>
    <div class="panel-sub">The same ranking, but counting only human events (PRs, issues, stars, forks, releases, reviews by outside humans) — push noise removed entirely.</div>
    <table>
      <tr><th>#</th><th>repo</th><th class="mono">appearances</th><th class="mono">human score</th></tr>
      ${humList.map((r, i) => `<tr><td class="mono">${i + 1}</td><td><a href="https://github.com/${esc(r.repo)}" rel="noopener" target="_blank">${esc(r.repo)}</a></td><td class="mono">${r.appears}/${n}</td><td class="mono">${fmt(r.human)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Biggest one-hour risers</h2><span class="h-num">new to chart, heat ≥ 40</span></div>
    <div class="panel-sub">Repos that appeared on the hottest chart out of nowhere. A healthy share are flagged — that's the radar doing its job.</div>
    <table>
      <tr><th>hour</th><th>repo</th><th class="mono">heat</th><th class="mono">pushes</th><th class="mono">actors</th><th>flag</th></tr>
      ${riserList.map(r => `<tr><td class="mono">${esc(r.hour.slice(5))}</td><td><a href="https://github.com/${esc(r.repo)}" rel="noopener" target="_blank">${esc(r.repo)}</a></td><td class="mono">${r.heat}</td><td class="mono">${r.pushes}</td><td class="mono">${r.actors}</td><td>${flagBadge(r.flag)}</td></tr>`).join('')}
    </table>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Farm evolution</h2><span class="h-num">persistent botnet ledger</span></div>
    <div class="panel-sub">The longest-running push-farms of the window. <span class="mono">hours_seen</span> is cumulative tracked hours; <span class="mono">max_pushes</span> is their peak single-hour output. One actor. Hundreds of pushes. Every hour.</div>
    <table>
      <tr><th>#</th><th>repo</th><th class="mono">hours seen</th><th class="mono">peak pushes/hr</th><th>first</th><th>last</th></tr>
      ${farmList.map((f, i) => `<tr><td class="mono">${i + 1}</td><td><a href="https://github.com/${esc(f.repo)}" rel="noopener" target="_blank">${esc(f.repo)}</a></td><td class="mono">${f.hours_seen}h</td><td class="mono">${fmt(f.max_pushes)}</td><td class="mono">${esc(fDate(f.first))}</td><td class="mono">${esc(fDate(f.last))}</td></tr>`).join('')}
    </table>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Enforcement volume</h2><span class="h-num">demoted + suspicious per hour</span></div>
    <div class="panel-sub">Repos demoted from heat per hour (confident push-bots in red, lighter suspicious push-loops in dim).</div>
    ${bars(series, { key: 'demoted', color: '#7c6cff', hl: 'demoted', label: 'demoted repos per hour' })}
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Star-bomb radar</h2><span class="h-num">watch-only account sweep</span></div>
    <div class="panel-sub">Stars are the last untaxed heat vector (×8), so the radar tracks pure-watcher accounts and bare repos. Across the window: <span class="mono">${starLoopTotal} star-loops</span> demoted, <span class="mono">${fmt(starOnlyTotal)}</span> informational star-only badges, <span class="mono">${fmt(watcherTotal)}</span> watch-only account-hours.</div>
    ${bars(series, { key: 'watchers', color: '#ffd166', hl: 'watchers', label: 'watch-only accounts per hour' })}
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Language mix</h2><span class="h-num">top charted languages</span></div>
    ${bars(langList.map(l => ({ label: l.language, value: l.events })), { key: 'value', color: '#34d399', hl: 'value', label: 'language event share' })}
  </div>

  <div class="footer">
    Generated hourly by GitHub Pulse · <a href="./index.html">live radar</a> · <a href="./report.html">State of GitHub Spam</a> · <a href="./data/digest.xml">RSS</a> · <a href="https://github.com/Atheistam/github-pulse" rel="noopener" target="_blank">open source</a><br>
    <span class="note">Data: GH Archive public event stream. All detection is profile-based; demotion ≠ public accusation. Methodology in the report.</span>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync(OUT, html);
console.log(`[weekly] wrote ${OUT} (${(html.length / 1024).toFixed(0)} KB, ${n} hours)`);
