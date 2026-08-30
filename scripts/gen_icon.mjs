// ===== gen_icon.mjs：用 headless Chrome 把 SVG 渲染成 PNG 图标 =====
// 运行：node scripts/gen_icon.mjs
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = 9226;
const BASE = `http://127.0.0.1:${PORT}`;
const SRC = pathToFileURL('/tmp/icon.svg').href;
const OUT = path.join(ROOT, 'extension', 'icons', 'icon128.png');

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/cdp-icon-profile-' + Date.now(),
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--no-sandbox',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForReady() {
  for (let i = 0; i < 50; i++) {
    try { const res = await fetch(`${BASE}/json/version`); if (res.ok) return; } catch {}
    await sleep(200);
  }
  throw new Error('端口未就绪');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      }
    };
  }
  open() { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; }); }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

async function main() {
  await waitForReady();
  const { webSocketDebuggerUrl } = await (await fetch(`${BASE}/json/version`)).json();
  const cdp = new CDP(webSocketDebuggerUrl);
  await cdp.open();

  const { targetId } = await cdp.send('Target.createTarget', { url: SRC });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const sid = sessionId;
  await cdp.send('Page.enable', {}, sid);
  await cdp.send('Runtime.enable', {}, sid);
  await sleep(1000); // 等 SVG 加载

  // 精确设置视口 128x128
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 128, height: 128, deviceScaleFactor: 1, mobile: false,
  }, sid);
  await sleep(300);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // 校验尺寸
  const buf = fs.readFileSync(OUT);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  console.log(`图标已生成: ${OUT} (${w}x${h})`);
  if (w !== 128 || h !== 128) throw new Error('尺寸不符: ' + w + 'x' + h);

  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  chrome.kill();
  process.exit(0);
}

main().catch((err) => { console.error('生成失败:', err); chrome.kill(); process.exit(1); });
