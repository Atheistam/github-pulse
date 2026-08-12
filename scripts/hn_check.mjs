#!/usr/bin/env node
// check what ghspamwatch's submitted posts look like when logged in as the author
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const FF = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const PORT = 9343;
const USER = process.argv[2], PASS = process.argv[3];
const profile = mkdtempSync(join(tmpdir(), 'hnchk-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { const { execSync } = await import('node:child_process'); execSync(`lsof -ti tcp:${PORT} | xargs kill -9 2>/dev/null; sleep 1`); } catch {}
const ff = spawn(FF, ['--headless', `--remote-debugging-port=${PORT}`, `--profile=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, context, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + (m.error.message || JSON.stringify(m.error)))) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const unwrap = (v) => { if (!v || typeof v !== 'object' || !('type' in v)) return v; switch (v.type) { case 'object': return Object.fromEntries((v.value || []).map(([k, val]) => [k, unwrap(val)])); case 'array': return (v.value || []).map(unwrap); case 'string': case 'number': case 'boolean': return v.value; case 'null': case 'undefined': return null; default: return v.value; } };
const evalJs = async (expr) => { const r = await send('script.evaluate', { target: { context }, expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails)); return unwrap(r.result); };
try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { try { ready = (await (await fetch(`http://127.0.0.1:${PORT}/session`)).text()).length > 0; } catch {} if (!ready) await sleep(500); }
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await send('session.new', { capabilities: {} });
  const ctx = await send('browsingContext.create', { type: 'tab' }); context = ctx.context;
  const navigate = async (url) => { await send('browsingContext.navigate', { context, url, wait: 'complete' }); await sleep(2500); };
  await navigate('https://news.ycombinator.com/login');
  await evalJs(`(() => { const f = [...document.querySelectorAll('form')].find(fo => (fo.querySelector('input[type=submit]')?.value || '') === 'login'); if (!f) return false; const set = (n,v) => { const el = f.querySelector('input[name='+n+']'); if (el) { el.value = v; el.dispatchEvent(new Event('input',{bubbles:true})); } return !!el; }; set('acct',${JSON.stringify(USER)}); set('pw',${JSON.stringify(PASS)}); f.requestSubmit(); return true; })()`);
  await sleep(4000);
  await navigate('https://news.ycombinator.com/submitted?id=' + USER);
  const dump = await evalJs(`JSON.stringify([...document.querySelectorAll('tr.athing')].map(tr => {
    const a = tr.querySelector('td.title a');
    const subRow = tr.nextElementSibling;
    const editHref = subRow ? subRow.querySelector('a[href*="edit?id="]')?.getAttribute('href') : null;
    const delHref = subRow ? subRow.querySelector('a[href*="delete?id="]')?.getAttribute('href') : null;
    const sub = subRow ? subRow.textContent : '';
    return { title: a ? a.textContent : null, href: a ? a.getAttribute('href') : null, editHref, delHref, sub: sub.replace(/\s+/g,' ').trim().slice(0,120) };
  }))`);
  console.log('SUBMITTED:', dump);
  const bodyTxt = await evalJs(`document.body.textContent.includes('dead')`);
  console.log('body mentions dead:', bodyTxt);
} catch (e) { console.error('ERR', e.message); }
finally { try { ws?.close(); } catch {} try { ff.kill('SIGKILL'); } catch {} rmSync(profile, { recursive: true, force: true }); }
