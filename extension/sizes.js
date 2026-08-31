// ===== 主流鞋码对照表数据（成人，基于脚长 mm） =====
// 说明：
//   - 第一列「脚长 mm」即中国新码(CN)、日本码(JP)、Mondopoint(ISO 9407)，
//     三者都直接使用脚长毫米数，故合为一列。
//   - 本表以 Nike 等主流运动品牌官方尺码表为参考：
//       美码 US女 ≈ US男 + 1.5（同一脚长）；小码段（220–235）无男码，只列女码
//       英码 UK 不分男女，同一脚长对应同一 UK 数字（故合并为单列）
//       欧码 EU 为 Nike 官方近似值（如 240mm→38.5、255mm→40.5）
//   - 注意：不同品牌/鞋型存在半码差异，本表仅供对照参考，
//     购买前请再查该品牌官方尺码表；宽度、鞋型、个人脚型同样关键。
//   - 维护方式：直接改下面的数组即可，不用动渲染逻辑（与 aliases.js 相同模式）。

const SIZE_CHART = [
  { mm: 220, eu: 35.5, usM: null, usW: 5,   uk: 2.5 },
  { mm: 225, eu: 36,   usM: null, usW: 5.5, uk: 3   },
  { mm: 230, eu: 36.5, usM: null, usW: 6,   uk: 3.5 },
  { mm: 235, eu: 37.5, usM: null, usW: 6.5, uk: 4   },
  { mm: 240, eu: 38,   usM: 6,    usW: 7.5, uk: 5.5 },
  { mm: 245, eu: 38.5, usM: 6.5,  usW: 8,   uk: 6   },
  { mm: 250, eu: 39,   usM: 7,    usW: 8.5, uk: 6   },
  { mm: 255, eu: 40,   usM: 7.5,  usW: 9,   uk: 6.5 },
  { mm: 260, eu: 40.5, usM: 8,    usW: 9.5, uk: 7   },
  { mm: 265, eu: 41,   usM: 8.5,  usW: 10,  uk: 7.5 },
  { mm: 270, eu: 42,   usM: 9,    usW: 10.5,uk: 8   },
  { mm: 275, eu: 42.5, usM: 9.5,  usW: 11,  uk: 8.5 },
  { mm: 280, eu: 43,   usM: 10,   usW: 11.5,uk: 9   },
  { mm: 285, eu: 44,   usM: 10.5, usW: 12,  uk: 9.5 },
  { mm: 290, eu: 44.5, usM: 11,   usW: 12.5,uk: 10  },
  { mm: 295, eu: 45,   usM: 11.5, usW: 13,  uk: 10.5},
  { mm: 300, eu: 45.5, usM: 12,   usW: 13.5,uk: 11  },
];

// 表头（与 SIZE_CHART 字段一一对应）
const SIZE_CHART_COLUMNS = [
  { key: 'mm',  label: '脚长 mm' },
  { key: 'eu',  label: '欧码 EU' },
  { key: 'usM', label: '美码 US 男' },
  { key: 'usW', label: '美码 US 女' },
  { key: 'uk',  label: '英码 UK' },
];

// ===== 儿童鞋码对照表数据（婴儿~大童，基于脚长 mm） =====
// 说明：
//   - 以 Nike 官方儿童尺码表为参考（脚长 mm 近似对应 China-MM/CM 列，
//     实际脚长通常比标签 CM 略短一点）。
//   - 儿童 US/UK 均不分男女（unisex），故各只有一列（US 用 C=童码 / Y=大童 后缀）。
//   - 儿童 EU/US/UK 与成人并非同一刻度（儿童鞋放量更大，同脚长的儿童码数值更小），
//     因此独立成表，勿与成人表混用。
//   - 大童 7Y（≈260mm）与成人男码 US 7（250mm）同号衔接（儿童鞋实际内长更长）。
//   - 选码建议：实测脚长后加 5–10mm 成长空间再对照选码。
//   - 不同品牌（Adidas、New Balance 等）仍可能有半码差异，购前请以目标品牌官网为准。
//   - 维护方式：直接改下面的数组即可（与 SIZE_CHART 相同模式）。

