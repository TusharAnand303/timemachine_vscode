import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Render the shipped UI with explicit, synthetic project data. No user history is read.
const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'timemachine-marketing-'));
const snapshots = join(root, 'media/screenshots');
await mkdir(snapshots, { recursive: true });
const at = new Date(2026, 9, 1, 14, 35).getTime();
const days = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(2026, 8, 25 + index);
  return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, codingMs: (index + 2) * 600000, aiMs: (index + 1) * 180000 };
});
const sum = list => list.reduce((total, day) => ({ codingMs: total.codingMs + day.codingMs, aiMs: total.aiMs + day.aiMs }), { codingMs: 0, aiMs: 0 });
const folderUri = 'file:///projects/example-app';
const activity = { today: sum(days.slice(-1)), week: sum(days), all: sum(days), days, mode: 'coding', focused: true, activeProjectId: folderUri };
const events = [
  { kind: 'command', id: 'failed', at, command: 'npm test', terminal: 'zsh', cwd: folderUri, status: 'failed', exitCode: 1, finishedAt: at + 1800, relatedIds: ['saved'], hasPreviousPass: true },
  { kind: 'save', id: 'saved', at: at - 90000, uri: `${folderUri}/src/app.ts`, name: 'src/app.ts', directory: 'example-app/src', added: 12, removed: 3, before: 'example-before', after: 'example-after' },
  { kind: 'command', id: 'passed', at: at - 240000, command: 'npm test', terminal: 'zsh', cwd: folderUri, status: 'passed', exitCode: 0, finishedAt: at - 238000 },
  { kind: 'ready', id: 'ready', at: at - 300000, terminal: 'dev server', commandId: 'dev', linkToId: 'dev' },
  { kind: 'command', id: 'dev', at: at - 301000, command: 'npm run dev', terminal: 'dev server', cwd: folderUri, status: 'running' },
  { kind: 'opened', id: 'opened', at: at - 900000, label: 'Opened example-app', reason: 'startup' },
].map(event => ({ directory: 'example-app', folderUri, ...event }));
const payload = { type: 'data', projects: [{ id: folderUri, name: 'example-app', path: '/projects/example-app', events, activity }] };

async function preview(view) {
  const focus = view === 'focus';
  const source = await readFile(join(root, `src/${focus ? 'focusView' : 'graphView'}.ts`), 'utf8');
  let html = source.match(/return `(<\!DOCTYPE html>[\s\S]*?)`;\n\t}/)[1];
  for (const [name, value] of Object.entries({ css: pathToFileURL(join(root, `media/${focus ? 'focus' : 'graph'}.css`)).href, js: pathToFileURL(join(root, `media/${focus ? 'focus' : 'graph'}.js`)).href, nonce: 'demo' })) html = html.replaceAll(`\${${name}}`, value);
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '').replace('Local activity', 'Example project');
  const saved = { projectId: folderUri, section: view === 'history' ? 'history' : 'graph', selectedId: view === 'history' ? '' : 'failed', range: focus ? 'week' : 'all' };
  const mock = `<script>window.acquireVsCodeApi=()=>({getState:()=>(${JSON.stringify(saved)}),setState:()=>{},postMessage:message=>{if(message.type==='ready')setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(payload)}})),50);}});</script>`;
  html = html.replace('<script ', mock + '<script ');
  const file = join(temporary, `${view}.html`); await writeFile(file, html); return file;
}

let browser;
let socket;
try {
  const endpoint = await new Promise((accept, reject) => {
    browser = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--remote-debugging-port=0', `--user-data-dir=${join(temporary, 'chrome')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 15000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.once('exit', code => { clearTimeout(timer); reject(new Error(`Chrome exited with ${code}`)); });
    browser.stderr.on('data', data => { const match = String(data).match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); accept(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((accept, reject) => { socket.addEventListener('open', accept, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', message => {
    const data = JSON.parse(message.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails);
    const request = pending.get(data.id);
    if (request) { pending.delete(data.id); clearTimeout(request.timer); data.error ? request.reject(new Error(data.error.message)) : request.accept(data.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((accept, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(key, { accept, reject, timer }); socket.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  for (const spec of [
    { view: 'graph', width: 1440, height: 1100, output: join(snapshots, 'activity-graph.png') },
    { view: 'history', width: 1440, height: 1000, output: join(snapshots, 'command-history.png') },
    { view: 'focus', width: 380, height: 620, output: join(snapshots, 'coding-time.png') },
    { view: 'social', width: 1280, height: 640, output: join(root, 'marketing/github-social-preview.png') },
  ]) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: spec.width, height: spec.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const file = spec.view === 'social' ? join(root, 'marketing/social-preview.html') : await preview(spec.view);
    await send('Page.navigate', { url: pathToFileURL(file).href }, sessionId);
    await new Promise(accept => setTimeout(accept, 650));
    if (spec.view === 'focus') await send('Runtime.evaluate', { expression: "document.querySelector('details').open=true" }, sessionId);
    const metrics = await send('Runtime.evaluate', { expression: 'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth})', returnByValue: true }, sessionId);
    const bounds = JSON.parse(metrics.result.value);
    if (bounds.scroll > bounds.width) throw new Error(`${spec.view} overflows horizontally: ${JSON.stringify(bounds)}`);
    if (errors.length) throw new Error(`UI error: ${JSON.stringify(errors)}`);
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(spec.output, Buffer.from(capture.data, 'base64'));
    console.log(`${spec.view}: ${spec.width} × ${spec.height}, no horizontal overflow or script errors`);
    await send('Target.closeTarget', { targetId });
  }
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([new Promise(accept => browser.once('exit', accept)), new Promise(accept => setTimeout(accept, 3000))]);
  }
  await rm(temporary, { recursive: true, force: true });
}
