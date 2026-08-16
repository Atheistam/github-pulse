const fs = require('fs');
let src = fs.readFileSync('pipeline/report.cjs', 'utf8');
const verdictIdx = src.indexOf('VERDICT (v5.28)');
if (verdictIdx === -1) { console.error('verdict not found'); process.exit(1); }
const start = src.lastIndexOf('<div class', verdictIdx);
if (start === -1) { console.error('div start not found'); process.exit(1); }
const end = src.indexOf('>', src.indexOf('padding-left:12px', start)) + 1;
if (end <= start) { console.error('div end not found'); process.exit(1); }
const clean = '<div class="lede" style="margin-top:16px;border-left:3px solid #fbbf24;padding-left:12px">';
const old = src.slice(start, end);
src = src.slice(0, start) + clean + src.slice(end);
fs.writeFileSync('pipeline/report.cjs', src);
console.log('replaced:', JSON.stringify(old), '->', JSON.stringify(clean));
