# AGENTS.md

彩票历史数据统计与娱乐工具站（超级大乐透 / 双色球 / 排列五）。Next.js App Router + React + TypeScript + Tailwind 4 + ECharts 6，纯静态输出，部署在 Vercel。

## 目录

```
data/dlt.json, ssq.json   组合型开奖数据（red/blue 数组，按日期升序；各约 200-440KB）
data/p5.json              数字型开奖数据（digits 为 5 位有序数字，允许重复与前导 0）
scripts/fetch-data.mjs    官方接口抓取（增量/全量，无第三方依赖）
scripts/audit-data.mjs    数据体检（npm run audit，只读：结构校验 + 号码频率卡方 + 分期诊断）
scripts/fit-coverage.mjs  覆盖优化参数拟合与验证（npm run fit → .verify/fit-report.json）
scripts/check-freshness.mjs 数据新鲜度看门狗（CI 用，漏抓则 exit 1）
scripts/sync-data.cmd     Windows 计划任务调用的「抓取→提交→pull/push」流程
src/app/                  路由页面（/ /dlt /ssq /p5 /generator /p5/generator /predict /p5/predict /about，
                          另有 not-found.tsx 站点风格 404）
src/components/           交互组件（CoveragePanel 覆盖率面板、GameSwitch 彩种切换、CopyButton 复制、
                          TrendChart/StatsPanel 组合型；Digit* 为排列五数字型组件）
src/lib/                  games.ts 彩种配置 / data.ts 数据读取 / stats.ts 统计基础 / compact.ts 传输编码 /
                          generate.ts 生成器 / predict.ts 三档方案与回测 / coverage.ts 覆盖优化选号 /
                          prize.ts 奖级表 / stat.ts 配对统计
                          digit.ts 排列五类型配置奖级统计 / digit-data.ts 排列五数据读取（含 fs）/
                          digit-predict.ts 排列五三档方案
src/types/                打包器深层导入所需的空模块声明（echarts 副作用模块无 .d.ts）
```

页面（`src/app/**/page.tsx`）是服务端组件，**只在构建期**通过 `src/lib/data.ts` 的 `loadGame()` 读 `data/*.json`（模块级缓存）；所有交互与图表在 `src/components/` 的客户端组件里。没有任何 API route、运行时数据请求或数据库。**数据更新后必须提交并推送 `data/*.json` 才会触发 Vercel 重新部署**，否则线上仍是旧数据。

## 常用命令

```bash
npm install
npm run dev            # http://localhost:3000
npm run build          # 主要验证手段
npm run start
npm run fetch          # 增量抓取；追加 -- --full / -- --only dlt|ssq|p5
npm run audit          # 数据体检（只读）：结构/范围/日期星期 + 号码频率卡方与分期诊断
npm run fit            # 覆盖优化参数拟合与验证；-- --tickets N / -- --game dlt|ssq
npx tsc --noEmit       # 类型检查（无 lint 脚本、无测试框架，二者都未配置）
```

改动 UI 后的浏览器实测：`.harness-check/browser.mjs`（无头 Chrome + CDP，需先起 dev server，脚本内硬编码了 Chrome 路径，产物为 `shots/*.png` + `report.txt`）。该目录被 gitignore，属本地工具，不进提交。

## 数据链路（改动前务必读）

