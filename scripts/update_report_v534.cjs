// update_report_v534.cjs — patch report.cjs to v5.34 (incident-contaminated test)
const fs = require('fs');
const P = __dirname + '/../pipeline/report.cjs';
let src = fs.readFileSync(P, 'utf8');
let n = 0;
const rep = (a, b, tag) => {
  if (!src.includes(a)) { console.error('MISS:', tag); process.exit(1); }
  src = src.replace(a, b); n++; console.log('OK:', tag);
};

// 1. panel-sub (line 400)
rep(
  '<span class="panel-sub">v5.31 — THE LEAD-TIME RULE IS REBORN (h3 42.2% → h4 29.6% dip → h6 53.0% re-breach, 7th live pass); factory mints 4,830 in 4h (3rd-biggest 3h ever 3,984); Janfindl day-3 FALSIFIED; h2-shift cohort = 48 actors; ledger 28,146 (+1,733, decline streak broken)</span>',
  '<span class="panel-sub">v5.34 — THE TEST WAS CONTAMINATED: GITHUB&#39;S CRITICAL INCIDENT (started 13:40Z, mitigated 16:59Z) crushed global pushes −77% at h14; h13 18.3% = NEW ALL-TIME LOW; no breach; standing army returns at h16 (ugmoddev 307, elad-cmd 218, zerotraceh1 164); bogdanstancu all-time 801/hr; ledger 24,471</span>',
  'panel-sub'
);

// 2. verdict div (line 406) — replace from VERDICT (v5.33) open to the div close
const vs = '<b>VERDICT (v5.33):';
const ve = '</b></div>';
const i0 = src.indexOf(vs);
const i1 = src.indexOf(ve, i0);
if (i0 < 0 || i1 < 0) { console.error('MISS: verdict div'); process.exit(1); }
const newVerdict = '<b>VERDICT (v5.34): THE TEST WAS CONTAMINATED — GITHUB WENT DOWN. h13 18.3% is the NEW ALL-TIME LOW (beating h13 Aug14 22.5%, h5 Aug13 23.4%, and today&#39;s h12 25.5%) and h13–h16 never breached: the mint→dip→breach rule FAILED its 8th live test — because status.github.com logged a CRITICAL INCIDENT starting 13:40Z (API Requests, Actions, Git Operations, Issues, Pages, Pull Requests, Webhooks; mitigated 16:59Z, monitoring after). Global pushes fell to 33,435/hr at h14 (−77% vs h8&#39;s 144,214); total events ran 56–77% BELOW their 7-day hour norms h13–h15; even github-actions[bot] crashed 15,910 → 4,868 events. The farms retreated on top of it (spam 25.5 → 18.3 → 23.1 → 25.8 → 26.7%) — but no breach was possible while the whole platform was degraded: the lead-time rule models farm-vs-platform dynamics, and it does not predict through a GitHub outage. THE RECOVERY ARRIVED WITH THE MITIGATION HOUR: h16 = 132,404 events (−17% vs h8) and the standing army RETURNED IN FORCE — ugmoddev 307/hr (biggest since 08-16-0&#39;s 364), elad-cmd 218/hr on fresh repo psycho-usage (first activity since h8), zerotraceh1 164/hr on er-forge-probe (the 555/hr cycler returned after 27h+ silence — retirement retracted AGAIN) — while the factory minted 219 fresh accounts at h16 (526 in the window). bogdanstancu1119-maker — the SOLE surviving spray farm — hit an ALL-TIME HIGH 801 events/hr at h16 (592 at h15; 12 repos, max 64/repo), now the #2 most-active actor on GitHub behind github-actions[bot] and ahead of dependabot[bot]. NOON RITUAL DAY 7 with a full negative window: loganfoxdale zero at h13–h16; the h12-only cohort still n=59 after 4 more hours of data (no leak). Demotions collapsed with the wave (775/260/411/1063 — nothing to catch). Ledger 24,471 (−2,419, −9% in one window): TTL pruning outran minting 5:1 as the collapse made farms undetectable. HN: 49310247 alive 52h+ (record), karma 3 → no posts. 80 of 161 hours ≥50% · 25.74M events';
src = src.slice(0, i0) + newVerdict + src.slice(i1);
n++; console.log('OK: verdict div');

// 3. timeline entry — insert v5.34 after the v5.33 entry
const anchor = 'karma 3 → no posts.\' },\n];';
if (!src.includes(anchor)) { console.error('MISS: timeline anchor'); process.exit(1); }
const entry = `  { when: 'Aug 17 · hours 13–16', title: 'THE TEST WAS CONTAMINATED — GITHUB WENT DOWN; h13 18.3% is the NEW ALL-TIME LOW and the breach never came; the standing army returns at h16 (v5.34)', body: 'The mint→dip→breach test FAILED — because the platform itself collapsed. h13 18.3% is the LOWEST spam hour in 161h of history (beating h13 Aug14 22.5% and h5 Aug13 23.4%), then h14 23.1% → h15 25.8% → h16 26.7%: seven straight sub-50% hours (h10–h16). The cause is now proven: GITHUB HAD A CRITICAL INCIDENT — status.github.com logged "Incident with GitHub.com" starting 13:40Z (inside h13), affecting API Requests, Actions, Git Operations, Issues, Pages, Pull Requests and Webhooks; still "Partial System Outage" at 16:59Z; mitigation logged 16:59:38Z. The archive evidence: global pushes collapsed to 33,435/hr at h14 vs 144,214 at h8 (−77%); total events ran 56–77% BELOW their 7-day hour norms h13–h15; github-actions[bot] crashed 15,910 → 4,868 events/hr. The farms retreated on top of it — but the breach never came because the whole ecosystem was degraded, not just the farms: the lead-time rule models farm-vs-platform dynamics and does not predict through a GitHub outage. THE RECOVERY: h16 (the mitigation hour) = 132,404 events (−17% vs h8) and the STANDING ARMY RETURNED IN FORCE — ugmoddev 307/hr (biggest since 08-16-0\\'s 364), elad-cmd 218/hr on fresh repo psycho-usage (first activity since h8 — the 6h+ gap was shift length, not retirement), zerotraceh1 164/hr on er-forge-probe (the 555/hr cycler returned after 27h+ silence; retirement retracted AGAIN) — and the factory re-armed alongside: 219 fresh accounts minted h16 (h13 240 → h14 32 → h15 35 → h16 219 = 526 in the window). bogdanstancu1119-maker — the SOLE surviving spray farm — hit an ALL-TIME HIGH 801 events/hr at h16 (592 at h15; 12 repos, max 64/repo), now the #2 most-active actor on GitHub behind github-actions[bot] and ahead of dependabot[bot]. NOON RITUAL DAY 7 CONFIRMED with a full negative window: loganfoxdale zero at h13–h16; the h12-only cohort held at n=59 even with 4 more hours of data — the noon scheduler did not leak. Demotions collapsed with the wave (775/260/411/1063 — nothing to catch). Ledger 24,471 (−2,419, −9% in one window): TTL pruning outran minting 5:1 as the collapse made farms undetectable. 80 of 161 hours ≥50% · 25.74M events · HN: 49310247 alive 52h+ (record), karma 3 → no posts.' },`;
src = src.replace(anchor, `karma 3 → no posts.' },\n${entry}\n];`);
n++; console.log('OK: timeline entry');

fs.writeFileSync(P, src);
console.log('DONE, edits:', n);
