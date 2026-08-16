const fs = require('fs');
const files = fs.readdirSync('site/data/history').filter(f => /^\d{4}-\d{2}-\d{2}-\d{1,2}\.json$/.test(f)).map(f => f.replace(/\.json$/, ''));
const cmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });
files.sort(cmp);
console.log('total:', files.length, 'first:', files[0], 'last:', files[files.length - 1]);
let gaps = [];
for (let i = 1; i < files.length; i++) {
  const a = files[i - 1], b = files[i];
  const m1 = /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(a), m2 = /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(b);
  const n1 = Date.parse(m1[1] + 'T00:00:00Z') / 86400000 * 24 + Number(m1[2]);
  const n2 = Date.parse(m2[1] + 'T00:00:00Z') / 86400000 * 24 + Number(m2[2]);
  if (n2 - n1 !== 1) gaps.push(a + ' -> ' + b);
}
console.log('gaps:', gaps.length ? gaps.join(', ') : 'NONE');