- 各彩种的**开奖星期与开奖时刻在多处各有副本**，改一处必须同步：`src/lib/games.ts`（组合型 `GAMES`）、`src/lib/digit.ts`（`P5_CONFIG`）、`scripts/fetch-data.mjs`（`GAMES`）、`scripts/check-freshness.mjs`（`GAMES`）、README。排列五每日开奖且 20:30 开奖，与前两个彩种不同；`check-freshness.mjs` 已改为按各彩种 `drawTime` 计算开奖时刻（此前写死 21:30）。
- 期号格式两彩种**故意不同**，勿「统一」：大乐透用官方短格式 `26105`，双色球用 `2026107`。不要再做补零/截断。
- 时间一律北京时间。`check-freshness.mjs` 用 `Date.now() + 8h` 配合 `getUTC*` 读取墙上时间，勿改成依赖本机时区。
- 官方接口屏蔽机房 IP（体彩 HTTP 567 / 福彩 403），**CI 内抓取必然失败**，`update-data.yml` 里的 `npm run fetch || echo "::warning::..."` 是刻意保留的兜底；真实抓取由本地 Windows 计划任务 `LotteryDataSync` 完成（`scripts/setup-sync-task.ps1` 注册，日志 `%USERPROFILE%\lottery-sync.log`）。不要为了「让 CI 变绿」而删除该容错或改成硬失败。
- `data/*.json` 平时由 bot / 计划任务提交（`chore(data): ...`），改代码时不要顺手改数据文件。新增彩种时**必须**同步 `scripts/sync-data.cmd` 的 `git add` 列表，否则本地计划任务永远不会把新数据提交上线（该文件历史上只 add dlt/ssq 两个文件）。
- 客户端组件导入的 `src/lib/*` 模块**不能含 `node:fs` 等运行时内置模块导入**：打包器会把它们打进客户端 chunk 并直接构建失败（Turbopack: "the chunking context does not support external modules (request: node:fs)"）。现有拆分：`games.ts`↔`data.ts`、`digit.ts`↔`digit-data.ts`。类型导入用 `import type` 不受影响。
- **大乐透 2007–2013 年前区号码分布显著偏高**（29–35 号出现次数约为期望的 1.3~1.55 倍，卡方 p<0.001；2014 年起恢复均匀，双色球全期均匀）。已与体彩官网接口逐条比对确认**官方历史记录本身如此**，不是本站抓取问题。因此：`npm run audit` 报出该偏离属已知情况，不要当 bug 去「修数据」；统计分析面板在选「全部历史」时会显示 `GAMES.dlt.historyNote` 提示，改这块文案前先重跑 `npm run audit` 复核数字。
- 仓库路径含中文：`sync-data.cmd` 保持纯 ASCII 并用 `%~dp0..` 推根目录，`setup-sync-task.ps1` 里是硬编码路径——改动时注意非 ASCII 与 CRLF/编码问题。
- **`sync-data.cmd` 必须同时满足「纯 ASCII + CRLF 换行」**（`.gitattributes` 已强制 `*.cmd/*.bat/*.ps1 eol=crlf`，用 Write 工具改写后需 `unix2dos` 转换再提交）：cmd 按 GBK 解析文件，**UTF-8 中文注释 + LF 换行**会让多字节序列吞掉换行符、把注释和下一行并成一行，整个脚本静默崩坏——症状是计划任务每天显示运行成功（exit 0）但日志零输出、数据断更（2026-09-16~09-20 断更 4 天即此因）。改完务必手动跑一次 `scripts\sync-data.cmd` 确认日志出现 `sync done`。

## 三档方案的诚实性约束（改选号逻辑前必读）

大乐透/双色球只有三档：`best`（最优＝覆盖优化·最大铺开）、`second`（次优＝覆盖优化·最小饱和铺开）、`random`（纯机选对照）。历史上有过的追热/搏冷/冷热结合/遗漏回归已按需求删除，不要再加回来——拟合结论是这些权重在验证段无显著作用（唯一过 Bonferroni 的一组在验证段差 0.00pp、p=1.000）。

- 覆盖优化提高的是**同价位多注的覆盖率**（至少中得某奖级 / 至少命中 k 个号），**不是单注命中率**。页面、徽章、README 一律不能写成「命中率更高 / 更准 / 能提高中奖概率」。
- 单注平均命中（`avgHits`）与机选、与理论期望**必须保持无显著差异**，这是诚实性基准：`npm run fit` 输出的「单注平均命中」一行会检验它，`compareCoverage` 会把结果画在面板上。若这里变成显著差异，说明回测口径被改坏了。
- 参数由 `npm run fit` 拟合：`COVERAGE_PARAMS`（最优，最大铺开）与 `SECOND_PARAMS`（次优，「覆盖率不显著下降前提下最小铺开」，判据是与最优差距 ≤1SE）。次优**不取排名第二档**——实测 s60 的输出与最优几乎一致（5 注红区不同号 24.7 vs 25.0），该槽位会失去意义。改参数要重跑拟合并把验证段数字写回注释，不要凭手感调。
- 覆盖率口径（全量 walk-forward + 共同随机数配对 + 95% CI）在 `scripts/fit-coverage.mjs`（训练/验证切分、选参）与 `predict.ts` 的 `compareCoverage`（页面实测）两处实现，统计工具统一取自 `src/lib/stat.ts`——不要另写第三套口径。
- 注数为 1 时无铺开空间，与机选逐期完全相同；`CoveragePanel` 会明确提示。

