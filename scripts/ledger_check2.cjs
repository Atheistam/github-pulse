const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('site/data/farm_actors.json', 'utf8'));
console.log('type:', Array.isArray(raw) ? 'array' : typeof raw);
const keys = Object.keys(raw).slice(0, 3);
console.log('sample keys:', keys);
const lower = Object.keys(raw).map(k => k.toLowerCase());
console.log('wonder0208 in ledger:', lower.includes('wonder0208'));
if (lower.includes('wonder0208')) {
  const real = Object.keys(raw).find(k => k.toLowerCase() === 'wonder0208');
  console.log('wonder0208 entry:', JSON.stringify(raw[real]));
}
console.log('timschoenle in ledger:', lower.includes('timschoenle'));
