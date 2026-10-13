import { BoardGeo, LevelData } from './board';
import { canLift, canPlace, legalMoves, makeRules, Rules, settle, sleepLeft, tangleCounts } from './rules';

export { BoardGeo } from './board';
export type { LevelData } from './board';

export interface Rope {
  id: number;
  color: number;
  a: number;
  b: number;
  /** 叠放层级，越大越靠上 */
  z: number;
  alive: boolean;
}

export type RopeEnd = 'a' | 'b';

const endIndex = (rope: number, end: RopeEnd) => rope * 2 + (end === 'a' ? 0 : 1);

export class Puzzle {
  readonly geo: BoardGeo;
  readonly rules: Rules;
  readonly ropes: Rope[];
  stepsLeft: number;
  private zCounter: number;

  constructor(readonly level: LevelData) {
    this.geo = new BoardGeo(level.cols, level.rows, level.mask);
    this.rules = makeRules(level, this.geo);
    this.ropes = level.ropes.map(([color, a, b], i) => ({ id: i, color, a, b, z: i, alive: true }));
    this.zCounter = this.ropes.length;
    this.stepsLeft = level.steps;
  }

  /** 规则层使用的紧凑状态 */
  get pos(): number[] {
    const out: number[] = [];
    for (const r of this.ropes) out.push(r.alive ? r.a : -1, r.alive ? r.b : -1);
    return out;
  }

  get aliveRopes(): Rope[] {
    return this.ropes.filter((r) => r.alive);
  }

  get isWon(): boolean {
    return this.aliveRopes.length === 0;
  }

  /** 没有任何纽扣能挪动（被缝住 / 小猫在睡 / 没有空孔） */
  get isStuck(): boolean {
    return !this.isWon && legalMoves(this.rules, this.pos).length === 0;
  }

  get isLost(): boolean {
    return !this.isWon && (this.stepsLeft <= 0 || this.isStuck);
  }

  isFreeHole(hole: number): boolean {
    return canPlace(this.rules, this.pos, hole);
  }

  isFixed(rope: number, end: RopeEnd): boolean {
    return this.rules.fixed[endIndex(rope, end)];
  }

  /** 这根毛线上的小猫还要等几根毛线理顺才醒，0 表示醒着或没有小猫 */
  sleepLeft(rope: number): number {
    return sleepLeft(this.rules, this.pos, rope);
  }

  /** 当前仍锁着的孔：[孔位, 钥匙毛线] */
  activeLocks(): [number, number][] {
    const pos = this.pos;
    const out: [number, number][] = [];
    this.rules.lockKey.forEach((key, h) => {
      if (key >= 0 && pos[key * 2] >= 0) out.push([h, key]);
    });
    return out;
  }

  canLift(rope: number, end: RopeEnd): boolean {
    return canLift(this.rules, this.pos, endIndex(rope, end));
  }

  /** 当前每根活着的毛线与几根毛线缠绕 */
  tangleCounts(): Map<number, number> {
    const { counts } = tangleCounts(this.rules, this.pos);
    const m = new Map<number, number>();
    counts.forEach((c, i) => c >= 0 && m.set(i, c));
    return m;
  }

  /** 预览：把某根毛线的一端挪到 hole 后，会被理顺消除的毛线 */
  previewCleared(ropeId: number, end: RopeEnd, hole: number): number[] {
    const pos = this.pos;
    pos[endIndex(ropeId, end)] = hole;
    return settle(this.rules, pos).cleared;
  }

  canMove(ropeId: number, end: RopeEnd, hole: number): boolean {
    const r = this.ropes[ropeId];
    return !!r && r.alive && this.stepsLeft > 0 && this.canLift(ropeId, end) && this.isFreeHole(hole);
  }

  /** 挪动一端，消耗一步；返回被理顺消除的毛线 id */
  move(ropeId: number, end: RopeEnd, hole: number): number[] {
    if (!this.canMove(ropeId, end, hole)) return [];
    const r = this.ropes[ropeId];
    r[end] = hole;
    r.z = ++this.zCounter;
    this.stepsLeft--;
    return this.clearUntangled();
  }

  /** 剪刀道具：直接剪掉一根毛线（不耗步数），随之松开的毛线也一起消除 */
  cut(ropeId: number): number[] {
    const r = this.ropes[ropeId];
    if (!r || !r.alive) return [];
    r.alive = false;
    return [ropeId, ...this.clearUntangled()];
  }

  addSteps(n: number): void {
    this.stepsLeft += n;
  }

  private clearUntangled(): number[] {
    const { cleared } = settle(this.rules, this.pos);
    for (const id of cleared) this.ropes[id].alive = false;
    return cleared;
  }
}
