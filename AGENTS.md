# AGENTS.md

彩票历史数据统计与娱乐工具站（超级大乐透 / 双色球）。Next.js App Router + React + TypeScript + Tailwind 4 + ECharts 6，纯静态输出，部署在 Vercel。

## 目录

```
data/dlt.json, ssq.json   开奖数据（仓库内即数据源，按日期升序，紧凑 JSON 各约 200KB）
scripts/fetch-data.mjs    官方接口抓取（增量/全量，无第三方依赖）
scripts/fit-coverage.mjs  覆盖优化参数拟合与验证（npm run fit → .verify/fit-report.json）
scripts/check-freshness.mjs 数据新鲜度看门狗（CI 用，漏抓则 exit 1）
scripts/sync-data.cmd     Windows 计划任务调用的「抓取→提交→pull/push」流程
src/app/                  路由页面（/ /dlt /ssq /generator /predict /about）
src/components/           交互组件，全部 "use client"（CoveragePanel 为覆盖优化实测面板）
src/lib/                  games.ts 彩种配置 / data.ts 数据读取 / stats.ts 统计基础 / generate.ts 生成器 /
                          predict.ts 六种策略与回测 / coverage.ts 覆盖优化选号 / prize.ts 奖级表 / stat.ts 配对统计
```

页面（`src/app/**/page.tsx`）是服务端组件，**只在构建期**通过 `src/lib/data.ts` 的 `loadGame()` 读 `data/*.json`（模块级缓存）；所有交互与图表在 `src/components/` 的客户端组件里。没有任何 API route、运行时数据请求或数据库。**数据更新后必须提交并推送 `data/*.json` 才会触发 Vercel 重新部署**，否则线上仍是旧数据。

