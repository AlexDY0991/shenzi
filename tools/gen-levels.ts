// 离线关卡生成器：随机摆放毛线 -> 保证每根都缠着 -> 加特殊机制 -> 求解器算参考步数 -> 按难度挑选
// 运行：npm run levels
import { writeFileSync } from 'node:fs';
import { BoardGeo, LevelData } from '../src/core/board';
import { makeRng, shuffle } from '../src/core/rng';
import { makeRules, tangleCounts } from '../src/core/rules';
import { solve } from '../src/core/solver';

const MASKS = {
  rect3x3: ['###', '###', '###'],
  rect3x4: ['###', '###', '###', '###'],
  rect4x4: ['####', '####', '####', '####'],
  rect4x5: ['####', '####', '####', '####', '####'],
  rect5x5: ['#####', '#####', '#####', '#####', '#####'],
  rect5x6: ['#####', '#####', '#####', '#####', '#####', '#####'],
  rect5x7: ['#####', '#####', '#####', '#####', '#####', '#####', '#####'],
  catHead: ['#...#', '##.##', '#####', '#####', '#####', '.###.'],
  catHead7: ['#...#', '##.##', '#####', '#####', '#####', '#####', '.###.'],
  paw: ['.#.#.', '##.##', '.###.', '#####', '#####', '.###.'],
  paw7: ['.#.#.', '##.##', '#.#.#', '.###.', '#####', '#####', '.###.'],
  fish: ['..#..', '.###.', '#####', '#####', '.###.', '#.#.#'],
  heart: ['.#.#.', '#####', '#####', '#####', '#####', '.###.', '..#..'],
};

interface Plan {
  mask: keyof typeof MASKS;
  ropes: number;
  minPar: number;
  maxPar: number;
  /** 参考步数之外多给的步数 */
  slack: number;
  /** 缝住的纽扣个数 */
  fixed?: number;
  /** 每只打盹小猫的计数 */
  sleepers?: number[];
  /** 毛线锁个数 */
  locks?: number;
}

// 1~5 关入门，6 关起依次引入：缝住的纽扣(6) -> 打盹的小猫(9) -> 毛线锁(12)
const PLANS: Plan[] = [
  { mask: 'rect3x4', ropes: 3, minPar: 2, maxPar: 2, slack: 2 },
  { mask: 'rect4x4', ropes: 4, minPar: 3, maxPar: 3, slack: 2 },
  { mask: 'rect4x5', ropes: 5, minPar: 3, maxPar: 4, slack: 2 },
  { mask: 'catHead', ropes: 6, minPar: 4, maxPar: 5, slack: 2 },
  { mask: 'rect5x5', ropes: 6, minPar: 5, maxPar: 6, slack: 2, fixed: 3 },
  { mask: 'paw', ropes: 7, minPar: 6, maxPar: 7, slack: 2, fixed: 4 },
  { mask: 'rect5x6', ropes: 8, minPar: 6, maxPar: 8, slack: 1, fixed: 4 },
  { mask: 'fish', ropes: 7, minPar: 6, maxPar: 8, slack: 2, fixed: 2, sleepers: [2] },
  { mask: 'heart', ropes: 8, minPar: 7, maxPar: 9, slack: 1, fixed: 3, sleepers: [3] },
  { mask: 'rect5x7', ropes: 9, minPar: 8, maxPar: 10, slack: 1, fixed: 4, sleepers: [2, 4] },
  { mask: 'catHead7', ropes: 8, minPar: 7, maxPar: 9, slack: 2, fixed: 3, locks: 2 },
  { mask: 'paw7', ropes: 9, minPar: 8, maxPar: 11, slack: 1, fixed: 3, sleepers: [3], locks: 2 },
  { mask: 'rect5x7', ropes: 10, minPar: 9, maxPar: 12, slack: 1, fixed: 4, sleepers: [3], locks: 2 },
  { mask: 'heart', ropes: 10, minPar: 9, maxPar: 13, slack: 1, fixed: 5, sleepers: [2, 5], locks: 3 },
];

const COLOR_COUNT = 10;

function holesOf(geo: BoardGeo): number[] {
  const out: number[] = [];
  for (let h = 0; h < geo.holeCount; h++) if (geo.holes[h]) out.push(h);
  return out;
}

