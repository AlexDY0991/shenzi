// 离线关卡生成器：随机摆放毛线 -> 保证每根都缠着 -> 求解器算参考步数 -> 按难度筛选
// 运行：npm run levels
import { writeFileSync } from 'node:fs';
import { BoardGeo, LevelData } from '../src/core/puzzle';
import { makeRng, shuffle } from '../src/core/rng';
import { solve, tanglePairs } from '../src/core/solver';

const MASKS: Record<string, string[]> = {
  rect3x3: ['###', '###', '###'],
  rect3x4: ['###', '###', '###', '###'],
  rect4x4: ['####', '####', '####', '####'],
  rect4x5: ['####', '####', '####', '####', '####'],
  rect4x6: ['####', '####', '####', '####', '####', '####'],
  rect5x6: ['#####', '#####', '#####', '#####', '#####', '#####'],
  rect5x7: ['#####', '#####', '#####', '#####', '#####', '#####', '#####'],
  catHead: ['#...#', '##.##', '#####', '#####', '#####', '.###.'],
  catHead7: ['#...#', '##.##', '#####', '#####', '#####', '#####', '.###.'],
  paw: ['.#.#.', '##.##', '.###.', '#####', '#####', '.###.'],
  paw7: ['.#.#.', '##.##', '#.#.#', '.###.', '#####', '#####', '.###.'],
  fish: ['..#..', '.###.', '#####', '#####', '.###.', '#.#.#'],
  heart: ['.#.#.', '#####', '#####', '#####', '.###.', '..#..'],
};

interface Plan {
  mask: keyof typeof MASKS;
  ropes: number;
  minPar: number;
  maxPar: number;
  /** 在参考步数之外多给的步数 */
  slack: number;
}

const PLANS: Plan[] = [
  { mask: 'rect3x4', ropes: 3, minPar: 2, maxPar: 2, slack: 3 },
  { mask: 'rect4x4', ropes: 3, minPar: 2, maxPar: 3, slack: 3 },
  { mask: 'rect4x5', ropes: 4, minPar: 3, maxPar: 3, slack: 3 },
  { mask: 'catHead', ropes: 5, minPar: 3, maxPar: 4, slack: 3 },
  { mask: 'rect4x6', ropes: 5, minPar: 4, maxPar: 4, slack: 3 },
  { mask: 'paw', ropes: 5, minPar: 4, maxPar: 5, slack: 3 },
  { mask: 'rect5x6', ropes: 6, minPar: 4, maxPar: 5, slack: 3 },
  { mask: 'fish', ropes: 6, minPar: 5, maxPar: 5, slack: 3 },
  { mask: 'heart', ropes: 7, minPar: 5, maxPar: 6, slack: 3 },
  { mask: 'rect5x7', ropes: 7, minPar: 5, maxPar: 6, slack: 3 },
  { mask: 'catHead7', ropes: 7, minPar: 6, maxPar: 7, slack: 3 },
  { mask: 'rect5x7', ropes: 8, minPar: 6, maxPar: 7, slack: 3 },
  { mask: 'paw7', ropes: 8, minPar: 6, maxPar: 8, slack: 3 },
  { mask: 'rect5x7', ropes: 9, minPar: 7, maxPar: 9, slack: 4 },
];

const COLOR_COUNT = 9;

function holesOf(geo: BoardGeo): number[] {
  const out: number[] = [];
  for (let h = 0; h < geo.holeCount; h++) if (geo.holes[h]) out.push(h);
  return out;
}

/** 随机摆一组毛线，要求每根都至少和一根缠住 */
function randomLayout(geo: BoardGeo, n: number, rnd: () => number): [number, number][] | null {
  const holes = shuffle(holesOf(geo), rnd);
  const ropes: [number, number][] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const a = holes[Math.floor(rnd() * holes.length)];
      const b = holes[Math.floor(rnd() * holes.length)];
      if (a === b || used.has(a) || used.has(b)) continue;
      const pa = geo.pos(a);
      const pb = geo.pos(b);
      const len = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (len < 1.9 || len > 4.6) continue;
      ropes.push([a, b]);
      used.add(a);
      used.add(b);
      placed = true;
    }
    if (!placed) return null;
  }
  return tanglePairs(geo, ropes).free === 0 ? ropes : null;
}

function generate(plan: Plan, seed: number): LevelData {
  const mask = MASKS[plan.mask];
  const geo = new BoardGeo(mask[0].length, mask.length, mask);
  const rnd = makeRng(seed);
  // 先随机出一批布局，按"乱的程度"从高到低逐个求解，取第一个参考步数落在目标区间的
  const layouts: { ropes: [number, number][]; pairs: number }[] = [];
  for (let attempt = 0; attempt < 400; attempt++) {
    const ropes = randomLayout(geo, plan.ropes, rnd);
    if (ropes) layouts.push({ ropes, pairs: tanglePairs(geo, ropes).pairs });
  }
  layouts.sort((x, y) => y.pairs - x.pairs);
  let best: { ropes: [number, number][]; par: number; miss: number } | null = null;
  for (const l of layouts.slice(0, 80)) {
    const par = solve(geo, l.ropes, 120);
    if (par < 0) continue;
    const miss = par < plan.minPar ? plan.minPar - par : Math.max(0, par - plan.maxPar);
    if (!best || miss < best.miss) best = { ropes: l.ropes, par, miss };
    if (miss === 0) break;
  }
  if (!best) throw new Error(`无法生成关卡 ${JSON.stringify(plan)}`);
  // 用更宽的束再确认一次参考步数
  const par = Math.min(best.par, solve(geo, best.ropes, 600));
  const colors = shuffle([...Array(COLOR_COUNT).keys()], rnd);
  return {
    cols: geo.cols,
    rows: geo.rows,
    mask,
    ropes: best.ropes.map(([a, b], i) => [colors[i % COLOR_COUNT], a, b]),
    steps: par + plan.slack,
    par,
  };
}

// 第 1 关手工设计：两根交叉的毛线，挪一下就解开
const tutorial: LevelData = {
  cols: 3,
  rows: 3,
  mask: MASKS.rect3x3,
  ropes: [
    [0, 0, 8],
    [3, 2, 6],
  ],
  steps: 3,
  par: 1,
};

const levels: LevelData[] = [tutorial];
PLANS.forEach((plan, i) => {
  const t = Date.now();
  const lv = generate(plan, 1000 + i * 7919);
  levels.push(lv);
  console.log(`关卡 ${levels.length}: ${plan.mask} 毛线×${plan.ropes} 参考${lv.par}步 给${lv.steps}步 (${Date.now() - t}ms)`);
});

writeFileSync('src/levels/levels.json', JSON.stringify(levels) + '\n');
console.log(`共 ${levels.length} 关已写入 src/levels/levels.json`);
