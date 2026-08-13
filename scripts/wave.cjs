// scripts/wave.cjs — farm-wave phase classifier for GitHub Pulse.
// Feed it a chronological series of {hour, spam} (spam = push_spam_pct).
// Classifies the current farm activity regime from the last 2 hours:
//   QUIET    < 35%                — farm lull
//   SURGING  >= 35% and +8pt/1h   — wave rolling in
//   DECAYING >= 35% and -8pt/1h   — wave receding
//   PEAK     >= 50% and stable    — sustained peak pressure
//   ELEVATED 35-50% and stable    — elevated but stable
'use strict';

function classifyWave(series) {
  const n = series.length;
  if (!n) return { phase: 'UNKNOWN', emoji: '❔', desc: 'no data', last: null, delta: null };
  const last = series[n - 1].spam;
  const prev = n > 1 ? series[n - 2].spam : last;
  const delta = Math.round((last - prev) * 10) / 10;
  let phase, emoji, desc;
  if (last < 35) {
    phase = 'QUIET'; emoji = '😴';
    desc = `farm lull — spam share ${last.toFixed(1)}% of pushes`;
  } else if (delta >= 8) {
    phase = 'SURGING'; emoji = '🌊';
    desc = `farm wave rolling in — spam +${delta}pt in 1h → ${last.toFixed(1)}% of pushes`;
  } else if (delta <= -8) {
    phase = 'DECAYING'; emoji = '📉';
    desc = `wave receding — spam ${delta}pt in 1h → ${last.toFixed(1)}% of pushes`;
  } else if (last >= 50) {
    phase = 'PEAK'; emoji = '⛰️';
    desc = `sustained peak pressure — ${last.toFixed(1)}% of pushes are farm spam`;
  } else {
    phase = 'ELEVATED'; emoji = '⚖️';
    desc = `elevated but stable — ${last.toFixed(1)}% of pushes are farm spam`;
  }
  return { phase, emoji, last: Math.round(last * 10) / 10, delta, desc };
}

module.exports = { classifyWave };
