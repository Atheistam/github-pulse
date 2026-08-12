#!/usr/bin/env node
// quick debug: dump HN login page structure as seen by headless FF BiDi
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const FF = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const PORT = 9342;
const profile = mkdtempSync(join(tmpdir(), 'dbg-ff-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = spawn(FF, ['--headless', `--remote-debugging-port=${PORT}`, `--profile=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws, msgId = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, (m) => (m.error ? rej(new Error(method + ': ' + (m.error.message || JSON.stringify(m.error)))) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) { try { ready = (await (await fetch(`http://127.0.0.1:${PORT}/session`)).text()).length > 0; } catch {} if (!ready) await sleep(500); }
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await send('session.new', { capabilities: {} });
  const { context } = await send('browsingContext.create', { type: 'tab' });
  await send('browsingContext.navigate', { context, url: 'https://news.ycombinator.com/login', wait: 'complete' });
  await sleep(3000);
  const r = await send('script.evaluate', { target: { context }, expression: `JSON.stringify({
    title: document.title,
    url: location.href,
    bodyLen: document.body ? document.body.innerText.length : -1,
    bodyHead: document.body ? document.body.innerText.slice(0,200) : 'NO BODY',
    forms: [...document.querySelectorAll('form')].map(f => ({
      action: f.action, method: f.method,
      submits: [...f.querySelectorAll('input[type=submit]')].map(i => i.value),
      inputs: [...f.querySelectorAll('input')].map(i => i.name + '=' + i.type)
    }))
  })`, awaitPromise: true, returnByValue: true });
  console.log(r.result?.value || JSON.stringify(r));
} catch (e) { console.error('ERR', e.message); }
finally { try { ws?.close(); } catch {} try { ff.kill('SIGKILL'); } catch {} rmSync(profile, { recursive: true, force: true }); }
