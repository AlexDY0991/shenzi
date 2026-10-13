import { LevelData } from '../core/puzzle';
import levelsJson from '../levels/levels.json';

export const LEVELS = levelsJson as unknown as LevelData[];

/** 演示版：关卡选择里全部关卡可选，方便试玩 */
export const DEMO_UNLOCK_ALL = true;