/** 随机摆一组毛线，要求每根都至少和一根缠住 */
function randomLayout(geo: BoardGeo, mask: string[], n: number, rnd: () => number): [number, number][] | null {
  const holes = holesOf(geo);
  const ropes: [number, number][] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let placed = false;
    for (let tries = 0; tries < 60 && !placed; tries++) {
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
  const lv = { cols: geo.cols, rows: geo.rows, mask, ropes: ropes.map(([a, b]) => [0, a, b] as [number, number, number]), steps: 0, par: 0 };
  const { counts } = tangleCounts(makeRules(lv, geo), ropes.flat());
  return counts.every((c) => c > 0) ? ropes : null;
}

/** 在布局上随机加特殊机制 */
function decorate(plan: Plan, geo: BoardGeo, ropes: [number, number][], rnd: () => number): Pick<LevelData, 'fixed' | 'sleepers' | 'locks'> {
  const order = shuffle([...ropes.keys()], rnd);
  const out: Pick<LevelData, 'fixed' | 'sleepers' | 'locks'> = {};
  let i = 0;
  if (plan.fixed) out.fixed = order.slice(i, (i += plan.fixed)).map((r) => [r, rnd() < 0.5 ? 0 : 1]);
  if (plan.sleepers) out.sleepers = plan.sleepers.map((c) => [order[i++ % order.length], c]);
  if (plan.locks) {
    const used = new Set(ropes.flat());
    const empty = shuffle(holesOf(geo).filter((h) => !used.has(h)), rnd);
    out.locks = empty.slice(0, plan.locks).map((h) => [h, order[i++ % order.length]]);
  }
  return out;
}

function allTangled(lv: LevelData, geo: BoardGeo): boolean {
  const { counts } = tangleCounts(makeRules(lv, geo), lv.ropes.flatMap(([, a, b]) => [a, b]));
  return counts.every((c) => c > 0);
}

function quickPar(lv: LevelData, geo: BoardGeo): number {
  return solve(makeRules(lv, geo), lv.ropes.flatMap(([, a, b]) => [a, b]), 40, 30);
}

/** 随机微调：挪一个端点，或者重新随机机制 */
function mutate(plan: Plan, geo: BoardGeo, lv: LevelData, rnd: () => number): LevelData {
  const ropes = lv.ropes.map((r) => [...r] as [number, number, number]);
  if (rnd() < 0.75) {
    const used = new Set(ropes.flatMap(([, a, b]) => [a, b]));
    for (const [h] of lv.locks ?? []) used.add(h);
    const empty = holesOf(geo).filter((h) => !used.has(h));
    const r = Math.floor(rnd() * ropes.length);
    const end = rnd() < 0.5 ? 1 : 2;
    const h = empty[Math.floor(rnd() * empty.length)];
    const other = geo.pos(ropes[r][3 - end]);
    const p = geo.pos(h);
    const len = Math.hypot(p.x - other.x, p.y - other.y);
    if (len >= 1.9 && len <= 4.6) ropes[r][end] = h;
    return { ...lv, ropes };
  }
  return { ...lv, ...decorate(plan, geo, ropes.map(([, a, b]) => [a, b]), rnd) };
}

function generate(plan: Plan, seed: number): LevelData {
  const mask = MASKS[plan.mask];
  const geo = new BoardGeo(mask[0].length, mask.length, mask);
  const rnd = makeRng(seed);
  const t0 = Date.now();
  // 1) 随机出若干初始布局，取最难的
  let cur: { lv: LevelData; par: number } | null = null;
  for (let attempt = 0; attempt < 300 && Date.now() - t0 < 15000; attempt++) {
    const ropes = randomLayout(geo, mask, plan.ropes, rnd);
    if (!ropes) continue;
    const colors = shuffle([...Array(COLOR_COUNT).keys()], rnd);
    const lv: LevelData = {
      cols: geo.cols,
      rows: geo.rows,
      mask,
      ropes: ropes.map(([a, b], i) => [colors[i % COLOR_COUNT], a, b]),
      steps: 0,
      par: 0,
      ...decorate(plan, geo, ropes, rnd),
    };
    const par = quickPar(lv, geo);
    if (par > 0 && par <= plan.maxPar && (!cur || par > cur.par)) cur = { lv, par };
    if (cur && cur.par >= plan.minPar) break;
  }
  if (!cur) throw new Error(`无法生成关卡 ${JSON.stringify(plan)}`);
  // 2) 爬山：参考步数不降就接受，直到达到目标上限
  for (let it = 0; it < 3000 && cur.par < plan.maxPar && Date.now() - t0 < 50000; it++) {
    const lv = mutate(plan, geo, cur.lv, rnd);
    if (!allTangled(lv, geo)) continue;
    const par = quickPar(lv, geo);
    if (par >= cur.par && par <= plan.maxPar) cur = { lv, par };
  }
  // 3) 宽束复核（宽束可能找到更短的解，以它为准）
  const par = Math.min(cur.par, solve(makeRules(cur.lv, geo), cur.lv.ropes.flatMap(([, a, b]) => [a, b]), 600, 30));
  return { ...cur.lv, par, steps: par + plan.slack };
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

const only = process.argv[2] ? Number(process.argv[2]) : -1;
const levels: LevelData[] = [tutorial];
PLANS.forEach((plan, i) => {
  if (only >= 0 && only !== i + 2) return;
  const t = Date.now();
  const lv = generate(plan, 2024 + i * 7919);
  levels.push(lv);
  const mech = [lv.fixed && `缝住${lv.fixed.length}`, lv.sleepers && `小猫${lv.sleepers.length}`, lv.locks && `锁${lv.locks.length}`].filter(Boolean).join(' ');
  console.log(`关卡 ${i + 2}: ${plan.mask} 毛线×${plan.ropes} ${mech} 参考${lv.par}步(目标${plan.minPar}-${plan.maxPar}) 给${lv.steps}步 (${((Date.now() - t) / 1000).toFixed(1)}s)`);
});

if (only < 0) {
  writeFileSync('src/levels/levels.json', JSON.stringify(levels) + '\n');
  console.log(`共 ${levels.length} 关已写入 src/levels/levels.json`);
}
