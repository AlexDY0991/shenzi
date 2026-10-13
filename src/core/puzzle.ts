import { BoardGeo, LevelData } from './board';
import { applyCut, applyMove, canLift, canMoveTo, canPlace, pulledOutFrom, initialState, legalMoves, makeRules, pairBottom, pairTop, Rules, settle, sleepLeft, State, tangleCounts } from './rules';

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
  /** 缠着的毛线对（上层 * 32 + 下层） */
  private over: number[];

  constructor(readonly level: LevelData) {
    this.geo = new BoardGeo(level.holes);
    this.rules = makeRules(level, this.geo);
    this.ropes = level.ropes.map(([color, a, b], i) => ({ id: i, color, a, b, z: i, alive: true }));
    this.zCounter = this.ropes.length;
    this.stepsLeft = level.steps;
    this.over = initialState(this.rules, level).over;
  }

  get state(): State {
    return { pos: this.pos, over: this.over };
  }

  /** 当前缠着的毛线对 */
  tangledPairs(): { top: number; bottom: number }[] {
    return this.over.map((c) => ({ top: pairTop(c), bottom: pairBottom(c) }));
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
    return !this.isWon && legalMoves(this.rules, this.state).length === 0;
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
    const counts = tangleCounts(this.rules, this.state);
    const m = new Map<number, number>();
    counts.forEach((c, i) => c >= 0 && m.set(i, c));
    return m;
  }

  /** 预览：把某根毛线的一端挪到 hole 后，会被理顺消除的毛线 */
  previewCleared(ropeId: number, end: RopeEnd, hole: number): number[] {
    return settle(this.rules, applyMove(this.rules, this.state, endIndex(ropeId, end), hole)).cleared;
  }

  canMove(ropeId: number, end: RopeEnd, hole: number): boolean {
    const r = this.ropes[ropeId];
    return !!r && r.alive && this.stepsLeft > 0 && canMoveTo(this.rules, this.state, endIndex(ropeId, end), hole);
  }

  /** 挪到 hole 会把它从哪根毛线底下拉出来（不允许）；-1 表示不会 */
  pulledOutFrom(ropeId: number, end: RopeEnd, hole: number): number {
    return pulledOutFrom(this.rules, this.state, endIndex(ropeId, end), hole);
  }

  /** 挪动一端，消耗一步；返回被理顺消除的毛线 id */
  move(ropeId: number, end: RopeEnd, hole: number): number[] {
    if (!this.canMove(ropeId, end, hole)) return [];
    const r = this.ropes[ropeId];
    this.over = applyMove(this.rules, this.state, endIndex(ropeId, end), hole).over;
    r[end] = hole;
    r.z = ++this.zCounter;
    this.stepsLeft--;
    return this.clearUntangled();
  }

  /** 剪刀道具：直接剪掉一根毛线（不耗步数），随之松开的毛线也一起消除 */
  cut(ropeId: number): number[] {
    const r = this.ropes[ropeId];
    if (!r || !r.alive) return [];
    this.over = applyCut(this.state, ropeId).over;
    r.alive = false;
    return [ropeId, ...this.clearUntangled()];
  }

  addSteps(n: number): void {
    this.stepsLeft += n;
  }

  private clearUntangled(): number[] {
    const { cleared } = settle(this.rules, this.state);
    for (const id of cleared) this.ropes[id].alive = false;
    return cleared;
  }
}
