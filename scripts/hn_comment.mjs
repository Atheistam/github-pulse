#!/usr/bin/env node
/*
 * GitHub Pulse — post a genuine comment from ghspamwatch to an HN thread.
 * Headless Firefox + WebDriver BiDi, zero deps (same harness as hn_post.mjs).
 *
 * Usage: node scripts/hn_comment.mjs <username> <password> <item_id> <comment_file>
 *   comment_file: path to a text file containing the comment body (plain text, <p> for paragraphs)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FF = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const PORT = 9345;
const USER = process.argv[2];
const PASS = process.argv[3];
const ITEM = process.argv[4];
const COMMENT_FILE = process.argv[5];
if (!USER || !PASS || !ITEM || !COMMENT_FILE) { console.error('usage: hn_comment.mjs <username> <password> <item_id> <comment_file>'); process.exit(2); }
const COMMENT_TEXT = readFileSync(COMMENT_FILE, 'utf8').trim();

const profile = mkdtempSync(join(tmpdir(), 'hnc-'));
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
const body = () => evalJs(`document.body ? document.body.textContent.slice(0, 500) : 'NO BODY'`);

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

  // 1) login
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
    if (!loggedIn) { console.log('[auth] LOGIN FAILED body:', await body()); await shot('comment_auth_failed'); process.exit(3); }
    console.log('[auth] logged in');
  } else { console.log('[auth] already logged in'); }

  // 2) go to item, find comment form
  await navigate(`https://news.ycombinator.com/item?id=${ITEM}`);
  // HN top-level comment form: <form method="post" action="comment"> with <textarea name="text">
  let formInfo = null;
  for (let i = 0; i < 12 && !formInfo; i++) {
    formInfo = await evalJs(`(() => {
      const f = [...document.querySelectorAll('form')].find(fo => fo.querySelector('textarea[name=text]'));
      if (!f) return null;
      return {
        action: f.getAttribute('action'),
        parent: f.querySelector('input[name=parent]')?.value || null,
        hmac: f.querySelector('input[name=hmac]')?.value || null,
        goto: f.querySelector('input[name=goto]')?.value || null,
        fnid: f.querySelector('input[name=fnid]')?.value || null,
        textareaName: f.querySelector('textarea')?.getAttribute('name')
      };
    })()`);
    if (!formInfo) await sleep(1000);
  }
  if (!formInfo) throw new Error('comment form not found. url=' + await evalJs('location.href'));
  console.log('[comment] form:', JSON.stringify(formInfo));

  // 3) fill + submit
  const filled = await evalJs(`(() => {
    const f = [...document.querySelectorAll('form')].find(fo => fo.querySelector('textarea[name=text]'));
    const ta = f.querySelector('textarea[name=text]');
    ta.value = ${JSON.stringify(COMMENT_TEXT)};
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return ta.value.length;
  })()`);
  console.log('[comment] textarea filled with', filled, 'chars');
  await shot('comment_filled');
  await sleep(300);
  await evalJs(`[...document.querySelectorAll('form')].find(fo => fo.querySelector('textarea[name=text]')).requestSubmit()`);
  await sleep(6000);

  const landed = await evalJs(`location.href`);
  console.log('[comment] landed on:', landed);

  // 4) verify: reload the item page, check our username appears with the comment
  await navigate(`https://news.ycombinator.com/item?id=${ITEM}`);
  const marker = COMMENT_TEXT.slice(0, 60).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const found = await evalJs(`document.body.textContent.includes(${JSON.stringify(COMMENT_TEXT.slice(0, 80))})`);
  const authorFound = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('tr.comtr')];
    const mine = rows.filter(tr => tr.querySelector('.hnuser')?.textContent.trim() === ${JSON.stringify(USER)});
    return mine.length;
  })()`);
  console.log('[comment] text visible on page:', found, '| own comments found:', authorFound);
  if (found || authorFound > 0) {
    console.log('HN_COMMENT_OK item=' + ITEM + ' own_comments=' + authorFound);
    process.exit(0);
  }
  console.log('[comment] NOT verified. body:', await body());
  await shot('comment_unverified');
  process.exit(4);
} catch (e) {
  console.error('HN_COMMENT_ERROR:', e.message, e.stack ? '\n' + e.stack.split('\n').slice(0, 3).join('\n') : '');
  process.exit(5);
} finally {
  try { ws?.close(); } catch { /* */ }
  try { ff.kill('SIGKILL'); } catch { /* */ }
  rmSync(profile, { recursive: true, force: true });
}
