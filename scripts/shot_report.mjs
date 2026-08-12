#!/usr/bin/env node
/* scripts/shot_report.mjs — full-page screenshot of site/report.html (Firefox BiDi, zero deps).
 * Usage: node scripts/shot_report.mjs [out.png]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FF = '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox';
const PORT = 9341;
const OUT = process.argv[2] || join(process.cwd(), 'shot_report.png');
const FILE = 'file://' + join(process.cwd(), 'site', 'report.html');
const profile = mkdtempSync(join(tmpdir(), 'pulse-shot-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = spawn(FF, ['--headless', `--remote-debugging-port=${PORT}`, `--profile=${profile}`, 'about:blank'], { stdio: 'ignore' });

try {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { const c = await (await fetch(`http://127.0.0.1:${PORT}/session`)).text(); ready = c.length > 0; } catch {}
    if (!ready) await sleep(500);
  }
  if (!ready) throw new Error('BiDi endpoint never came up');

  let msgId = 0;
  const pending = new Map();
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/session`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('session.new', { capabilities: {} });
  const { context } = await send('browsingContext.create', { type: 'tab' });
  await send('browsingContext.navigate', { context, url: FILE, wait: 'complete' });
  await sleep(2500);

  // full page height
  const evalJs = async (expr) => {
    const r = await send('script.evaluate', {
      target: { context },
      expression: expr, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  const h = Math.min(await evalJs(`document.documentElement.scrollHeight`) + 40, 40000);
  try {
    await send('browsingContext.setViewport', { context, viewport: { width: 1080, height: Math.min(h, 12000) } });
    await sleep(800);
  } catch (e) { console.error('setViewport failed (capturing viewport only):', e.message); }

  const shot = await send('browsingContext.captureScreenshot', { context });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`[shot] ${OUT} (${(shot.data.length / 1024).toFixed(0)} KB base64, page height ${h}px)`);
  ws.close();
} catch (e) {
  console.error('SHOT ERROR:', e.message);
  process.exit(2);
} finally {
  try { ff.kill('SIGKILL'); } catch {}
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
