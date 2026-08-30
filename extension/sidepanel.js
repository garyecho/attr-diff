// ===== 属性对比台 - 主逻辑 =====
// 流程：输入 -> 防抖 -> 解析/对比(compare.js) -> 渲染镜像高亮 + 结果框

const targetInput  = document.getElementById('targetInput');
const sourceInput  = document.getElementById('sourceInput');
const targetMirror = document.getElementById('targetMirror');
const sourceMirror = document.getElementById('sourceMirror');
const targetResult = document.getElementById('targetResult');
const sourceResult = document.getElementById('sourceResult');
const copyDiffBtn  = document.getElementById('copyDiffBtn');
const clearBtn     = document.getElementById('clearBtn');

const RULE_LABELS = {
  'same-name-diff': '同名值不同',
  'value-cross': '跨对象值',
  'value-inner': '内部重复',
};

// ---------- 小工具 ----------

// 转义 HTML 特殊字符，防止粘贴内容破坏页面结构
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 让镜像层宽度与输入框内容宽度一致（排除滚动条，保证换行位置一致）
function syncMirrorSize(textarea, mirror) {
  mirror.style.width = textarea.clientWidth + 'px';
}

// 把输入框内容按行渲染到镜像层（每行一个 div，便于按行高亮）
function renderMirror(textarea, mirror) {
  const lines = textarea.value.split('\n');
  mirror.innerHTML = lines.map((line) => `<div class="mline">${esc(line)}</div>`).join('');
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
  syncMirrorSize(textarea, mirror);
}

// 输入框滚动时，镜像层同步滚动
function bindScroll(textarea, mirror) {
  textarea.addEventListener('scroll', () => {
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
  });
}

// 按命中规则给镜像层的行加上高亮类名（蓝=同名值不同，粉=重复值）
function applyHighlights(mirror, flags) {
  const lines = mirror.querySelectorAll('.mline');
  lines.forEach((el, idx) => {
    el.classList.remove('h-diff', 'h-value');
    const rules = flags.get(idx);
    if (!rules || rules.size === 0) return;
    if (rules.has('same-name-diff')) el.classList.add('h-diff'); // 蓝：同名值不同（重点关注）
    else el.classList.add('h-value'); // 粉：重复值
  });
}

// 结果条目上的规则徽章
function badgeTexts(rules) {
  const out = [];
  if (rules.has('same-name-diff')) out.push(RULE_LABELS['same-name-diff']);
  if (rules.has('value-cross')) out.push(RULE_LABELS['value-cross']);
  if (rules.has('value-inner')) out.push(RULE_LABELS['value-inner']);
  return out;
}

// 渲染结果框（③④）：「同名值不同」优先排最前，其余保持行序
function renderResults(listEl, hits) {
  if (hits.length === 0) {
    listEl.innerHTML = '<li class="empty-hint">没有命中的重复条目</li>';
    return;
  }
  const sorted = [...hits].sort((a, b) => {
    const da = a.rules.has('same-name-diff') ? 0 : 1;
    const db = b.rules.has('same-name-diff') ? 0 : 1;
    return da - db;
  });
  listEl.innerHTML = sorted.map(({ entry, rules }) => {
    const badges = badgeTexts(rules).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
    const text = entry.value !== '' ? `${esc(entry.key)}: ${esc(entry.value)}` : esc(entry.key);
    return `<li data-side="${entry.side}" data-idx="${entry.idx}">L${entry.idx + 1} ${text} ${badges}</li>`;
  }).join('');
}

// ---------- 主流程：解析 + 对比 + 渲染 ----------

let debounceTimer = null;

// 输入后延迟 250ms 再计算
function scheduleCompare() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runCompare, 250);
}

function runCompare() {
  const targetEntries = Compare.parseLines(targetInput.value).map((e) => ({ ...e, side: 'target' }));
  const sourceEntries = Compare.parseLines(sourceInput.value).map((e) => ({ ...e, side: 'source' }));

  const { targetFlags, sourceFlags } = Compare.computeFlags(targetEntries, sourceEntries);

  renderMirror(targetInput, targetMirror);
  renderMirror(sourceInput, sourceMirror);
  // 高亮按「行」合并（同一行拆出多个属性时整行着色）；结果框按「条目」展示
  applyHighlights(targetMirror, Compare.toLineFlags(targetEntries, targetFlags));
  applyHighlights(sourceMirror, Compare.toLineFlags(sourceEntries, sourceFlags));

  renderResults(targetResult, Compare.collectHits(targetEntries, targetFlags));
  renderResults(sourceResult, Compare.collectHits(sourceEntries, sourceFlags));
}

