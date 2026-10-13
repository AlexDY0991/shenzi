// 构建：网页版（单文件 HTML，内联 JS）+ 微信小游戏工程
import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const common = { bundle: true, format: 'iife', target: 'es2017', minify: !watch, legalComments: 'none', logLevel: 'info' };

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

if (watch) {
  const [w, x] = await Promise.all([esbuild.context(webOpts), esbuild.context(wxOpts)]);
  await Promise.all([w.watch(), x.watch()]);
  console.log('watching… 打开 dist/web/index.html 预览');
} else {
  await Promise.all([esbuild.build(webOpts), esbuild.build(wxOpts)]);
  // 微信小游戏包里不能出现浏览器专属全局对象
  const wx = readFileSync('dist/wechat/game.js', 'utf8');
  const banned = ['document.', 'window.', 'localStorage', 'navigator.', 'Path2D', '.roundRect(', '.ellipse('].filter((k) => wx.includes(k));
  if (banned.length) {
    console.error('微信包中出现了不兼容的 API：', banned.join(', '));
    process.exit(1);
  }
  console.log(`微信包 ${(wx.length / 1024).toFixed(1)} KB，兼容性检查通过`);
}
