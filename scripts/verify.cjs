/* Headless verification of the live GitHub Pulse site: console errors + screenshot */
const { chromium } = require('playwright');

(async () => {
  const url = 'https://github-pulse.surge.sh/';
  const browser = await chromium.launch({
    // DNS-robust: the local (Tailscale) resolver intermittently fails on
    // surge.sh — pin the edge IP so verification isn't flaky.
    args: ['--host-resolver-rules=MAP github-pulse.surge.sh 159.203.50.177'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);

  const stats = await page.evaluate(() => ({
    events: document.getElementById('stat-events').textContent,
    repos: document.getElementById('stat-repos').textContent,
    hours: document.getElementById('stat-hours').textContent,
    asof: document.getElementById('asof-badge').textContent,
    gainerRows: document.querySelectorAll('#gainers-body tbody tr').length,
    humanRows: document.querySelectorAll('#human-body tbody tr').length,
    activeRows: document.querySelectorAll('#active-body tbody tr').length,
    actorCards: document.querySelectorAll('#new-body .card').length,
    langRows: document.querySelectorAll('#langs-body .lang-row').length,
    relRows: document.querySelectorAll('#releases-body .rel').length,
    histRows: document.querySelectorAll('#history-body .hist-row').length,
    trendBadges: document.querySelectorAll('.trend').length,
    flagBadges: document.querySelectorAll('.flag').length,
    botRows: document.querySelectorAll('#bots-body tbody tr').length,
    botnetRows: document.querySelectorAll('#botnets-body .hist-row').length,
    botSub: document.getElementById('bot-sub').textContent,
    hotTitle: (document.querySelector('#panel-gainers h2') || {}).textContent,
    firstHot: (document.querySelector('#gainers-body tbody tr td:nth-child(2) a') || {}).textContent,
    firstActor: (document.querySelector('#new-body .card-name') || {}).textContent,
  }));
  console.log('HTTP:', resp.status());
  console.log('STATS:', JSON.stringify(stats, null, 2));
  console.log('CONSOLE_ERRORS:', errors.length ? errors.join(' | ') : 'none');
  await page.screenshot({ path: process.argv[2] || 'shot.png', fullPage: true });
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('VERIFY FAILED:', e.message); process.exit(2); });
