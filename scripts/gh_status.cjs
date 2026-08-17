#!/usr/bin/env node
// gh_status.cjs — fetch GitHub status + unresolved incidents (for verdict context).
// Lesson from run 48: the mint->dip->breach rule failed because GitHub had a
// critical incident (13:40Z-16:59Z Aug 17) that crushed ALL pushes -77% — a
// platform event, not a farm event. Future verdicts must know the platform state.
const https = require('https');
function get(path) {
  return new Promise((resolve, reject) => {
    https.get('https://www.githubstatus.com/api/v2' + path, { timeout: 15000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json: ' + d.slice(0, 120))); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}
(async () => {
  try {
    const st = await get('/status.json');
    const inc = await get('/incidents/unresolved.json');
    console.log(`[ghstatus] ${st.status.description} (${st.status.indicator})`);
    if (inc.incidents && inc.incidents.length) {
      for (const i of inc.incidents) {
        const u = i.incident_updates && i.incident_updates[0];
        console.log(`[ghstatus] INCIDENT: ${i.name} | impact=${i.impact} | started=${i.started_at} | status=${i.status}${u ? ' | ' + u.body.slice(0, 200) : ''}`);
      }
    } else {
      console.log('[ghstatus] no unresolved incidents');
    }
  } catch (e) {
    console.log('[ghstatus] fetch failed: ' + e.message);
  }
})();