const SIZE_CHART_KIDS = [
  // Baby & Toddler（C 码）
  { mm: 70,  eu: 16,   us: '1C',    uk: 0.5 },
  { mm: 75,  eu: 16.5, us: '1.5C',  uk: 1   },
  { mm: 80,  eu: 17,   us: '2C',    uk: 1.5 },
  { mm: 85,  eu: 18,   us: '2.5C',  uk: 2   },
  { mm: 90,  eu: 18.5, us: '3C',    uk: 2.5 },
  { mm: 95,  eu: 19,   us: '3.5C',  uk: 3   },
  { mm: 100, eu: 19.5, us: '4C',    uk: 3.5 },
  { mm: 105, eu: 20,   us: '4.5C',  uk: 4   },
  { mm: 110, eu: 21,   us: '5C',    uk: 4.5 },
  { mm: 115, eu: 21.5, us: '5.5C',  uk: 5   },
  { mm: 120, eu: 22,   us: '6C',    uk: 5.5 },
  { mm: 125, eu: 22.5, us: '6.5C',  uk: 6   },
  { mm: 130, eu: 23.5, us: '7C',    uk: 6.5 },
  { mm: 135, eu: 24,   us: '7.5C',  uk: 7   },
  { mm: 140, eu: 25,   us: '8C',    uk: 7.5 },
  { mm: 145, eu: 25.5, us: '8.5C',  uk: 8   },
  { mm: 150, eu: 26,   us: '9C',    uk: 8.5 },
  { mm: 155, eu: 26.5, us: '9.5C',  uk: 9   },
  { mm: 160, eu: 27,   us: '10C',   uk: 9.5 },
  { mm: 165, eu: 27.5, us: '10.5C', uk: 10  },
  { mm: 170, eu: 28,   us: '11C',   uk: 10.5 },
  { mm: 175, eu: 28.5, us: '11.5C', uk: 11  },
  { mm: 180, eu: 29.5, us: '12C',   uk: 11.5 },
  { mm: 185, eu: 30,   us: '12.5C', uk: 12  },
  { mm: 190, eu: 31,   us: '13C',   uk: 12.5 },
  { mm: 195, eu: 31.5, us: '13.5C', uk: 13  },
  // Youth（Y 码，200mm 起进入 1Y）
  { mm: 200, eu: 32,   us: '1Y',    uk: 13.5 },
  { mm: 205, eu: 33,   us: '1.5Y',  uk: 1   },
  { mm: 210, eu: 33.5, us: '2Y',    uk: 1.5 },
  { mm: 215, eu: 34,   us: '2.5Y',  uk: 2   },
  { mm: 220, eu: 35,   us: '3Y',    uk: 2.5 },
  { mm: 225, eu: 35.5, us: '3.5Y',  uk: 3   },
  { mm: 230, eu: 36,   us: '4Y',    uk: 3.5 },
  { mm: 235, eu: 36.5, us: '4.5Y',  uk: 4   },
  { mm: 240, eu: 37.5, us: '5Y',    uk: 4.5 },
  { mm: 245, eu: 38,   us: '5.5Y',  uk: 5   },
  { mm: 250, eu: 38.5, us: '6Y',    uk: 5.5 },
  { mm: 255, eu: 39,   us: '6.5Y',  uk: 6   },
  { mm: 260, eu: 40,   us: '7Y',    uk: 6   },
];

// 儿童表表头（与 SIZE_CHART_KIDS 字段一一对应）
const SIZE_CHART_KIDS_COLUMNS = [
  { key: 'mm', label: '脚长 mm' },
  { key: 'eu', label: '欧码 EU' },
  { key: 'us', label: '美码 US(童)' },
  { key: 'uk', label: '英码 UK' },
];
