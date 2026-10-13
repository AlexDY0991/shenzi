import { Platform } from '../platform/types';

export interface SaveData {
  /** 已解锁的最高关卡序号（从 0 开始） */
  unlocked: number;
  /** 每关最好成绩的星数 */
  stars: number[];
  /** 道具库存 */
  scissors: number;
  steps: number;
  sound: boolean;
}

const KEY = 'yarn-cat-save-v1';

const DEFAULT: SaveData = { unlocked: 0, stars: [], scissors: 3, steps: 3, sound: true };

export function loadSave(p: Platform): SaveData {
  try {
    const raw = p.storageGet(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    // 存档损坏时重置
  }
  return { ...DEFAULT, stars: [] };
}

export function writeSave(p: Platform, s: SaveData): void {
  p.storageSet(KEY, JSON.stringify(s));
}