targetInput.addEventListener('input', scheduleCompare);
sourceInput.addEventListener('input', scheduleCompare);

// ---------- 点击结果条目 -> 跳转到输入框中对应行并闪烁 ----------
document.addEventListener('click', (event) => {
  const li = event.target.closest('li[data-idx]');
  if (!li) return;
  const idx = Number(li.dataset.idx);
  const isTarget = li.dataset.side === 'target';
  const textarea = isTarget ? targetInput : sourceInput;
  const mirror = isTarget ? targetMirror : sourceMirror;
  const lineEl = mirror.children[idx];
  if (!lineEl) return;

  // 滚动到目标行（约屏幕 1/3 处）
  textarea.scrollTop = Math.max(0, lineEl.offsetTop - textarea.clientHeight / 3);
  textarea.focus();

  // 闪烁提示（先移除再强制重排，保证动画可重复触发）
  lineEl.classList.remove('flash');
  void lineEl.offsetWidth;
  lineEl.classList.add('flash');
});

// ---------- 复制差异清单（同名值不同）----------
// 生成 Tab 分隔的三列文本：属性名 / Target值 / Source值，可直接粘贴进表格
function buildDiffText() {
  const targetEntries = Compare.parseLines(targetInput.value).map((e) => ({ ...e, side: 'target' }));
  const sourceEntries = Compare.parseLines(sourceInput.value).map((e) => ({ ...e, side: 'source' }));
  const { targetFlags, sourceFlags } = Compare.computeFlags(targetEntries, sourceEntries);

  const diffKeys = new Set(); // 任一侧命中「同名值不同」的属性名
  const tVal = new Map();     // 属性名 -> 首个命中 E 的 Target 值
  const sVal = new Map();
  targetEntries.forEach((e, i) => {
    if (targetFlags.get(i) && targetFlags.get(i).has('same-name-diff')) {
      diffKeys.add(e.key);
      if (!tVal.has(e.key)) tVal.set(e.key, e.value);
    }
  });
  sourceEntries.forEach((e, i) => {
    if (sourceFlags.get(i) && sourceFlags.get(i).has('same-name-diff')) {
      diffKeys.add(e.key);
      if (!sVal.has(e.key)) sVal.set(e.key, e.value);
    }
  });
  if (diffKeys.size === 0) return '';

  const rows = ['属性名\tTarget\tSource'];
  for (const key of diffKeys) {
    const tv = tVal.has(key) ? tVal.get(key) : (targetEntries.find((e) => e.key === key) || { value: '' }).value;
    const sv = sVal.has(key) ? sVal.get(key) : (sourceEntries.find((e) => e.key === key) || { value: '' }).value;
    rows.push(`${key}\t${tv}\t${sv}`);
  }
  return rows.join('\n');
}

// 按钮文字临时反馈
function flashBtn(text) {
  const old = copyDiffBtn.textContent;
  copyDiffBtn.textContent = text;
  setTimeout(() => { copyDiffBtn.textContent = old; }, 1500);
}

copyDiffBtn.addEventListener('click', () => {
  const text = buildDiffText();
  if (!text) {
    flashBtn('没有同名值不同的差异');
    return;
  }
  const count = text.split('\n').length - 1; // 去掉表头
  const done = () => flashBtn(`已复制 ${count} 条差异`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => {
      // 兜底：旧式复制
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  }
});

// ---------- 一键清空 ----------
clearBtn.addEventListener('click', () => {
  targetInput.value = '';
  sourceInput.value = '';
  runCompare();
});

// ---------- 初始化 ----------
bindScroll(targetInput, targetMirror);
bindScroll(sourceInput, sourceMirror);
window.addEventListener('resize', () => {
  syncMirrorSize(targetInput, targetMirror);
  syncMirrorSize(sourceInput, sourceMirror);
});
runCompare();
