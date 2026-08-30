// ===== test_extension_cdp.mjs：以真实扩展方式加载并做端到端验证 =====
// 运行：node tests/test_extension_cdp.mjs          （无头模式，扩展不支持则 SKIP）
//      HEADLESS=0 node tests/test_extension_cdp.mjs （有头/桌面模式，真正验证扩展加载）
// 1) 检测扩展是否加载（SW target 或 chrome://extensions 列表）
// 2) 打开 chrome-extension://<id>/sidepanel.html，验证四框对比流程
// 3) 截图保存为 docs/ui-preview.png

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT_DIR = process.env.EXT_DIR || path.join(ROOT, 'extension');
const HEADLESS = process.env.HEADLESS !== '0';
const SCREENSHOT_PATH = path.join(ROOT, 'docs', 'ui-preview.png');
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = 9224;
const BASE = `http://127.0.0.1:${PORT}`;

const chrome = spawn(CHROME, [
  ...(HEADLESS ? ['--headless=new'] : ['--ozone-platform=wayland', '--ozone-platform-hint=auto']),
  `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/cdp-ext-profile-' + Date.now(),
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-crash-reporter',
  '--disable-features=ExtensionContentVerification',
  '--no-sandbox',
  '--window-size=480,760',
  `--disable-extensions-except=${EXT_DIR}`,
  `--load-extension=${EXT_DIR}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

chrome.stderr.on('data', (d) => {
  const s = String(d).trim();
  if (s && !s.includes('Fontconfig') && !s.includes('dbus') && !s.includes('dconf')) {
    console.error('[chrome]', s.slice(0, 200));
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/json/version`);
      if (res.ok) return;
    } catch { /* 未就绪 */ }
    await sleep(200);
  }
  throw new Error('Chrome DevTools 端口未就绪');
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
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message));
          else p.resolve(msg.result);
        }
      }
    };
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('PASS:', msg);
  else { failures++; console.log('FAIL:', msg); }
}

// 检测扩展：优先找我们的 background.js SW；否则查 chrome://extensions 列表
async function findExtension(cdp) {
  for (let i = 0; i < 15; i++) {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.endsWith('/background.js'));
    if (sw) return { id: new URL(sw.url).host, sw };
    await sleep(500);
  }

  // 兜底：打开 chrome://extensions 找「属性对比台」
  const { targetId } = await cdp.send('Target.createTarget', { url: 'chrome://extensions' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await sleep(2500);
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const items = [];
      const seen = new Set();
      function visit(root) {
        if (seen.has(root)) return;
        seen.add(root);
        for (const el of root.querySelectorAll('*')) {
          if (el.tagName === 'EXTENSIONS-ITEM') {
            items.push({ id: el.getAttribute('id'), name: (el.shadowRoot ? el.shadowRoot.textContent : '').slice(0, 100) });
          }
          if (el.shadowRoot) visit(el.shadowRoot);
        }
      }
      visit(document);
      return JSON.stringify(items);
    })()`,
    returnByValue: true,
  }, sessionId);
  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  const items = JSON.parse(r.result.value || '[]');
  console.log('chrome://extensions 中的扩展:', JSON.stringify(items));
  const mine = items.find((i) => (i.name || '').includes('属性对比'));
  return mine ? { id: mine.id, sw: null } : null;
}

async function main() {
  await waitForReady();
  const { webSocketDebuggerUrl } = await (await fetch(`${BASE}/json/version`)).json();
  const cdp = new CDP(webSocketDebuggerUrl);
  await cdp.open();

  const ext = await findExtension(cdp);
  if (!ext) {
    console.log('SKIP: 扩展未加载（' + (HEADLESS ? '无头模式不支持 --load-extension' : '有头模式未检测到') + '）。');
    console.log('      页面级 DOM 测试见 test_dom_cdp.mjs。');
    chrome.kill();
    process.exit(0);
  }
  console.log('已检测到扩展 ID:', ext.id, ext.sw ? '(SW 已运行)' : '(列表中找到)');

  // 若 SW 在运行，检查 chrome API
  if (ext.sw) {
    const { sessionId: swSid } = await cdp.send('Target.attachToTarget', { targetId: ext.sw.targetId, flatten: true });
    await cdp.send('Runtime.enable', {}, swSid).catch(() => {});
    const apiCheck = await cdp.send('Runtime.evaluate', {
      expression: `JSON.stringify({
        runtimeId: typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.id : 'no-chrome',
        sidePanel: typeof chrome !== 'undefined' && chrome.sidePanel ? 'object' : 'missing',
      })`,
      returnByValue: true,
    }, swSid);
    const apiInfo = JSON.parse(apiCheck.result.value || '{}');
    console.log('后台上下文:', JSON.stringify(apiInfo));
    assert(apiInfo.runtimeId === ext.id, '后台脚本运行在正确的扩展上下文中');
    assert(apiInfo.sidePanel === 'object', '后台脚本中 chrome.sidePanel API 可用');
  }

  // 打开扩展页面并验证
  const pageUrl = `chrome-extension://${ext.id}/sidepanel.html`;
  const { targetId } = await cdp.send('Target.createTarget', { url: pageUrl });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const sid = sessionId;
  await cdp.send('Page.enable', {}, sid);
  await cdp.send('Runtime.enable', {}, sid);

  for (let i = 0; i < 50; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sid);
    if (r.result.value === 'complete') break;
    await sleep(200);
  }

  const evalJs = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sid);
    if (r.exceptionDetails) throw new Error('JS 异常: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  const pageInfo = await evalJs(`JSON.stringify({
    href: location.href,
    title: document.title,
    hasTargetBox: !!document.getElementById('targetInput'),
  })`);
  console.log('页面状态:', pageInfo);
  const page = JSON.parse(pageInfo);
  assert(page.hasTargetBox === true, '扩展页面加载成功（四框结构存在）');
  if (!page.hasTargetBox) {
    chrome.kill();
    process.exit(1);
  }

  await evalJs(`(() => {
    const t = document.getElementById('targetInput');
    const s = document.getElementById('sourceInput');
    t.value = '品牌: 苹果\\n颜色: 红色\\n尺寸: 大号\\n备用色: 红色\\n苹果';
    s.value = '品牌: 苹果\\n颜色: 蓝色\\n重量: 500g\\n苹果\\n苹果';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(700);

  const state = await evalJs(`(() => ({
    target: {
      value: document.querySelectorAll('#targetMirror .mline.h-value').length,
      diff: document.querySelectorAll('#targetMirror .mline.h-diff').length,
    },
    source: {
      value: document.querySelectorAll('#sourceMirror .mline.h-value').length,
      diff: document.querySelectorAll('#sourceMirror .mline.h-diff').length,
    },
    targetResult: [...document.querySelectorAll('#targetResult li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim()),
    sourceResult: [...document.querySelectorAll('#sourceResult li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim()),
  }))()`);
  console.log('--- DOM 状态 ---');
  console.log(JSON.stringify(state, null, 2));

  assert(state.target.value === 1, 'Target 粉(重复值)行数 = 1');
  assert(state.target.diff === 1, 'Target 蓝(同名值不同)行数 = 1');
  assert(state.source.value === 0, 'Source 粉(重复值)行数 = 0');
  assert(state.source.diff === 1, 'Source 蓝(同名值不同)行数 = 1');
  assert(state.targetResult.length === 2, 'Target 结果条目数 = 2');
  assert(state.sourceResult.length === 1, 'Source 结果条目数 = 1');
  assert(state.targetResult[0].includes('同名值不同') && state.targetResult[0].includes('内部重复'), 'T 结果 L2 徽章正确');
  assert(state.targetResult[1].includes('内部重复'), 'T 结果 L4 徽章正确');

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
  console.log('截图已保存:', SCREENSHOT_PATH);

  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  chrome.kill();
  console.log(failures === 0 ? '=== 扩展端到端测试全部通过 ===' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('测试失败:', err);
  chrome.kill();
  process.exit(1);
});
