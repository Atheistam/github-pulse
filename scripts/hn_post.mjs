#!/usr/bin/env node
/*
 * GitHub Pulse — post to Hacker News from our account.
 * Headless Firefox + WebDriver BiDi, zero deps (same harness as smoke.mjs).
 *
 * Usage: node scripts/hn_post.mjs <username> <password> [mode] [title] [url]
 *   mode: "show" (default, text Show HN) | "link" (URL submission)
 * Logs in if account exists, signs up if not.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FF = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const PORT = 9341;
const USER = process.argv[2];
const PASS = process.argv[3];
const MODE = process.argv[4] || 'show';
if (!USER || !PASS) { console.error('usage: hn_post.mjs <username> <password> [show|link] [title] [url]'); process.exit(2); }

const SHOW_TITLE = "Show HN: I built a radar that catches GitHub's push-farm botnets in real time";
const SHOW_TEXT = `Every hour GH Archive records ~160K public GitHub events. I stream all of them and rank what's actually happening on GitHub right now — hottest repos, human signal, top actors, languages, releases.

The interesting part is what I had to kill to make the chart honest: push-farms.

~64% of all pushes on GitHub right now are spam. Thousands of auto-created accounts (smithhoward5868/faiucd, conleyricky202/babjhl) push hundreds of times an hour to freshly-created gibberish repos. One repo, LiamBruhin/SillyStuff, pushed 690 times in a single hour from ONE actor, and has done so for 13+ hours straight. I've been watching for 34 hours now and the farms are winning: spam went from 35% to 64% of all pushes.

The farms read the site and adapt. When I thresholded at 40 pushes/hr they dropped to 30, then 25, then 24. So detection is now profile-based: zero human signal + ≤2 actors + auto-generated account names + a persistent ledger of known farm accounts (repos rotate, accounts persist — 23K of them tracked).

Live radar + botnet watch: https://github-pulse.surge.sh
Full investigation with charts: https://github-pulse.surge.sh/report.html
RSS: https://github-pulse.surge.sh/data/digest.xml
Code: single zero-dependency Node script, open source: https://github.com/Atheistam/github-pulse

Questions I'm genuinely curious about: what ARE these farms for? Why do they keep pushing to fresh repos forever? Anyone seen this pattern before?`;

const LINK_TITLE = process.argv[5] || "64% of GitHub pushes are spam from automated push-farms — a 34-hour live investigation";
const LINK_URL = process.argv[6] || 'https://github-pulse.surge.sh/report.html';

const ASK_TITLE = "Ask HN: What are GitHub's push-farm botnets actually for?";
const ASK_TEXT = `Every hour GH Archive records ~160K public GitHub events, and right now ~64% of the pushes are spam. Thousands of auto-created accounts (word+digits usernames like smithhoward5868, gibberish repo names) push hundreds of times an hour to fresh repos, 24/7. One repo, LiamBruhin/SillyStuff, pushed 690 times in a single hour from ONE actor, and has kept that up for 13+ hours straight.

I built a live radar that had to detect these farms to rank honestly, and I've been tracking them for 34 hours. Live: https://github-pulse.surge.sh — full writeup with charts and the farm ledger: https://github-pulse.surge.sh/report.html — open-source single script: https://github.com/Atheistam/github-pulse

But I genuinely don't know what they're FOR. No stars, no forks, no issues, no PRs, no meaningful README — just endless pushes to fresh gibberish repos. SEO? GitHub Actions reselling? Training-data poisoning? Has anyone seen this pattern before, or does anyone know what the endgame is?`;

const MODE_TITLE = MODE === 'link' ? LINK_TITLE : (MODE === 'ask' ? ASK_TITLE : SHOW_TITLE);
const MODE_URL = MODE === 'link' ? LINK_URL : '';
const MODE_TEXT = MODE === 'link' ? '' : (MODE === 'ask' ? ASK_TEXT : SHOW_TEXT);

const profile = mkdtempSync(join(tmpdir(), 'hn-ff-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const { execSync } = await import('node:child_process');
  execSync(`lsof -ti tcp:${PORT} | xargs kill -9 2>/dev/null; sleep 1`);
} catch { /* port was free */ }
const ff = spawn(FF, ['--headless', `--remote-debugging-port=${PORT}`, `--profile=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws, context, msgId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + (m.error.message || JSON.stringify(m.error)))) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
// unwrap BiDi RemoteValue into plain JS
const unwrap = (v) => {
  if (!v || typeof v !== 'object' || !('type' in v)) return v;
  switch (v.type) {
    case 'object': return Object.fromEntries((v.value || []).map(([k, val]) => [k, unwrap(val)]));
    case 'array': return (v.value || []).map(unwrap);
    case 'string': case 'number': case 'boolean': return v.value;
    case 'null': case 'undefined': return null;
    default: return v.value;
  }
};
const evalJs = async (expr) => {
  const r = await send('script.evaluate', { target: { context }, expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return unwrap(r.result);
};
const shot = async (name) => {
  try {
    const r = await send('browsingContext.captureScreenshot', { context });
    writeFileSync(join('/Users/bolero/rogue-dev', `hn_${name}.png`), Buffer.from(r.data, 'base64'));
    console.log(`[shot] hn_${name}.png`);
  } catch (e) { console.log('[shot] failed:', e.message); }
};
const body = () => evalJs(`document.body ? document.body.textContent.slice(0, 400) : 'NO BODY'`);

try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { ready = (await (await fetch(`http://127.0.0.1:${PORT}/session`)).text()).length > 0; } catch { /* */ }
    if (!ready) await sleep(500);
  }
  if (!ready) throw new Error('BiDi endpoint never came up');
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await send('session.new', { capabilities: {} });
  const ctx = await send('browsingContext.create', { type: 'tab' });
  context = ctx.context;
  const navigate = async (url) => { await send('browsingContext.navigate', { context, url, wait: 'complete' }); await sleep(2500); };

  // 1) login or signup
  await navigate('https://news.ycombinator.com/login');
  let loggedIn = await evalJs(`document.body.textContent.includes('logout')`);
  if (!loggedIn) {
    console.log('[auth] trying login...');
    await evalJs(`(() => {
      const f = [...document.querySelectorAll('form')].find(fo => (fo.querySelector('input[type=submit]')?.value || '') === 'login');
      if (!f) return false;
      const set = (name, val) => { const el = f.querySelector('input[name=' + name + ']'); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } return !!el; };
      set('acct', ${JSON.stringify(USER)}); set('pw', ${JSON.stringify(PASS)});
      f.requestSubmit(); return true;
    })()`);
    await sleep(4000);
    loggedIn = await evalJs(`document.body.textContent.includes('logout')`);
    if (!loggedIn) {
      console.log('[auth] login failed — signing up...');
      let signup = null;
      for (let i = 0; i < 12 && !signup; i++) {
        signup = await evalJs(`(() => {
          const f = [...document.querySelectorAll('form')].find(fo => fo.querySelector('input[name=creating]'));
          if (!f) return null;
          const set = (name, val) => { const el = f.querySelector('input[name=' + name + ']'); if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); } return !!el; };
          set('acct', ${JSON.stringify(USER)}); set('pw', ${JSON.stringify(PASS)});
          f.requestSubmit(); return { submitted: true };
        })()`);
        if (!signup) await sleep(1000);
      }
      await sleep(4000);
      loggedIn = await evalJs(`document.body.textContent.includes('logout')`);
      if (!loggedIn) { console.log('[auth] SIGNUP FAILED body:', await body()); await shot('auth_failed'); process.exit(3); }
      console.log('[auth] account created + logged in');
    } else {
      console.log('[auth] logged in (existing account)');
    }
  } else {
    console.log('[auth] already logged in');
  }

  // 2) submit
  await navigate('https://news.ycombinator.com/submit');
  let form = null;
  for (let i = 0; i < 12 && !form; i++) {
    form = await evalJs(`(() => {
      const f = [...document.querySelectorAll('form')].find(fo => fo.querySelector('input[name=title]'));
      if (!f) return null;
      const set = (n, v) => { const el = f.querySelector('[name=' + n + ']'); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } return !!el; };
      set('title', ${JSON.stringify(MODE_TITLE)});
      set('url', ${JSON.stringify(MODE_URL)});
      set('text', ${JSON.stringify(MODE_TEXT)});
      return { ok: true, hasTitle: !!f.querySelector('[name=title]'), hasUrl: !!f.querySelector('[name=url]') };
    })()`);
    if (!form) await sleep(1000);
  }
  if (!form) throw new Error('submit form not found. url=' + await evalJs('location.href') + ' body=' + await body());
  console.log('[submit] mode=' + MODE + ' form:', JSON.stringify(form));
  await shot('submit_filled');
  await sleep(500);
  await evalJs(`[...document.querySelectorAll('form')].find(fo => fo.querySelector('input[name=title]')).requestSubmit()`);
  await sleep(6000);

  const landed = await evalJs(`location.href`);
  console.log('[submit] landed on:', landed);
  if (/news\?id=\d+/.test(landed)) {
    console.log('POST LIVE: https://news.ycombinator.com' + landed);
    await shot('posted');
    console.log('HN_POST_OK');
    process.exit(0);
  }
  console.log('[submit] NOT confirmed. body:', await body());
  await shot('submit_unconfirmed');
  process.exit(4);
} catch (e) {
  console.error('HN_POST_ERROR:', e.message, e.stack ? '\n' + e.stack.split('\n').slice(0, 3).join('\n') : '');
  process.exit(5);
} finally {
  try { ws?.close(); } catch { /* */ }
  try { ff.kill('SIGKILL'); } catch { /* */ }
  rmSync(profile, { recursive: true, force: true });
}
