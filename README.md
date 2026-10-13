# 喵喵理毛线

解绳子类益智小游戏（猫咪毛线球主题）。拖动毛线两端的纽扣换到空孔里，一根毛线不再和任何毛线交叉、也不压在别人的纽扣上，就会被理顺，卷成毛线球收进猫咪的篮子。在步数用完前理顺全部毛线即过关。

美术全部由代码绘制，没有图片和音频资源，音效实时合成。

## 常用命令

```bash
npm install
npm run build      # 构建网页版 + 微信小游戏工程
npm run dev        # 监听模式
npm test           # 核心逻辑测试（含"所有关卡可解"校验）
npm run typecheck
npm run levels     # 重新生成关卡（约 40 秒）
```

构建产物：

| 路径 | 用途 |
|---|---|
| `dist/web/index.html` | 网页版，单文件，浏览器直接打开 |
| `dist/wechat/` | 微信小游戏工程，用微信开发者工具"导入项目"打开 |
| `dist/artifact/yarn-cat.html` | 发布到 claude.ai 的试玩页 |

## 目录结构

```
src/
  core/        纯逻辑，不依赖任何平台：几何判定、关卡状态、求解器、随机数
  render/      Canvas 2D 绘制：毛线、纽扣、棋盘、猫、篮子、UI 控件
  game/        场景与交互：标题页、关卡页、存档
  platform/    平台适配层：web.ts（浏览器 / iOS WebView）、wechat.ts（微信小游戏）
  entry/       各平台入口
  levels/      关卡数据（由 tools/gen-levels.ts 生成）
tools/         构建脚本、关卡生成器
wechat/        微信小游戏配置模板
```

## 跨平台约定

- 游戏代码只通过 `src/platform/types.ts` 里的 `Platform` 接口访问平台能力（画布、触摸、存储、震动、音频、广告）。
- `core/`、`render/`、`game/` 里禁止直接使用 `window`、`document`、`localStorage`、`navigator`。
- 绘制时不用 `Path2D`、`ctx.roundRect`、`ctx.ellipse`（微信小游戏支持不稳定），圆角和椭圆用 `render/shapes.ts` 里的实现。
- `npm run build` 会检查微信包里是否出现上述 API，出现则构建失败。

## 关卡生成

`tools/gen-levels.ts` 随机摆放毛线，要求每根开局都缠着，再用束搜索求解器（`src/core/solver.ts`）算出参考步数，按难度区间挑选。给玩家的步数 = 参考步数 + 余量。过关星级按实际步数与参考步数比较。

## 上微信前还要做的

- 在 `wechat/project.config.json` 填入真实 AppID。
- 在 `src/platform/wechat.ts` 填激励视频广告位 ID（未填时道具直接发放）。
- 在微信开发者工具和真机上实测（目前只在浏览器里模拟 `wx` 环境验证过）。
- 把 `src/game/levels.ts` 里的 `DEMO_UNLOCK_ALL` 改为 `false`，恢复逐关解锁。
