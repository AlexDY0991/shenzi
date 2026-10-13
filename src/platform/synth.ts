import { Sfx } from './types';

// 最小化的 WebAudio 子集：浏览器 AudioContext 与微信 wx.createWebAudioContext() 都支持
interface AudioParamLike {
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
  exponentialRampToValueAtTime(v: number, t: number): void;
}
interface NodeLike {
  connect(n: unknown): void;
}
interface OscLike extends NodeLike {
  type: string;
  frequency: AudioParamLike;
  start(t: number): void;
  stop(t: number): void;
}
interface GainLike extends NodeLike {
  gain: AudioParamLike;
}
export interface AudioCtxLike {
  currentTime: number;
  destination: unknown;
  state?: string;
  resume?: () => unknown;
  createOscillator(): OscLike;
  createGain(): GainLike;
}

export type Note = { f: number; f2?: number; at: number; dur: number; type?: string; vol?: number };

const SOUNDS: Record<Parameters<Sfx['play']>[0], Note[]> = {
  pick: [{ f: 520, f2: 820, at: 0, dur: 0.09, type: 'sine', vol: 0.25 }],
  drop: [{ f: 420, f2: 260, at: 0, dur: 0.1, type: 'triangle', vol: 0.3 }],
  tap: [{ f: 900, at: 0, dur: 0.04, type: 'sine', vol: 0.15 }],
  snip: [
    { f: 1800, f2: 900, at: 0, dur: 0.05, type: 'square', vol: 0.06 },
    { f: 1600, f2: 700, at: 0.07, dur: 0.05, type: 'square', vol: 0.06 },
  ],
  clear: [
    { f: 784, at: 0, dur: 0.18, type: 'triangle', vol: 0.22 },
    { f: 1047, at: 0.07, dur: 0.22, type: 'triangle', vol: 0.2 },
  ],
  win: [
    { f: 523, at: 0, dur: 0.18, type: 'triangle', vol: 0.25 },
    { f: 659, at: 0.12, dur: 0.18, type: 'triangle', vol: 0.25 },
    { f: 784, at: 0.24, dur: 0.18, type: 'triangle', vol: 0.25 },
    { f: 1047, at: 0.36, dur: 0.4, type: 'triangle', vol: 0.25 },
  ],
  lose: [
    { f: 392, at: 0, dur: 0.22, type: 'sine', vol: 0.25 },
    { f: 330, at: 0.18, dur: 0.22, type: 'sine', vol: 0.25 },
    { f: 262, at: 0.36, dur: 0.4, type: 'sine', vol: 0.25 },
  ],
};

export function createSynth(getCtx: () => AudioCtxLike | null): Sfx {
  const sfx: Sfx = {
    enabled: true,
    play(name) {
      sfx.tone(SOUNDS[name]);
    },
    tone(notes) {
      if (!sfx.enabled) return;
      const ac = getCtx();
      if (!ac) return;
      try {
        if (ac.state === 'suspended' && ac.resume) ac.resume();
        const t0 = ac.currentTime + 0.01;
        for (const n of notes) {
          const osc = ac.createOscillator();
          const g = ac.createGain();
          osc.type = n.type ?? 'sine';
          const t = t0 + n.at;
          osc.frequency.setValueAtTime(n.f, t);
          if (n.f2) osc.frequency.exponentialRampToValueAtTime(n.f2, t + n.dur);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(n.vol ?? 0.2, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
          osc.connect(g);
          g.connect(ac.destination);
          osc.start(t);
          osc.stop(t + n.dur + 0.02);
        }
      } catch {
        // 音频失败不影响游戏
      }
    },
  };
  return sfx;
}