## 常用命令

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # 主要验证手段
npm run start
npm run fetch          # 增量抓取；追加 -- --full / -- --only dlt|ssq
npm run fit            # 覆盖优化参数拟合与验证；-- --tickets N / -- --game dlt|ssq
npx tsc --noEmit       # 类型检查（无 lint 脚本、无测试框架，二者都未配置）
```

改动 UI 后的浏览器实测：`.harness-check/browser.mjs`（无头 Chrome + CDP，需先起 dev server，脚本内硬编码了 Chrome 路径，产物为 `shots/*.png` + `report.txt`）。该目录被 gitignore，属本地工具，不进提交。

## 数据链路（改动前务必读）

- 两个彩种的**开奖星期与开奖时刻在 4 处各有副本**，改一处就必须同步：`src/lib/games.ts`（`GAMES`）、`scripts/fetch-data.mjs`（`GAMES`）、`scripts/check-freshness.mjs`（`GAMES`）、README。三处脚本/配置里有注释互相提示保持同步。
- 期号格式两彩种**故意不同**，勿「统一」：大乐透用官方短格式 `26105`，双色球用 `2026107`。不要再做补零/截断。
- 时间一律北京时间。`check-freshness.mjs` 用 `Date.now() + 8h` 配合 `getUTC*` 读取墙上时间，勿改成依赖本机时区。
- 官方接口屏蔽机房 IP（体彩 HTTP 567 / 福彩 403），**CI 内抓取必然失败**，`update-data.yml` 里的 `npm run fetch || echo "::warning::..."` 是刻意保留的兜底；真实抓取由本地 Windows 计划任务 `LotteryDataSync` 完成（`scripts/setup-sync-task.ps1` 注册，日志 `%USERPROFILE%\lottery-sync.log`）。不要为了「让 CI 变绿」而删除该容错或改成硬失败。
- `data/*.json` 平时由 bot / 计划任务提交（`chore(data): ...`），改代码时不要顺手改数据文件。
- 仓库路径含中文：`sync-data.cmd` 保持纯 ASCII 并用 `%~dp0..` 推根目录，`setup-sync-task.ps1` 里是硬编码路径——改动时注意非 ASCII 与 CRLF/编码问题。

## 覆盖优化（cover）方案的约束

六个策略里只有「覆盖优化」对机选有**真实**优势，因此它的表述边界最容易写错：

- 它提高的是**同价位多注的覆盖率**（至少中得某奖级 / 至少命中 k 个号），**不是单注命中率**。页面、徽章、README 一律不能写成「命中率更高 / 更准 / 能提高中奖概率」。
- 单注平均命中（`avgHits`）与机选、与理论期望**必须保持无显著差异**，这是诚实性基准：`npm run fit` 输出的「单注平均命中」一行会检验它，`predict.ts` 的 `compareCoverage` 会把结果画在面板上。若这里变成显著差异，说明回测口径被改坏了。
- 参数 `COVERAGE_PARAMS`（`src/lib/coverage.ts`）由 `npm run fit` 拟合得出，结论是「热/冷/遗漏权重无显著作用，铺开强度取最大」。改参数要重跑拟合、并把验证段结果写回注释，不要凭手感调。
- 覆盖率口径（全量 walk-forward + 共同随机数配对 + 95% CI）在 `scripts/fit-coverage.mjs`（训练/验证切分、用于选参）与 `predict.ts` 的 `compareCoverage`（页面实测）两处实现，统计工具统一取自 `src/lib/stat.ts`——不要另写第三套口径。
- 注数为 1 时无铺开空间，与机选逐期完全相同；`CoveragePanel` 会明确提示这一点。

## 编码约定

- 用户可见文案与代码注释都用中文，`<html lang="zh-CN">`。
- 导入一律用 `@/*` 别名（`@/lib/games`、`@/components/Ball`）。
- 号码/走势的通用统计（频率、遗漏、奇偶比、大小比、连号、和值、`mulberry32` 种子随机）统一放 `src/lib/stats.ts`，新算法复用而不是另写一份。
- ECharts 走按需注册：图表类型与组件必须在 `src/components/EChart.tsx` 的 `echarts.use([...])` 里注册，否则新图表**静默不渲染**。图表统一通过 `<EChart option={...} />` 使用，不自建 `echarts.init`。
- 样式用 Tailwind 4（`@tailwindcss/postcss`），自定义类 `.ball/.ball-red/.ball-blue/.card` 与暗色底在 `src/app/globals.css`，页面里优先复用。
- 站点根域名取 `process.env.SITE_URL`，回退 `https://lottery-predict.com`（见 `sitemap.ts` / `robots.ts` 与 `.env.example`）。

## 已知坑

- **无头浏览器必须访问 `http://localhost:3000`，不要用 `127.0.0.1:3000`。** Next 16 dev 会拦截来自 `127.0.0.1` 的 `/_next` 资源（日志里是 `Blocked cross-origin request to Next.js dev resource /_next/hmr`），结果是页面文本照常渲染、但 **hydration 不执行**：所有按钮点击静默失效且控制台无报错，极易误判成自己改坏了组件。（`.harness-check/browser.mjs` 与 `.verify/check-cover.mjs` 都已按此设置。）
- `src/lib/coverage.ts`、`prize.ts`、`stat.ts` 必须保持**只有 `import type`（编译期擦除）、没有运行时 import**：`scripts/fit-coverage.mjs` 靠 Node 的类型擦除直接 import 这几个 `.ts` 文件，新增运行时 import 会让 `npm run fit` 直接崩。（`games.ts`、`stats.ts` 只被 `import type` 引用，因此脚本也能加载。）
- 覆盖优化选号在 `spread` 极大时，已被本批用过的号码抽样键会下溢为 0（这是「尽量不重号」的实现方式）；`pickCoverTicket` 额外加了一个 `r * 1e-9` 的极小项，只为在「全批号码都用完、只能重复」时打破 0 与 0 的并列——去掉它会让 8 注的最后几注退化成完全相同的低号码注（白费注数）。
- ECharts `tooltip.trigger: "axis"` 时 formatter 收到的是**参数数组**，必须 `ps[0]` 再取值，否则显示 `undefined`（`StatsPanel` 曾因此出错，正确写法见 `PredictView.tsx` / `CoveragePanel.tsx`）。
- 生成器在条件过紧时会无解，需走「行数 0 + 黄色提示」路径，不得死循环（`.harness-check/report.txt` 覆盖了 `sumMax=20` 边界）。
- `.zcode/`、`.verify/`、`.harness-check/` 均在 gitignore 内，属本地工具产物。

## 合规红线（不要越界）

本项目定位是免费的历史数据统计与娱乐工具，页面与 README 的免责声明（开奖为独立随机事件、无法预测、理性购彩、未满 18 周岁禁止购彩）**必须保留且清晰可见**。禁止新增任何付费预测/代购/投注渠道，禁止把统计「评分」表述为可提高中奖概率的预测能力——`predict.ts` 的策略与回测明确以随机基准为参照，改动算法时保持这一基调。「覆盖优化」是唯一有真实增益的方案，其表述边界见上文「覆盖优化（cover）方案的约束」。
