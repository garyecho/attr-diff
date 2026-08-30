// ===== compare.js：纯对比逻辑（不依赖 DOM，可用 Node 单独测试）=====

(function (global) {
  'use strict';

  // ===== 属性名等价归一（方案 D）=====
  // 别名表独立维护在 aliases.js：
  //   浏览器：sidepanel.html 先 <script src="aliases.js">，挂到 window.ATTRIBUTE_ALIASES
  //   Node 测试：本文件 require 同目录 aliases.js
  // 比较前两侧属性名都先归一，再走下面的规则。
  let _aliases = null;
  function getAliases() {
    if (_aliases) return _aliases;
    _aliases = global.ATTRIBUTE_ALIASES ||
      (typeof module !== 'undefined' && module.exports ? require('./aliases.js') : {}) ||
      {};
    return _aliases;
  }

  // 归一化属性名：查别名表，未收录则原样返回
  function normalizeKey(key) {
    const t = String(key).trim();
    const aliases = getAliases();
    return aliases[t] || t;
  }

  // 包含关系：较长名包含较短名，且较短名至少 2 个字符（避免 1 字太泛误合并）
  function containsName(a, b) {
    const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
    return shorter.length >= 2 && longer !== shorter && longer.includes(shorter);
  }

  // 把一行拆成一条属性记录
  function pushEntry(line, idx, entries) {
    const m = line.match(/^([^:：]*)[:：]\s*(.*)$/);
    let key, value;
    if (m) {
      key = m[1].trim();
      value = m[2].trim();
    } else {
      key = line.trim();
      value = '';
    }
    if (key === '') return; // 跳过缺属性名的行（如「: 5」）
    entries.push({ idx, key, value, raw: line });
  }

  // 把一段文本按行解析成属性条目
  // 每行格式：属性名: 属性值（中英文冒号都支持）
  // 没有冒号的行：整行作为属性名，值为空
  function parseLines(text) {
    const entries = [];
    // 去掉 BOM 与粘贴时可能带上的开头标签，如「target:」「source：」
    const noLabel = String(text).replace(/^\uFEFF/, '').replace(/^(target|source)\s*[:：]\s*/i, '');
    const lines = noLabel.split(/\r?\n/);
    lines.forEach((raw, idx) => {
      // 归一化不换行空格(NBSP)和全角空格，粘贴自网页的内容更容易匹配
      const cleaned = raw.replace(/\u00A0/g, ' ').replace(/\u3000/g, ' ');
      const trimmed = cleaned.trim();
      if (trimmed === '') return; // 跳过空行
      // 兼容「裸属性 + 属性名:值」同行粘贴，如「流行服飾/配件 色系:黑色」
      const splitMatch = trimmed.match(/^([^\s:：]+)\s+([^:：]+[:：].*)$/);
      if (splitMatch) {
        pushEntry(splitMatch[1], idx, entries);
        pushEntry(splitMatch[2], idx, entries);
      } else {
        pushEntry(trimmed, idx, entries);
      }
    });
    return entries;
  }

  // 建立索引，便于快速查找（属性名先做归一化，别名表等价名视为同名）
  // byName   : 属性名 -> Map(属性值 -> 出现次数)
  // byValue  : 属性值 -> 出现次数（跨属性名统计）
  // valueCount : 对象内部 属性值 -> 出现次数（规则 D 用）
  function buildIndex(entries) {
    const byName = new Map();
    const byValue = new Map();
    const valueCount = new Map();
    for (const e of entries) {
      const nk = normalizeKey(e.key);
      if (!byName.has(nk)) byName.set(nk, new Map());
      const vm = byName.get(nk);
      vm.set(e.value, (vm.get(e.value) || 0) + 1);
      if (e.value !== '') {
        byValue.set(e.value, (byValue.get(e.value) || 0) + 1);
        valueCount.set(e.value, (valueCount.get(e.value) || 0) + 1);
      }
    }
    return { byName, byValue, valueCount };
  }

  // 对比两个对象，返回 { targetFlags, sourceFlags }
  // flags: Map(条目序号 -> Set(命中规则))；行级高亮用 toLineFlags 合并
  // 标记规则（同名同值说明两边完全一样，不标记）：
  //   规则 E same-name-diff ：同名但值不同（跨对象）→ 蓝
  //   规则 C value-cross    ：值在另一个对象中出现（跨对象，属性名可不同）→ 粉
  //   规则 D value-inner    ：值在本对象内部出现多次 → 粉
  // 方案 D（属性名等价）：
  //   - 别名表（aliases.js）内的等价属性名归一后视为同名；
  //   - 未收录但存在包含关系的属性名（如 主面料 ⊃ 面料）自动视为同名；
  //   - 等价/包含后：值相同 → 不标记；值不同 → 蓝（same-name-diff）
  //   - 值相同但属性名完全无关（如 數量 vs 庫存）→ 维持现状（value-cross 粉）
  function computeFlags(targetEntries, sourceEntries) {
    const T = buildIndex(targetEntries);
    const S = buildIndex(sourceEntries);

    // 找另一侧与 nk 有包含关系的键（任一方向：长名包含短名）
    function findContainedKey(otherByName, nk) {
      for (const k2 of otherByName.keys()) {
        if (k2 === nk) continue;
        if (containsName(nk, k2)) return k2;
      }
      return null;
    }

    // flags 按「条目序号」记录（同一行拆出的多个条目互不干扰）
    function flagFor(entries, mine, other, flags) {
      entries.forEach((e, i) => {
        const nk = normalizeKey(e.key);
        const otherHasName = other.byName.has(nk);
        const pairExists = otherHasName && other.byName.get(nk).has(e.value);
        // 同名且同值（含别名表等价、同为空的裸行）：两边完全一样 → 不标记
        if (otherHasName && pairExists) return;

        // 方案 D 自动兜底：未收录但存在包含关系（如 主面料 ⊃ 面料）
        let containName = null;
        if (!otherHasName && e.value !== '') {
          containName = findContainedKey(other.byName, nk);
          // 约束 1：包含 + 值相同 → 视为同名同值 → 不标记
          if (containName && other.byName.get(containName).has(e.value)) return;
        }

        const rules = new Set();
        // 别名表内等价，或包含关系成立，但值不同 → 蓝（同名值不同）
        if (otherHasName || containName) {
          rules.add('same-name-diff'); // E
        }
        if (e.value !== '' && other.byValue.has(e.value)) {
          rules.add('value-cross'); // C
        }
        if (e.value !== '' && mine.valueCount.get(e.value) > 1) {
          rules.add('value-inner'); // D
        }
        if (rules.size > 0) flags.set(i, rules);
      });
    }

    const targetFlags = new Map();
    const sourceFlags = new Map();
    flagFor(targetEntries, T, S, targetFlags);
    flagFor(sourceEntries, S, T, sourceFlags);
    return { targetFlags, sourceFlags };
  }

  // 收集被命中的条目（保持原顺序）
  function collectHits(entries, flags) {
    const hits = [];
    entries.forEach((e, i) => {
      const rules = flags.get(i);
      if (rules && rules.size > 0) hits.push({ entry: e, rules });
    });
    return hits;
  }

  // 把按条目记录的命中合并到「行级」：同一行拆出的多个条目取并集，供高亮使用
  function toLineFlags(entries, entryFlags) {
    const lineFlags = new Map();
    entries.forEach((e, i) => {
      const rules = entryFlags.get(i);
      if (!rules) return;
      if (!lineFlags.has(e.idx)) lineFlags.set(e.idx, new Set());
      for (const r of rules) lineFlags.get(e.idx).add(r);
    });
    return lineFlags;
  }

  const api = { parseLines, buildIndex, computeFlags, collectHits, toLineFlags, normalizeKey, containsName, getAliases };

  // Node 环境导出（用于命令行测试）；浏览器环境挂到全局
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.Compare = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
