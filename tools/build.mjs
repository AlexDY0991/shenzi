// 构建：网页版（单文件 HTML，内联 JS）+ 微信小游戏工程
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { execSync } from 'node:child_process';

const watch = process.argv.includes('--watch');

// 版本号：北京时间构建时间 + 提交号，显示在标题页和展示页底部
function buildStamp() {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // 不在 git 仓库里
  }
  const t = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  return `${t.slice(5, 10)} ${t.slice(11, 16)} · ${sha}`;
}

const STAMP = buildStamp();

const common = {
  bundle: true,
  format: 'iife',
  target: 'es2017',
  minify: !watch,
  legalComments: 'none',
  logLevel: 'info',
  define: { __BUILD__: JSON.stringify(STAMP) },
};

function writeWebHtml() {
  const js = readFileSync('dist/web/main.js', 'utf8').replace(/<\/script/g, '<\\/script');
  const html = readFileSync('web/index.html', 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
  writeFileSync('dist/web/index.html', html);
  // 发布为 claude.ai Artifact 用的单文件页面（平台会自动补 doctype/head/body）
  const art = readFileSync('web/artifact.html', 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
  mkdirSync('dist/artifact', { recursive: true });
  writeFileSync('dist/artifact/yarn-cat.html', art);
}

mkdirSync('dist/web', { recursive: true });
mkdirSync('dist/wechat', { recursive: true });
copyFileSync('wechat/game.json', 'dist/wechat/game.json');
copyFileSync('wechat/project.config.json', 'dist/wechat/project.config.json');

const webOpts = {
  ...common,
  entryPoints: ['src/entry/web.ts'],
  outfile: 'dist/web/main.js',
  plugins: [{ name: 'inline-html', setup: (b) => b.onEnd((r) => r.errors.length || writeWebHtml()) }],
};
const wxOpts = { ...common, entryPoints: ['src/entry/wechat.ts'], outfile: 'dist/wechat/game.js' };

// GitHub Pages 站点：展示页 + 全屏试玩页
const siteOpts = {
  ...common,
  entryPoints: ['site/landing.ts'],
  outfile: 'dist/site/landing.js',
  plugins: [
    {
      name: 'site-html',
      setup: (b) =>
        b.onEnd((r) => {
          if (r.errors.length) return;
          const js = readFileSync('dist/site/landing.js', 'utf8').replace(/<\/script/g, '<\\/script');
          const html = readFileSync('site/index.html', 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
          writeFileSync('dist/site/index.html', html);
          copyFileSync('dist/web/index.html', 'dist/site/play.html');
          // 试玩页启动时读取它，发现自己是旧版就自动刷新
          writeFileSync('dist/site/version.json', JSON.stringify({ build: STAMP }) + '\n');
        }),
    },
  ],
};
mkdirSync('dist/site', { recursive: true });

// 3D 样张（Three.js），单独一个页面：dist/site/proto3d.html
const protoOpts = {
  ...common,
  entryPoints: ['proto3d/main.ts'],
  outfile: 'dist/proto3d/main.js',
  plugins: [
    {
      name: 'proto-html',
      setup: (b) =>
        b.onEnd((r) => {
          if (r.errors.length) return;
          const js = readFileSync('dist/proto3d/main.js', 'utf8').replace(/<\/script/g, '<\\/script');
          const html = readFileSync('proto3d/index.html', 'utf8').replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
          mkdirSync('dist/site', { recursive: true });
          writeFileSync('dist/site/proto3d.html', html);
        }),
    },
  ],
};

// 新玩法样张（Canvas 2D）：dist/site/<name>.html
const GAMES2D = [
  { name: 'catjam', title: '猫咪排队出门 · 样张' },
  { name: 'knit', title: '拆毛衣 · 样张' },
];
const games2dOpts = GAMES2D.map((g) => ({
  ...common,
  entryPoints: [`proto2d/${g.name}/main.ts`],
  outfile: `dist/proto2d/${g.name}.js`,
  plugins: [
    {
      name: `${g.name}-html`,
      setup: (b) =>
        b.onEnd((r) => {
          if (r.errors.length) return;
          const js = readFileSync(`dist/proto2d/${g.name}.js`, 'utf8').replace(/<\/script/g, '<\\/script');
          const html = readFileSync('proto2d/index.html', 'utf8')
            .replace('/*TITLE*/', g.title)
            .replace('<script>/*BUNDLE*/</script>', () => `<script>${js}</script>`);
          mkdirSync('dist/site', { recursive: true });
          writeFileSync(`dist/site/${g.name}.html`, html);
        }),
    },
  ],
}));

if (watch) {
  const [w, x] = await Promise.all([esbuild.context(webOpts), esbuild.context(wxOpts)]);
  await Promise.all([w.watch(), x.watch()]);
  const site = await esbuild.context(siteOpts);
  await site.watch();
  const proto = await esbuild.context(protoOpts);
  await proto.watch();
  for (const o of games2dOpts) await (await esbuild.context(o)).watch();
  console.log('watching… 打开 dist/web/index.html 预览');
} else {
  await Promise.all([esbuild.build(webOpts), esbuild.build(wxOpts)]);
  await esbuild.build(siteOpts);
  await esbuild.build(protoOpts);
  await Promise.all(games2dOpts.map((o) => esbuild.build(o)));
  // 微信小游戏包里不能出现浏览器专属全局对象
  const wx = readFileSync('dist/wechat/game.js', 'utf8');
  const banned = ['document.', 'window.', 'localStorage', 'navigator.', 'Path2D', '.roundRect(', '.ellipse('].filter((k) => wx.includes(k));
  if (banned.length) {
    console.error('微信包中出现了不兼容的 API：', banned.join(', '));
    process.exit(1);
  }
  console.log(`微信包 ${(wx.length / 1024).toFixed(1)} KB，兼容性检查通过`);
}