## 数字型玩法（排列五）的约束

排列五与红蓝组合型是**两套并列的模型**，不要试图合并类型：`GAMES` 仍是 `dlt|ssq`，排列五走 `P5_CONFIG` + `DigitDraw`。把 `GAMES` 改成联合类型会让每个读 red/blue 的共享组件都要加类型收窄，而它服务的仍是同两个彩种。

三个会**静默出错**的坑（数字型专用，改动时务必对照）：

- **数字 0 是合法值**：现有组合型代码里大量 `for (n = 1; n <= max; n++)`、`counts.slice(1)`、`n >= 1` 过滤，对排列五会直接丢掉数字 0（不报错，只是永远不出现）。数字型一律用 `0..digitMax` 的闭区间遍历。
- **数字可重复**：`assertSet`（fetch）与 `audit-data.mjs` 的组合型校验会以「存在重复号码」拒绝合法开奖；数字型必须走 `assertDigits` / `digitFrequencyCheck`（允许重复、允许 0，卡方用 df=9 且**不做**不放回尺度修正）。
- **位置有意义**：任何 `sort` 都会毁掉开奖信息（`digits[0]` 是第一位，不是最小值）；前导 0 也不能被 `parseInt` 吃掉（结果串如 `0 5 1 9 8`、紧凑串 `05198`、甚至 `00904`）。

其它约束：

- `digit.ts` 被客户端组件引用，**不能出现 `node:fs` 之类的运行时导入**（否则 Turbopack 报 "the chunking context does not support external modules (request: node:fs)"）；读文件放在 `digit-data.ts`，与组合型 `games.ts` / `data.ts` 的拆分同理。
- 排列五只有一个奖级（5 位全中，1/100000），任意选号概率相同：页面必须写明「三档中奖概率相同」，唯一真实优化是**去重**（机选 5 注出现重复注的概率约 0.01%，折算「每 10 万注期望中奖注数」为 5.000000 vs 4.999900）。实测 7723 期中机选只有约 0.75 期会出现重复注，所以「去重注数」一列两者都显示 5.000 属正常，看解析值那一列。不要给排列五编造「最优/更准」的说法。
- 校验「选号方式不影响命中」的标准误：每注命中位数 SE = sqrt(p·(1−p)/(期数×注数))（5 位时为 0.0035），断言容差要给到 ~5SE（0.018），用 0.002 会把正常抽样波动误判为失败。

## 编码约定

- 用户可见文案与代码注释都用中文，`<html lang="zh-CN">`。
- 导入一律用 `@/*` 别名（`@/lib/games`、`@/components/Ball`）。
- 号码/走势的通用统计（频率、遗漏、奇偶比、大小比、连号、和值、`mulberry32` 种子随机）统一放 `src/lib/stats.ts`，新算法复用而不是另写一份。形态分布类同理已有现成实现：`bigSmallDist` / `spanDist` / `consecStats` / `sumHistogram` / `zoneParts` / `median`（统计面板新增维度直接调用，勿再内联重写）。
- ECharts **动态按需注册**：`EChart.tsx` 在挂载后 `import()` 深层模块（`echarts/lib/chart/bar` 等，导入即自注册），新增图表类型必须把对应深层模块加进 `loadEcharts()` 的 import 列表，否则新图表**静默不渲染**；渲染器不自注册，需显式 `use(renderers.CanvasRenderer)`。**不要改回 `echarts/charts`、`echarts/components` 这类 barrel 导入**（实测会把未用到的 map/geo/boxplot 一并打进 chunk，约 +370KB），也不要改成顶层静态导入（会让默认是走势表的 `/dlt`、`/ssq`、`/p5` 首屏白付数百 KB）。图表统一通过 `<EChart option={...} ariaLabel="..." />` 使用，不自建 `echarts.init`；canvas 对屏幕阅读器不可达，新增图表请一并给 ariaLabel。
- 页面 → 客户端的数据一律经 `src/lib/compact.ts` 编码（`encodeDraws`/`encodeDigits`，客户端对应 `decodeDraws`/`decodeDigits`）：直接把 `Draw[]` 当 props 会把每期键名与括号序列化进 RSC payload（排列五页面曾达 456KB，现为 174KB）。新增数据页面请沿用；解码放在客户端组件顶层 `useMemo`，子组件 props 保持不变。只有「构建期算好的聚合结果」（如 p5 生成器的按位频率 5×10 计数）才直接传小对象。
- 预测页（`/predict`、`/p5/predict`）的初始参数（大乐透或 p5 + best + 5 注 + seed=1）由 `page.tsx` 在构建期预计算、作为 props 传入，水合时不再跑全量回测；改初始参数或页面默认值时，`page.tsx` 的预计算与组件里的 `isInitialParams` 判据必须同步，否则会退回水合即全量计算。
- 样式用 Tailwind 4（`@tailwindcss/postcss`），自定义类 `.ball/.ball-red/.ball-blue/.card` 与暗色底在 `src/app/globals.css`，页面里优先复用。
- 站点根域名取 `process.env.SITE_URL`，回退 `https://lottery-predict.com`（见 `sitemap.ts` / `robots.ts` 与 `.env.example`）。

