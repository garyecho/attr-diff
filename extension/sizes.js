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
