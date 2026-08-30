// ===== test_dom_cdp.mjs：页面级端到端 DOM 测试（真实 Chrome 渲染引擎）=====
// 运行：node tests/test_dom_cdp.mjs
// 加载 sidepanel.html（file:// 方式），模拟粘贴输入并断言：
//  1) 四条规则的命中与高亮颜色分布  2) 结果框内容与徽章
//  3) 点击跳转闪烁  4) 一键清空  5) 空输入/单侧输入
//  6) NBSP/全角空格匹配  7) 3000 行大文本性能  8) 方案 D：属性名等价归一
// 并生成界面截图 docs/ui-preview.png

import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9223;
const BASE = `http://127.0.0.1:${PORT}`;
const URL = pathToFileURL(path.join(ROOT, 'extension', 'sidepanel.html')).href;
const SCREENSHOT = path.join(ROOT, 'docs', 'ui-preview.png');

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*',
  '--user-data-dir=/tmp/cdp-profile-' + Date.now(),
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-crash-reporter',
  '--no-sandbox',
  '--window-size=480,760',
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

async function main() {
  await waitForReady();
  const { webSocketDebuggerUrl } = await (await fetch(`${BASE}/json/version`)).json();
  const cdp = new CDP(webSocketDebuggerUrl);
  await cdp.open();

  const { targetId } = await cdp.send('Target.createTarget', { url: URL });
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

  const paste = async (target, source) => {
    await evalJs(`(() => {
      const t = document.getElementById('targetInput');
      const s = document.getElementById('sourceInput');
      t.value = ${JSON.stringify(target)};
      s.value = ${JSON.stringify(source)};
      t.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(700); // 等防抖 250ms + 渲染
  };

  const readState = () => evalJs(`(() => ({
    target: {
      name: document.querySelectorAll('#targetMirror .mline.h-name').length,
      value: document.querySelectorAll('#targetMirror .mline.h-value').length,
      both: document.querySelectorAll('#targetMirror .mline.h-both').length,
      diff: document.querySelectorAll('#targetMirror .mline.h-diff').length,
    },
    source: {
      name: document.querySelectorAll('#sourceMirror .mline.h-name').length,
      value: document.querySelectorAll('#sourceMirror .mline.h-value').length,
      both: document.querySelectorAll('#sourceMirror .mline.h-both').length,
      diff: document.querySelectorAll('#sourceMirror .mline.h-diff').length,
    },
    targetResult: [...document.querySelectorAll('#targetResult li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim()),
    sourceResult: [...document.querySelectorAll('#sourceResult li')].map((li) => li.textContent.replace(/\\s+/g, ' ').trim()),
    targetResultCount: document.querySelectorAll('#targetResult li').length,
    sourceResultCount: document.querySelectorAll('#sourceResult li').length,
  }))()`);

  // ---- 0) 初始状态 ----
  const init = await readState();
  assert(init.targetResultCount === 1 && init.sourceResultCount === 1, '初始状态两个结果框各显示 1 条提示');

  // ---- 1) 标准样例数据 ----
  await paste('品牌: 苹果\n颜色: 红色\n尺寸: 大号\n备用色: 红色\n苹果',
              '品牌: 苹果\n颜色: 蓝色\n重量: 500g\n苹果\n苹果');
  const st = await readState();
  console.log('--- 标准样例状态 ---');
  console.log(JSON.stringify(st, null, 2));

  assert(st.target.name === 0 && st.target.both === 0, 'Target 同名同值 → 不标记（无黄/橙）');
  assert(st.target.value === 1, 'Target 粉(重复值)行数 = 1');
  assert(st.target.diff === 1, 'Target 蓝(同名值不同)行数 = 1');
  assert(st.source.name === 0 && st.source.both === 0, 'Source 同名同值 → 不标记（无黄/橙）');
  assert(st.source.value === 0, 'Source 粉(重复值)行数 = 0');
  assert(st.source.diff === 1, 'Source 蓝(同名值不同)行数 = 1');
  assert(st.targetResultCount === 2, 'Target 结果条目数 = 2（仅差异项）');
  assert(st.sourceResultCount === 1, 'Source 结果条目数 = 1（仅差异项）');
  assert(st.targetResult[0].startsWith('L2') && st.targetResult[0].includes('同名值不同') && st.targetResult[0].includes('内部重复'),
    'T 结果：「同名值不同」排最前（L2 颜色:红色）');
  assert(st.targetResult[1].startsWith('L4') && st.targetResult[1].includes('内部重复'), 'T 结果 L4 备用色:红色（内部重复）');
  assert(st.sourceResult[0].startsWith('L2') && st.sourceResult[0].includes('同名值不同'), 'S 结果：「同名值不同」排最前（L2 颜色:蓝色）');

  // ---- 3) 点击跳转闪烁 + 一键清空 ----
  const flash = await evalJs(`(() => {
    document.querySelector('#targetResult li').click();
    return document.querySelectorAll('#targetMirror .mline.flash').length;
  })()`);
  assert(flash === 1, '点击结果条目后出现闪烁 = 1');

  await evalJs(`document.getElementById('clearBtn').click()`);
  await sleep(300);
  const cleared = await readState();
  assert(cleared.target.name + cleared.target.value + cleared.target.both + cleared.target.diff === 0, '清空后 Target 无高亮');
  assert(cleared.source.name + cleared.source.value + cleared.source.both + cleared.source.diff === 0, '清空后 Source 无高亮');
  assert(cleared.targetResultCount === 1 && cleared.sourceResultCount === 1, '清空后结果框显示提示');

  // ---- 4) 仅 Target 有内容（Source 空）：内部重复仍应命中 ----
  await paste('品牌: 苹果\n备用色: 苹果', '');
  const oneSide = await readState();
  assert(oneSide.target.value === 2, '单侧输入：Target 内部重复命中 2 行（粉）');
  assert(oneSide.target.name === 0 && oneSide.target.both === 0, '单侧输入：无跨对象命中');
  assert(oneSide.targetResult[0].includes('内部重复'), '单侧输入：结果徽章为内部重复');
  assert(oneSide.sourceResultCount === 1, '单侧输入：Source 结果框显示提示');

  // ---- 5) NBSP/全角空格内容匹配 ----
  await paste('品牌:\u00A0苹果', '品牌: 苹果');
  const nbsp = await readState();
  assert(nbsp.target.name + nbsp.target.value + nbsp.target.both + nbsp.target.diff === 0 &&
         nbsp.source.name + nbsp.source.value + nbsp.source.both + nbsp.source.diff === 0,
    'NBSP 内容匹配为同名同值 → 两侧都不标记');

  // ---- 6) 3000 行大文本性能 ----
  const bigT = Array.from({ length: 3000 }, (_, i) => `attr${i}: 值${i % 100}`).join('\n');
  const bigS = Array.from({ length: 3000 }, (_, i) => `src${i}: 值${i % 100}`).join('\n');
  const t0 = Date.now();
  await paste(bigT, bigS);
  const elapsed = Date.now() - t0;
  const big = await readState();
  assert(big.targetResultCount === 3000 && big.sourceResultCount === 3000, '大文本：结果各 3000 条');
  assert(big.target.value === 3000 && big.source.value === 3000, '大文本：全部 3000 行命中值重复（粉 h-value）');
  console.log('大文本耗时:', elapsed, 'ms');
  assert(elapsed < 3000, '大文本：粘贴到渲染完成 < 3000ms（实际 ' + elapsed + 'ms）');

  // ---- 7) 用户真实示例：标签剥离 + 同行拆分 + 同名值不同 ----
  await paste(
    'target:流行服飾/配件 色系:黑色\n使用對象:Womens\n鞋碼US:6\n型號/產品編號:Voya Infinity',
    "source：流行服飾/配件 色系: Black Tones\n使用對象: Women's\n鞋碼US: 6\n型號/產品編號: TV1019622BLK");
  const real = await readState();
  console.log('--- 真实示例状态 ---');
  console.log(JSON.stringify(real, null, 2));
  assert(real.target.diff === 3 && real.source.diff === 3, '真实示例：同名值不同各 3 行（蓝 h-diff）');
  assert(real.target.name === 0 && real.target.both === 0, '真实示例：同名同值(鞋碼US/裸属性)不标记');
  assert(real.targetResultCount === 3 && real.sourceResultCount === 3, '真实示例：结果各 3 条（仅差异项）');
  assert(real.targetResult[0].includes('色系: 黑色') && real.targetResult[0].includes('同名值不同'),
    '真实示例：色系排最前且标「同名值不同」');
  assert(!real.targetResult.some((t) => t.includes('流行服飾/配件')), '真实示例：裸属性(相同)不出现在结果');
  assert(!real.targetResult.some((t) => t.includes('鞋碼US')), '真实示例：鞋碼US(相同)不出现在结果');

  // ---- 8) 完整鞋类示例 + 复制差异清单 ----
  const FULL_T = 'target:流行服飾/配件 色系:黑色\n使用對象:Womens\n圖案/印花:Solid\n鞋跟高度:Flat\n防水程度:Not Water Resistant\n時尚配件/鞋飾:織帶\n發布季節:Summer\n鞋長:23 cm\n產品名稱(鞋名):Voya Infinity\n鞋款風格:涼鞋\n高跟鞋類型:Flat\n其他鞋款風格:涼鞋\n鞋碼EU:23\n鞋碼UK:5\n鞋碼US:6\n顏色:黑色\n適用季節:Summer\n鞋面材質:織帶\n性別:Female\n型號/產品編號:Voya Infinity';
  const FULL_S = "source：流行服飾/配件 色系: Black Tones\n使用對象: Women's\n圖案/印花: 羅馬織帶\n鞋跟高度: Flat\n防水程度: Quick Drying\n發布季節: Summer\n鞋長: 23 cm\n產品名稱(鞋名): Voya Infinity\n鞋款風格: 涼鞋\n高跟鞋類型: Flat\n其他鞋款風格: 涼鞋\n鞋碼EU: 37\n鞋碼UK: 4\n鞋碼US: 6\n顏色: 黑\n適用季節: Summer\n鞋面材質: 尼龍\n性別: Female\n型號/產品編號: TV1019622BLK";
  await paste(FULL_T, FULL_S);
  const full = await readState();
  assert(full.target.diff === 9 && full.source.diff === 9, '完整示例：同名值不同各 9 行（蓝 h-diff）');

  // 复制差异清单（拦截 clipboard 以便读取）
  await evalJs(`(() => {
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    document.getElementById('copyDiffBtn').click();
    return true;
  })()`);
  await sleep(400);
  const copied = await evalJs(`window.__copied || ''`);
  const lines8 = copied.split('\n').filter(Boolean);
  console.log('--- 复制内容 ---');
  console.log(copied);
  assert(lines8.length === 10, '差异清单：表头+9 行，实际 ' + lines8.length);
  assert(lines8[0] === '属性名\tTarget\tSource', '差异清单：表头为 属性名/Target/Source');
  assert(lines8.includes('色系\t黑色\tBlack Tones'), '差异清单：色系 黑色 → Black Tones');
  assert(lines8.includes('鞋碼EU\t23\t37'), '差异清单：鞋碼EU 23 → 37');
  assert(lines8.includes('型號/產品編號\tVoya Infinity\tTV1019622BLK'), '差异清单：型號/產品編號 差异正确');
  assert(!lines8.some((l) => l.startsWith('鞋碼US')), '差异清单：相同项(鞋碼US)不出现在清单中');

  // ---- 9) 方案 D：属性名等价归一（别名表 + 包含匹配）----
  // 用户例子：實際總長度/總長度、胸圍實際寬度/胸圍 等价且值相同 → 不标记
  await paste('實際總長度: 75厘米\n胸圍實際寬度: 36厘米', '總長度: 75厘米\n胸圍: 36厘米');
  const eq = await readState();
  assert(eq.target.diff === 0 && eq.target.value === 0, '方案D：實際總長度/胸圍實際寬度 等价后 Target 无标记');
  assert(eq.source.diff === 0 && eq.source.value === 0, '方案D：Source 侧同样无标记');
  assert(eq.targetResultCount === 1 && eq.sourceResultCount === 1, '方案D：结果框显示提示而非命中');

  // 别名表：色系 vs 顏色（无包含关系），值相同 → 不标记
  await paste('色系: 黑色', '顏色: 黑色');
  const alias = await readState();
  assert(alias.target.diff === 0 && alias.target.value === 0, '方案D：色系/顏色 别名等价 → 无标记');
  assert(alias.source.diff === 0 && alias.source.value === 0, '方案D：色系/顏色 反向也无标记');

  // 自动兜底：未收录但包含（主面料 ⊃ 面料）+ 值不同 → 蓝
  await paste('主面料: 純棉', '面料: 尼龍');
  const cont = await readState();
  assert(cont.target.diff === 1 && cont.source.diff === 1, '方案D：包含+值不同 → 蓝');
  assert(cont.targetResult[0].includes('同名值不同'), '方案D：结果徽章为同名值不同');

  // 值相同但属性名完全无关 → 维持现状（value-cross 粉）
  await paste('數量: 2', '庫存: 2');
  const unrelated = await readState();
  assert(unrelated.target.value === 1 && unrelated.source.value === 1, '方案D：無關屬性同值 → 维持粉（value-cross）');
  assert(unrelated.target.diff === 0 && unrelated.source.diff === 0, '方案D：無關屬性 → 不标蓝');

  // ---- 10) 界面预览截图（用鞋类示例，展示蓝色差异效果）----
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid);
  fs.writeFileSync(SCREENSHOT, Buffer.from(shot.data, 'base64'));
  console.log('截图已保存（鞋类示例）:', SCREENSHOT);

  await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  chrome.kill();
  console.log(failures === 0 ? '=== DOM 端到端测试全部通过 ===' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('测试失败:', err);
  chrome.kill();
  process.exit(1);
});