## 已知坑

- **无头浏览器必须访问 `http://localhost:3000`，不要用 `127.0.0.1:3000`。** Next 16 dev 会拦截来自 `127.0.0.1` 的 `/_next` 资源（日志里是 `Blocked cross-origin request to Next.js dev resource /_next/hmr`），结果是页面文本照常渲染、但 **hydration 不执行**：所有按钮点击静默失效且控制台无报错，极易误判成自己改坏了组件。（`.harness-check/browser.mjs` 与 `.verify/check-cover.mjs` 都已按此设置。）
- `scripts/fit-coverage.mjs` 用 Node 的类型擦除**直接 import `src/lib/` 下的 `.ts` 文件**（拿到的是运行时的 `GAMES`、`mulberry32`、算法本体，不只是类型）。因此 **`games.ts`、`stats.ts`、`coverage.ts`、`prize.ts`、`stat.ts` 这五个文件必须保持「只有 `import type`（编译期擦除）、没有运行时 import」**：一旦其中某个文件新增运行时 import（如 `import { x } from "./y"`），Node ESM 无法解析这种无扩展名路径，`npm run fit` 会直接崩。页面侧（webpack）不受此限制，但为保持脚本可用，这五个文件请勿引入运行时依赖。
- 覆盖优化选号在 `spread` 极大时，已被本批用过的号码抽样键会下溢为 0（这是「尽量不重号」的实现方式）；`pickCoverTicket` 额外加了一个 `r * 1e-9` 的极小项，只为在「全批号码都用完、只能重复」时打破 0 与 0 的并列——去掉它会让 8 注的最后几注退化成完全相同的低号码注（白费注数）。
- ECharts `tooltip.trigger: "axis"` 时 formatter 收到的是**参数数组**，必须 `ps[0]` 再取值，否则显示 `undefined`（`StatsPanel` 曾因此出错，正确写法见 `PredictView.tsx` / `CoveragePanel.tsx`）。
- 生成器在条件过紧时会无解，需走「行数 0 + 黄色提示」路径，不得死循环（`.harness-check/report.txt` 覆盖了 `sumMax=20` 边界）。组合型生成器**进页即出一批**、按钮文案是「换一批」；`generateCombos` 用 `Math.random()`（非确定性），因此首屏生成必须放在挂载后的 effect 里，不能写进 `useState` 初始化或渲染期，否则水合不一致。无头回归脚本按文案定位按钮，改文案要同步 `.harness-check/browser.mjs`。
- `.zcode/`、`.verify/`、`.harness-check/` 均在 gitignore 内，属本地工具产物。

## 合规红线（不要越界）

本项目定位是免费的历史数据统计与娱乐工具，页面与 README 的免责声明（开奖为独立随机事件、无法预测、理性购彩、未满 18 周岁禁止购彩）**必须保留且清晰可见**。禁止新增任何付费预测/代购/投注渠道，禁止把统计「评分」表述为可提高中奖概率的预测能力——`predict.ts` 的策略与回测明确以随机基准为参照，改动算法时保持这一基调。「覆盖优化」是唯一有真实增益的方案，其表述边界见上文「覆盖优化（cover）方案的约束」。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
