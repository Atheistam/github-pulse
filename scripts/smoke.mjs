#!/usr/bin/env node
/*
 * GitHub Pulse — headless browser smoke test (Firefox + WebDriver BiDi, zero deps).
 * Verifies the LIVE page and the ARCHIVE (?hour=) page render real data
 * in a real browser engine. Exit 0 = pass. Reusable every run.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FF = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const PORT = 9337;
const BASE = process.argv[2] || 'https://github-pulse.surge.sh';
const profile = mkdtempSync(join(tmpdir(), 'pulse-ff-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ff = spawn(FF, [
  '--headless', `--remote-debugging-port=${PORT}`,
  `--profile=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const fails = [];
try {
  // 1) wait for BiDi endpoint
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const c = await (await fetch(`http://127.0.0.1:${PORT}/session`)).text();
      ready = c.length > 0;
    } catch { /* not up yet */ }
    if (!ready) await sleep(500);
  }
  if (!ready) throw new Error('BiDi endpoint never came up');

  // 2) open session (Firefox 154 accepts a plain WS handshake)
  let msgId = 0;
  const pending = new Map();
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('session.new', { capabilities: {} });

  // 3) open a tab
  const { context } = await send('browsingContext.create', { type: 'tab' });

  const navigate = async (url) => {
    await send('browsingContext.navigate', { context, url, wait: 'complete' });
    await sleep(3000); // let data fetches settle
  };

  const evalJs = async (expr) => {
    const r = await send('script.evaluate', {
      target: { context },
      expression: expr, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };

  // 4) ---- ARCHIVE MODE ----
  await navigate(`${BASE}/?hour=2026-08-11-0`);
  const arch = await evalJs(`JSON.stringify({
    title: document.title,
    bannerHidden: document.getElementById('archive-banner').hidden,
    archiveHour: document.getElementById('archive-hour').textContent,
    asof: document.getElementById('asof-badge').textContent,
    statEvents: document.getElementById('stat-events').textContent,
    statRepos: document.getElementById('stat-repos').textContent,
    gainerRows: document.querySelectorAll('#gainers-body tbody tr').length,
    humanRows: document.querySelectorAll('#human-body tbody tr').length,
    botRows: document.querySelectorAll('#bots-body tbody tr').length,
    histLinks: document.querySelectorAll('.hist-link').length,
    firstHistHref: document.querySelector('.hist-link') ? document.querySelector('.hist-link').getAttribute('href') : null,
    firstGainer: document.querySelector('#gainers-body .repo-name') ? document.querySelector('#gainers-body .repo-name').textContent : null
  })`);

  // 5) ---- LIVE MODE ----
  await navigate(`${BASE}/`);
  const live = await evalJs(`JSON.stringify({
    bannerHidden: document.getElementById('archive-banner').hidden,
    asof: document.getElementById('asof-badge').textContent,
    asofLive: document.getElementById('asof-badge').classList.contains('live'),
    statEvents: document.getElementById('stat-events').textContent,
    histLinks: document.querySelectorAll('.hist-link').length,
    botStats: document.querySelectorAll('#bot-stats .bot-stat').length
  })`);

  // 6) ---- WEEKLY DIGEST ----
  await navigate(`${BASE}/weekly.html`);
  const weekly = await evalJs(`JSON.stringify({
    title: document.title,
    hasCharts: document.querySelectorAll('svg.chart').length,
    tableRows: document.querySelectorAll('table tr').length,
    hasSpam: document.body.textContent.includes('Spam pressure'),
    hasFarms: document.body.textContent.includes('Farm evolution'),
    hasWave: document.body.textContent.includes('farm wave')
  })`);

  ws.close();

  const archObj = JSON.parse(arch), liveObj = JSON.parse(live), weeklyObj = JSON.parse(weekly);
  if (archObj.bannerHidden !== false) fails.push('archive banner not shown');
  if (archObj.archiveHour !== '2026-08-11-0') fails.push('archive hour label wrong: ' + archObj.archiveHour);
  if (!archObj.gainerRows) fails.push('no gainer rows in archive');
  if (!archObj.botRows) fails.push('no bot rows in archive');
  if (archObj.histLinks < 10) fails.push('too few history links: ' + archObj.histLinks);
  if (!archObj.firstHistHref || !archObj.firstHistHref.includes('hour=')) fails.push('hist link missing ?hour=');
  if (liveObj.bannerHidden !== true) fails.push('live page shows archive banner');
  if (liveObj.asofLive !== true) fails.push('live badge not marked live');
  if (liveObj.histLinks < 10) fails.push('live: too few history links: ' + liveObj.histLinks);
  if (!weeklyObj.title.includes('48h Digest')) fails.push('weekly title wrong: ' + weeklyObj.title);
  if (!weeklyObj.hasCharts) fails.push('weekly: no svg charts');
  if (!weeklyObj.tableRows) fails.push('weekly: no table rows');
  if (!weeklyObj.hasSpam) fails.push('weekly: missing spam panel');
  if (!weeklyObj.hasFarms) fails.push('weekly: missing farm panel');
  if (!weeklyObj.hasWave) fails.push('weekly: missing farm-wave chip');

  console.log('== archive ==', arch);
  console.log('== live ==', live);
  console.log('== weekly ==', weekly);
  if (fails.length) { console.error('FAIL:', fails.join(' | ')); process.exit(1); }
  console.log('SMOKE PASS');
} catch (e) {
  console.error('SMOKE ERROR:', e.message);
  process.exit(2);
} finally {
  try { ff.kill('SIGKILL'); } catch { /* gone */ }
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* busy */ }
}
