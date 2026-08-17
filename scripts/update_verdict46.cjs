// One-shot: replace the v5.31 verdict block in pipeline/report.cjs with the v5.32 verdict.
const fs = require('fs');
const p = 'pipeline/report.cjs';
let src = fs.readFileSync(p, 'utf8');

const startMark = '<b>VERDICT (v5.31)';
const endMark = '</b></div>` : \'\'}';

const i0 = src.indexOf(startMark);
const i1 = src.indexOf(endMark);
if (i0 < 0 || i1 < 0 || i1 < i0) {
  console.error('markers not found', i0, i1);
  process.exit(1);
}

const verdict = `<b>VERDICT (v5.32): THE WAVE LEARNED TO OSCILLATE — the re-breach did NOT become a siege, and the factory magazine is spent again. h6 53.0% → h7 49.1% (−3.9pt dip) → h8 58.0% RE-BREACH (+8.9pt) → h9 57.1% (holds): 2 of the last 3 hours ≥50%, but instead of parking above the line the wave now swings ±15pt around it — 29.6 → 37.5 → 53.0 → 49.1 → 58.0 → 57.1. The 18-hour siege is not coming back; neither is collapse. The new regime is volatility on a ~50% floor. FACTORY MAGAZINE SPENT — the 4,830/4h burst decayed exactly like the 5,626: 335 → 157 → 39 mints (h9 = near-silence, re-arm window open for the next 2–4h); the standing army carried h8–h9 ≥50% on a dead factory again. <b>SPRAY RADAR CATCHES ITS SECOND FARM:</b> DevZonayed — 155 pushes/hr across <b>26 repos</b> (max 51, avg 6), spraying the new "AI-skills" repo template (nexalance-skill-mastra-ai-mastra, nexalance-skill-mcp-use-mcp-use) — a spray signature distinct from bogdanstancu's 12-repo pattern. bogdanstancu1119-maker remains the #1 non-bot actor for a 6th straight hour but is DECAYING (334/300/232 → 262/222/189); BailiffDisengage and hayesjonathan9829 were one-night farms (zero h7–h9). <b>zerotraceh1: 24h+ of silence — its longest dormancy ever (3× any previous gap)</b>; the cycler that peaked at 555/hr is effectively retired (ledger 111h). <b>ugmoddev fell off the bot_watch radar for the first time in 154 hours</b> — farm pushes now under every cutoff (still 111/81/80 events via top_actors; 154/154 ledger hours; the structural fade is complete: 364/hr peak → ~80). elad-cmd back to shift work (75/59/0, 154/154 ledger hrs). animal-lover12 faded from every visible list (ledger last seen h8). New faces: s741dev — a veteran since Aug 11 — resurfaces as #4 actor (124 events h9); aerlansanat = #1 farm at h9 (xkwfxh, 56); divideregionwrench84 (97 events h8, 2h); GlueSenatorCultivate (68 events h9, NOT in ledger — new word-salad template). Demotions h8 2,978 = <b>#8 all-time</b>. Ledger 27,332 (25,716 confirmed) — decline resumed as TTL outran the 531 minted (28,146 → 27,332). HN: 49310247 ALIVE 45h+ (all-time URL-post record), karma 3 → no posts. NOON RITUAL DAY 7 = next window (Aug 17 h12). 80 of 154 hours ≥50% · 25.18M events.`;

const out = src.slice(0, i0) + verdict + src.slice(i1);
fs.writeFileSync(p, out);
console.log('verdict replaced:', i0, '->', i1, 'new len', verdict.length);
