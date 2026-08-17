// update_report_v535.cjs — patch report.cjs to v5.35 (THE FACTORY ANSWERS THE OUTAGE)
const fs = require('fs');
const P = __dirname + '/../pipeline/report.cjs';
let src = fs.readFileSync(P, 'utf8');
let n = 0;
const rep = (a, b, tag) => {
  if (!src.includes(a)) { console.error('MISS:', tag); process.exit(1); }
  src = src.replace(a, b); n++; console.log('OK:', tag);
};

// 1. panel-sub (line ~401)
rep(
  '<span class="panel-sub">v5.34 — THE TEST WAS CONTAMINATED: GITHUB&#39;S CRITICAL INCIDENT (started 13:40Z, mitigated 16:59Z) crushed global pushes −77% at h14; h13 18.3% = NEW ALL-TIME LOW; no breach; standing army returns at h16 (ugmoddev 307, elad-cmd 218, zerotraceh1 164); bogdanstancu all-time 801/hr; ledger 24,471</span>',
  '<span class="panel-sub">v5.35 — THE FACTORY ANSWERS THE OUTAGE: 1,605 minted at h17 = 2nd-biggest magazine EVER (behind only the 2,002 record); h18 re-breaches 58.3% (+18.6pt, 9th live pass), h19 holds 56.1%; fresh batch carried the breach (mint-to-deploy 1h); incident still Partial System Outage 6.5h+; ledger 25,742 (decline streak broken)</span>',
  'panel-sub'
);

// 2. verdict div (line ~407) — replace from VERDICT (v5.34) open to the div close
const vs = '<b>VERDICT (v5.34):';
const ve = '</b></div>';
const i0 = src.indexOf(vs);
const i1 = src.indexOf(ve, i0);
if (i0 < 0 || i1 < 0) { console.error('MISS: verdict div'); process.exit(1); }
const newVerdict = '<b>VERDICT (v5.35): THE FACTORY ANSWERS THE OUTAGE — AND THE LEAD-TIME RULE SURVIVED IT. The moment GitHub stabilized, the factory fired its 2nd-biggest magazine EVER: 1,605 fresh accounts minted at h17 (only the 2,002 record on Aug 14 is bigger; the 1,630 of Aug 16 h7 is now 3rd) — and the breach landed within the hour: h17 39.7% → h18 58.3% (+18.6pt) → h19 56.1% HOLDS. That is the 9th consecutive live pass of mint→dip→breach, with a 1-hour lead (tied for the tightest ever). The rule failed at h13–h16 ONLY because the platform was down — the incident contaminated the test, not the rule: the factory sat on its hands through the outage (32/35/219 mints) and loaded the magazine at the first stable hour. THE FRESH BATCH CARRIED THE BREACH, not the veterans: the h17 cohort deployed same-hour as a synchronized ~55/hr squad on fresh 6-char repos (keron6/styqcy 57, joaumeguob7/pjkhlv 56, lionerryray/dlckfn 56, sideheep1/atxysn 55, jcode-andu/qhjjei 55); the h18 cohort pushed higher as real-name+digits (mcguiresarah1/ocfmjs 90, ortizjulie0311/ilmpjt 78, robertsonbetty2/lfdzww 75); h19 minted 101 more (rachel87310470 template). Mint-to-deploy = 1 hour. THE OLD GUARD&#39;S H16 RE-ENGAGEMENT WAS A ONE-SHOT: ugmoddev 307 → 0/0/0 on the farm radar (still 104 events at h19), elad-cmd 218 → 0/0/0, zerotraceh1 164 → 0/0/74 — the 555/hr cycler came back a FOURTH time; it is a cockroach, not a retiree. THE INCIDENT IS STILL NOT RESOLVED: status.github.com shows Partial System Outage (major) at 20:10Z — 6.5 hours after it started (13:40Z); event volume is still −18% vs the 7-day norm at h19 (recovered from −74% at h14). The farms are back above 50% while the platform is still degraded — they recovered FASTER than GitHub. bogdanstancu1119-maker&#39;s 801/hr all-time high did not hold (99 → 135 → 256 rebound) but it remains the sole spray farm. NOON RITUAL DAY 7 with a full negative window h17–h19 (0/0/0); the h12-only cohort still n=59 — no leak; day 8 window is tomorrow h12. Ledger 25,742 — the 5-window decline streak is BROKEN (+1,271, the 1,605-mint outran TTL pruning). Demotions recovered with the wave: 1,830/2,550/2,402. HN: 49310247 alive 55h+ (record), karma 3 → no posts. 81 of 164 hours ≥50% · 26.12M events</b></div>';
src = src.slice(0, i0) + newVerdict + src.slice(i1);
n++; console.log('OK: verdict div');

