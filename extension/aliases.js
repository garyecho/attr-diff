// ===== aliases.js：属性名等价别名表（独立维护，只需改这个文件）=====
// 用法：浏览器环境由 sidepanel.html 用 <script> 引入（挂到 window.ATTRIBUTE_ALIASES）；
//       Node 测试环境由 compare.js 自动 require。
// 格式：'写法 A': '标准名' —— 两侧比较前都先归一，等价属性名视为同名。
// 规则：等价后值相同 → 不标记；等价后值不同 → 蓝（同名值不同）。

(function (global) {
  'use strict';

  const ATTRIBUTE_ALIASES = {
    '實際總長度': '總長度',
    '胸圍實際寬度': '胸圍',
    '色系': '顏色',
    // ---- 按实际数据继续补充，例如：----
    // '使用對象': '性別',
    // '型號': '產品編號',
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ATTRIBUTE_ALIASES;
  } else {
    global.ATTRIBUTE_ALIASES = ATTRIBUTE_ALIASES;
  }
})(typeof window !== 'undefined' ? window : globalThis);
