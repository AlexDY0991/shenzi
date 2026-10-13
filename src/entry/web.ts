import { App } from '../game/app';
import { createWebPlatform } from '../platform/web';

const canvas = document.getElementById('game') as HTMLCanvasElement;
new App(createWebPlatform(canvas));

// 防止浏览器 / 微信内置浏览器拿缓存里的旧版本：读取线上最新版本号，不一致就带上新版本号重新打开
// （claude.ai 试玩页等没有 version.json 的地方会直接失败，忽略即可）
fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then((v: { build?: string } | null) => {
    if (!v || !v.build || v.build === __BUILD__) return;
    const url = new URL(location.href);
    if (url.searchParams.get('v') === v.build) return; // 已经尝试过，避免循环刷新
    url.searchParams.set('v', v.build);
    location.replace(url.toString());
  })
  .catch(() => undefined);
