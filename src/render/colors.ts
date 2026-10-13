// 毛线配色：10 种，保证相邻色差明显
export const YARN_COLORS = [
  '#E8605A', // 红
  '#F39A3D', // 橙
  '#F2C84B', // 黄
  '#79C267', // 绿
  '#3FB8AF', // 青
  '#5B8FE0', // 蓝
  '#9C6ADE', // 紫
  '#F08BB8', // 粉
  '#3D5A99', // 藏青
  '#A8C93E', // 草绿
];

export const THEME = {
  bg: '#FFF4E8',
  bgTop: '#FFE4E6',
  stitch: '#F0B898',
  bgPaw: 'rgba(240,190,170,0.28)',
  board: '#FFF0DD',
  boardEdge: '#F1C7A2',
  boardKnit: 'rgba(225,160,110,0.16)',
  hole: '#F3D3B0',
  holeDeep: '#E2B48A',
  holeStitch: '#EDB596',
  text: '#6B4A2E',
  textLight: '#A07A55',
  panel: '#FFFDF8',
  accent: '#F39A3D',
  danger: '#E8605A',
  catBody: '#F4A259',
  catStripe: '#DE8634',
  catCream: '#FFEBD0',
  catPink: '#F7A6B5',
  catLine: '#7A4A26',
  basket: '#C98F55',
  basketDark: '#A06B38',
  thread: '#FFF3DD',
};

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** amt > 0 变亮（混白），amt < 0 变暗（混黑） */
export function shade(hex: string, amt: number, alpha = 1): string {
  const [r, g, b] = parseHex(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const mix = (c: number) => Math.round(c + (t - c) * k);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
}

export function yarnColor(i: number): string {
  return YARN_COLORS[i % YARN_COLORS.length];
}
