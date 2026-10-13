import { createSynth, AudioCtxLike } from './synth';
import { Platform, ScreenInfo, Surface, TouchHandlers } from './types';

/** 浏览器实现（也用于 iOS WebView 打包） */
export function createWebPlatform(canvas: HTMLCanvasElement): Platform {
  const ctx = canvas.getContext('2d')!;
  const resizeCbs: (() => void)[] = [];
  let audio: AudioCtxLike | null = null;

  const safeProbe = document.createElement('div');
  safeProbe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(safeProbe);

  function info(): ScreenInfo {
    const cs = getComputedStyle(safeProbe);
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 3),
      safeTop: parseFloat(cs.paddingTop) || 0,
      safeBottom: parseFloat(cs.paddingBottom) || 0,
    };
  }

  function fit() {
    const s = info();
    canvas.style.width = s.width + 'px';
    canvas.style.height = s.height + 'px';
    canvas.width = Math.round(s.width * s.dpr);
    canvas.height = Math.round(s.height * s.dpr);
  }
  fit();
  window.addEventListener('resize', () => {
    fit();
    resizeCbs.forEach((cb) => cb());
  });

  function ensureAudio() {
    if (audio) return;
    const AC = (window as unknown as { AudioContext?: new () => AudioCtxLike; webkitAudioContext?: new () => AudioCtxLike });
    const Ctor = AC.AudioContext || AC.webkitAudioContext;
    if (Ctor) audio = new Ctor();
  }

  return {
    name: 'web',
    screen: { canvas, ctx },
    getScreenInfo: info,
    onResize: (cb) => resizeCbs.push(cb),
    onTouch(h: TouchHandlers) {
      let active: number | null = null;
      const pt = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top] as const;
      };
      canvas.addEventListener('pointerdown', (e) => {
        if (active !== null) return;
        ensureAudio();
        active = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
        h.start(...pt(e));
      });
      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerId === active) h.move(...pt(e));
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== active) return;
        active = null;
        h.end(...pt(e));
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
    },
    requestFrame: (cb) => window.requestAnimationFrame(cb),
    now: () => performance.now(),
    createOffscreen(width: number, height: number): Surface {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      return { canvas: c, ctx: c.getContext('2d')! };
    },
    storageGet(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    storageSet(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 隐私模式等情况下忽略
      }
    },
    vibrate(strong) {
      try {
        navigator.vibrate?.(strong ? 30 : 12);
      } catch {
        // 不支持震动
      }
    },
    sfx: createSynth(() => audio),
    showRewardedAd: () => new Promise((resolve) => setTimeout(() => resolve(true), 900)),
  };
}
