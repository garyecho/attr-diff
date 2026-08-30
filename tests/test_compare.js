// 用 Node 运行：node tests/test_compare.js
// 验证 compare.js 的解析与重复规则（含方案 D：属性名等价归一）

const { parseLines, computeFlags, collectHits, toLineFlags } = require('../extension/compare.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.log('FAIL:', msg);
  }
}

const targetText = '品牌: 苹果\n颜色: 红色\n尺寸: 大号\n备用色: 红色\n苹果';
const sourceText = '品牌: 苹果\n颜色: 蓝色\n重量: 500g\n苹果\n苹果';

const te = parseLines(targetText).map((e) => ({ ...e, side: 'target' }));
const se = parseLines(sourceText).map((e) => ({ ...e, side: 'source' }));
const { targetFlags, sourceFlags } = computeFlags(te, se);

function rules(flags, idx) {
  const r = flags.get(idx);
  return r ? [...r].sort().join(',') : '';
}

// ---- 规则命中断言 ----
assert(rules(targetFlags, 0) === '',
  'T0 品牌:苹果 同名同值 → 不标记，实际: ' + rules(targetFlags, 0));
assert(rules(targetFlags, 1) === 'same-name-diff,value-inner',
  'T1 颜色:红色 应命中 E+D（同名值不同+内部重复），实际: ' + rules(targetFlags, 1));
assert(rules(targetFlags, 2) === '',
  'T2 尺寸:大号 不应命中，实际: ' + rules(targetFlags, 2));
assert(rules(targetFlags, 3) === 'value-inner',
  'T3 备用色:红色 应命中 D，实际: ' + rules(targetFlags, 3));
assert(rules(targetFlags, 4) === '',
  'T4 苹果(裸行) 同名同值 → 不标记，实际: ' + rules(targetFlags, 4));

assert(rules(sourceFlags, 0) === '',
  'S0 品牌:苹果 同名同值 → 不标记，实际: ' + rules(sourceFlags, 0));
assert(rules(sourceFlags, 1) === 'same-name-diff',
  'S1 颜色:蓝色 应命中 E（同名值不同），实际: ' + rules(sourceFlags, 1));
assert(rules(sourceFlags, 2) === '',
  'S2 重量:500g 不应命中，实际: ' + rules(sourceFlags, 2));
assert(rules(sourceFlags, 3) === '',
  'S3 苹果(裸行) 同名同值 → 不标记，实际: ' + rules(sourceFlags, 3));
assert(rules(sourceFlags, 4) === '',
  'S4 苹果(裸行) 同名同值 → 不标记，实际: ' + rules(sourceFlags, 4));

// ---- 解析断言 ----
const parsed = parseLines('品牌：苹果\n重量:500g\na:b:c');
assert(parsed.length === 3, '全角冒号/无空格 应解析出 3 条');
assert(parsed[0].key === '品牌' && parsed[0].value === '苹果', '全角冒号解析失败');
assert(parsed[1].key === '重量' && parsed[1].value === '500g', '无空格解析失败');
assert(parsed[2].key === 'a' && parsed[2].value === 'b:c', '多冒号应取第一个');

const p2 = parseLines('品牌: 苹果\n\n颜色: 红色');
assert(p2.length === 2, '空行应被跳过');
assert(p2[1].idx === 2, 'idx 应保留原始行号，实际: ' + p2[1].idx);

// ---- 空格归一化断言（NBSP / 全角空格）----
const nbsp = parseLines('品牌:\u00A0苹果\n颜色\u3000: 红色');
assert(nbsp[0].key === '品牌' && nbsp[0].value === '苹果', 'NBSP 归一化失败');
assert(nbsp[1].key === '颜色' && nbsp[1].value === '红色', '全角空格归一化失败');

const t2 = parseLines('品牌:\u00A0苹果');
const s2 = parseLines('品牌: 苹果');
const f2 = computeFlags(t2, s2);
assert(!f2.targetFlags.has(0), 'NBSP 内容匹配为同名同值 → 不标记');

// ---- 规则 E：同名但值不同 ----
const t3 = parseLines('色系: 黑色\n鞋碼US: 6');
const s3 = parseLines('色系: Black Tones\n鞋碼US: 6');
const f3 = computeFlags(t3, s3);
assert(f3.targetFlags.has(0) && f3.targetFlags.get(0).has('same-name-diff'),
  'T 色系 应命中 E（同名值不同）');
assert(f3.sourceFlags.has(0) && f3.sourceFlags.get(0).has('same-name-diff'), 'S 色系 应命中 E');
assert(!f3.targetFlags.has(1), 'T 鞋碼US 同名同值 → 不标记');

// ---- 格式兼容：标签剥离 / 同行拆分 / 值含冒号 ----
const lbl = parseLines('target:流行服飾/配件 色系:黑色\n使用對象:Womens');
assert(lbl.length === 3, '标签剥离+同行拆分 应得 3 条，实际 ' + lbl.length);
assert(lbl[0].key === '流行服飾/配件' && lbl[0].value === '', '裸属性拆分失败');
assert(lbl[1].key === '色系' && lbl[1].value === '黑色', '同行 key:value 拆分失败');

const srcLbl = parseLines('source：流行服飾/配件 色系: Black Tones');
assert(srcLbl.length === 2 && srcLbl[1].key === '色系' && srcLbl[1].value === 'Black Tones',
  'source： 标签剥离+空格值解析失败');

const time = parseLines('時間: 12:30');
assert(time.length === 1 && time[0].key === '時間' && time[0].value === '12:30', '值含冒号不应拆分');

// ---- BOM 与缺属性名容错 ----
const bom = parseLines('\uFEFF品牌: 苹果');
assert(bom.length === 1 && bom[0].key === '品牌', 'BOM 字符应被剥离');

