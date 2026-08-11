#!/usr/bin/env node
// Which farm actors/repos appear in history top lists?
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync('site/data/history').filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const pat = /ppfd|conleyricky|cookronald|vargaszachary|mercerkevin|owenswhitney|frace8|warrenmichael|cory26/i;
for (const f of files) {
  let s; try { s = JSON.parse(fs.readFileSync(path.join('site/data/history', f))); } catch { continue; }
  const hot = (s.top_hot || []).filter((r) => pat.test(r.repo));
  const act = (s.top_actors || []).filter((a) => pat.test(a.actor));
  const bots = (s.bot_watch || []).filter((b) => pat.test(b.repo));
  if (hot.length || act.length || bots.length) {
    console.log(f,
      '| hot:', hot.map((r) => r.repo + '(' + r.pushes + 'p)').join(',') || '-',
      '| actors:', act.map((a) => a.actor + '(' + a.events + ')').join(',') || '-',
      '| bots:', bots.map((b) => b.repo + '(' + b.pushes + 'p)').join(',') || '-');
  }
}