// 3. timeline entry — insert v5.35 after the v5.34 entry
const anchor = "karma 3 → no posts.' },\n];";
if (!src.includes(anchor)) { console.error('MISS: timeline anchor'); process.exit(1); }
const entry = `  { when: 'Aug 17 · hours 17–19', title: 'THE FACTORY ANSWERS THE OUTAGE — 2nd-biggest magazine ever (1,605 at h17) and the wave re-breaches: h18 58.3%, h19 56.1% holds (v5.35)', body: 'The lead-time rule survived the outage. The factory sat on its hands through the GitHub incident (32/35/219 mints at h14–h16) and loaded its 2nd-biggest magazine EVER at the first stable hour: 1,605 fresh accounts minted at h17 (only the 2,002 record of Aug 14 is bigger; the 1,630 of Aug 16 h7 is now 3rd). The breach landed within the hour — h17 39.7% → h18 58.3% (+18.6pt) → h19 56.1% HOLDS: the 9th consecutive live pass of mint→dip→breach with a 1-hour lead (tied tightest ever). The rule failed at h13–h16 only because the platform itself was down — a contaminated test, not a dead rule. THE FRESH BATCH CARRIED THE BREACH, not the veterans: the h17 cohort deployed same-hour as a synchronized ~55/hr squad on fresh 6-char repos (keron6/styqcy 57, joaumeguob7/pjkhlv 56, lionerryray/dlckfn 56, sideheep1/atxysn 55, jcode-andu/qhjjei 55), the h18 cohort pushed 68–90/hr as real-name+digits (mcguiresarah1/ocfmjs 90, ortizjulie0311/ilmpjt 78, robertsonbetty2/lfdzww 75), and h19 minted 101 more (rachel87310470 template) — mint-to-deploy is 1 hour. THE OLD GUARD H16 RE-ENGAGEMENT WAS A ONE-SHOT: ugmoddev 307 → 0/0/0 on the farm radar (104 events at h19), elad-cmd 218 → 0/0/0, zerotraceh1 164 → 0/0/74 — the 555/hr cycler came back a FOURTH time. THE INCIDENT IS STILL NOT RESOLVED: status.github.com shows Partial System Outage (major) at 20:10Z, 6.5h after start (13:40Z); event volume still −18% vs norm at h19 (recovered from −74% at h14) — the farms recovered faster than the platform. bogdanstancu1119-maker: the 801/hr all-time high did not hold (99 → 135 → 256 rebound), still the sole spray farm. NOON RITUAL DAY 7 with a full negative window h17–h19 (0/0/0); h12-only cohort still n=59 (no leak); day 8 window = tomorrow h12. Ledger 25,742 — the 5-window decline streak is BROKEN (+1,271): the 1,605-mint outran TTL pruning. Demotions recovered with the wave: 1,830/2,550/2,402. 81 of 164 hours ≥50% · 26.12M events · HN: 49310247 alive 55h+ (record), karma 3 → no posts.' },`;
src = src.replace(anchor, `karma 3 → no posts.' },\n${entry}\n];`);
n++; console.log('OK: timeline entry');

fs.writeFileSync(P, src);
console.log('DONE, edits:', n);