const noKey = parseLines('品牌: 苹果\n: 5');
assert(noKey.length === 1, '缺属性名的行应被跳过');

// ---- 行级合并：同行拆出的两个条目互不干扰 ----
const te5 = parseLines('流行服飾/配件 色系:黑色');
const se5 = parseLines('流行服飾/配件 色系: Black Tones');
const f5 = computeFlags(te5, se5);
assert(!f5.targetFlags.has(0), '裸属性条目 同名同值 → 不标记');
assert(f5.targetFlags.get(1).has('same-name-diff'), '色系条目命中 E（同名值不同）');
const lineFlags = toLineFlags(te5, f5.targetFlags);
assert(lineFlags.has(0) && lineFlags.get(0).has('same-name-diff'), '行级合并后整行含 E（高亮为蓝）');

// ---- 方案 D：属性名等价归一（别名表 + 包含匹配）----

// D0) 别名表独立维护在 aliases.js，且被 compare.js 使用
const D_ALIASES = require('../extension/aliases.js');
assert(D_ALIASES['實際總長度'] === '總長度' && D_ALIASES['胸圍實際寬度'] === '胸圍' && D_ALIASES['色系'] === '顏色', 'D0 aliases.js 别名表加载正确');

// D1) 别名表：實際總長度 vs 總長度，值相同 → 不标记
const d1t = parseLines('實際總長度: 75厘米');
const d1s = parseLines('總長度: 75厘米');
const df1 = computeFlags(d1t, d1s);
assert(!df1.targetFlags.has(0) && !df1.sourceFlags.has(0), 'D1 實際總長度/總長度 值相同 → 不标记');

// D2) 别名表：值不同 → 蓝 same-name-diff（双向）
const d2t = parseLines('實際總長度: 70厘米');
const d2s = parseLines('總長度: 75厘米');
const df2 = computeFlags(d2t, d2s);
assert(df2.targetFlags.has(0) && df2.targetFlags.get(0).has('same-name-diff'), 'D2 實際總長度/總長度 值不同 → 蓝');
assert(df2.sourceFlags.has(0) && df2.sourceFlags.get(0).has('same-name-diff'), 'D2 反向也标蓝');

// D3) 别名表：胸圍實際寬度 vs 胸圍，值相同 → 不标记
const d3t = parseLines('胸圍實際寬度: 36厘米');
const d3s = parseLines('胸圍: 36厘米');
const df3 = computeFlags(d3t, d3s);
assert(!df3.targetFlags.has(0) && !df3.sourceFlags.has(0), 'D3 胸圍實際寬度/胸圍 值相同 → 不标记');

// D4) 别名表：色系 vs 顏色（无包含关系，靠别名表），值相同 → 不标记
const d4t = parseLines('色系: 黑色');
const d4s = parseLines('顏色: 黑色');
const df4 = computeFlags(d4t, d4s);
assert(!df4.targetFlags.has(0) && !df4.sourceFlags.has(0), 'D4 色系/顏色 值相同 → 不标记');

// D5) 别名表：色系 vs 顏色，值不同 → 蓝
const d5t = parseLines('色系: 黑色');
const d5s = parseLines('顏色: 白色');
const df5 = computeFlags(d5t, d5s);
assert(df5.targetFlags.get(0).has('same-name-diff') && df5.sourceFlags.get(0).has('same-name-diff'), 'D5 色系/顏色 值不同 → 蓝');

// D6) 自动兜底：主面料 vs 面料（未收录但包含），值相同 → 不标记
const d6t = parseLines('主面料: 純棉');
const d6s = parseLines('面料: 純棉');
const df6 = computeFlags(d6t, d6s);
assert(!df6.targetFlags.has(0) && !df6.sourceFlags.has(0), 'D6 主面料/面料 值相同 → 不标记');

// D7) 自动兜底：包含 + 值不同 → 蓝（用户确认的修订行为）
const d7t = parseLines('主面料: 純棉');
const d7s = parseLines('面料: 尼龍');
const df7 = computeFlags(d7t, d7s);
assert(df7.targetFlags.get(0).has('same-name-diff') && df7.sourceFlags.get(0).has('same-name-diff'), 'D7 主面料/面料 值不同 → 蓝');

// D8) 值相同但属性名完全无关 → 维持现状（value-cross 粉，不视为同名）
const d8t = parseLines('數量: 2');
const d8s = parseLines('庫存: 2');
const df8 = computeFlags(d8t, d8s);
assert(df8.targetFlags.get(0).has('value-cross') && df8.sourceFlags.get(0).has('value-cross'), 'D8 數量/庫存 值相同 → 维持 value-cross 粉');
assert(!df8.targetFlags.get(0).has('same-name-diff') && !df8.sourceFlags.get(0).has('same-name-diff'), 'D8 數量/庫存 → 不标蓝');

// D9) 单字核心词不触发包含：寬 vs 寬度（短名仅 1 字，太泛）
const d9t = parseLines('寬: 5');
const d9s = parseLines('寬度: 5');
const df9 = computeFlags(d9t, d9s);
assert(df9.targetFlags.get(0).has('value-cross') && !df9.targetFlags.get(0).has('same-name-diff'), 'D9 寬/寬度 单字核心 → 只标粉不标蓝');

// D10) 方案 D 与既有规则叠加：归一后同名，内部重复仍命中（D）
const d10t = parseLines('色系: 黑色\n顏色: 黑色');
const d10s = parseLines('顏色: 黑');
const df10 = computeFlags(d10t, d10s);
assert(df10.targetFlags.has(1) && df10.targetFlags.get(1).has('value-inner'), 'D10 归一后同名，內部重复仍命中（D）');

console.log(failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
