/**
 * 策略引擎
 *
 * 三种方案：
 *  - 最优方案：覆盖优化·最大铺开（同批各注尽量不重复，蓝区优先覆盖不同号码）
 *  - 次优方案：覆盖优化·温和铺开（同一思路、铺开强度更小，号码更集中）
 *  - 纯机选：均匀随机，作为对照组
 *
 * 说明：彩票开奖为独立随机事件，单注命中期望 =（每注号码数 / 号码池）× 每注号码数，
 * 对任何选号方式都相同——本引擎不预测号码，也无法提高单注中奖概率。三种方案的
 * 单注平均命中都应与随机期望处于同一水平（页面回测与噪声带会显示这一点）。
 *
 * 唯一的真实差异在「同价位多注的覆盖率」：减少各注之间的重叠可以降低重复投注的浪费，
 * 从而提高「至少中得基本奖级」的概率。原理与参数来源见 coverage.ts 与 npm run fit。
 */
import type { Draw, GameConfig, GameKey } from "./games";
import {
  buildCoverBatch,
  buildProfile,
  coverParams,
  recommendationSeed,
  SHAPE_STRENGTH,
  omissionAt,
  recentFreqAt,
  type ZoneProfile,
} from "./coverage";
import { batchAtLeastOne, judgePrize, singleBlueAnyProb, singlePrizeProb, singleRedGeProb } from "./prize";
import { hitsOf, mean, pairedDiff, rateSe } from "./stat";
import { bigSmallRatio, mulberry32, oddEvenRatio, stdDev, sumOf, shapeScorer } from "./stats";

/* ---------------- 方案定义 ---------------- */

export type StrategyId = "best" | "second" | "random";

export interface StrategyDef {
  id: StrategyId;
  name: string;
  tagline: string;
  description: string;
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "best",
    name: "充分铺开",
    tagline: "同价覆盖最多号码",
    description:
      "不猜号码，而是分配号码：红区让同批各注尽量不重复、蓝区优先覆盖不同号码，把每一注的钱都用在不同的号码组合上。开奖是均匀随机事件，它的单注命中期望与机选完全相同（见下方回测），但具体多注覆盖表现需看当前数据的配对验证，不能据此承诺未来中奖。注数 ≥ 2 才有意义，且它不会让你中得更大的奖。",
  },
  {
    id: "second",
    name: "适度铺开",
    tagline: "号码更集中，覆盖几乎不变",
    description:
      "与最优方案同一套覆盖优化思路，但铺开强度取「覆盖率不显著下降前提下的最小值」（拟合判据：与最优差距 ≤1 个标准误），因此号码更集中、更接近传统选号观感。这是不同的号码分配方式，具体覆盖差异以下方当前数据验证为准。如果你不喜欢号码过于分散，选它。",
  },
  {
    id: "random",
    name: "纯机选（对照）",
    tagline: "均匀随机，作为对照组",
    description:
      "完全均匀随机选号，不掺任何分布偏好。它同时是对照组：各方案的单注平均命中率都应与它处于同一水平——这正是「开奖无法被预测」的直观体现；覆盖率上的差异需独立检验，不能根据历史表现承诺未来效果。",
  },
];

/* ---------------- 号码画像（信息展示用） ---------------- */

const WINDOW = 30;
const BACKTEST_DRAWS = 100;

/** 某区在一期里的号码个数与上限 */
function zoneSpec(cfg: GameConfig, zone: "red" | "blue"): { max: number; pick: number } {
  return zone === "red"
    ? { max: cfg.redMax, pick: cfg.redCount }
    : { max: cfg.blueMax, pick: cfg.blueCount };
}

/**
 * 把一个号码的频次/遗漏信息装进 Pick（仅供悬停提示，不参与选号）。
 * 数据取自 coverage.ts 的画像函数，与选号口径同源。
 */
function picksOf(z: ZoneProfile, i: number, nums: number[]): Pick[] {
  const recent = recentFreqAt(z, i, WINDOW);
  const omission = omissionAt(z, i);
  return nums.map((n) => ({ num: n, recent: recent[n], omission: omission[n] }));
}

/* ---------------- 推荐组合 ---------------- */

export interface Pick {
  num: number;
  /** 近 WINDOW 期出现次数（信息展示） */
  recent: number;
  /** 当前遗漏期数（信息展示） */
  omission: number;
}

export interface Combo {
  red: Pick[];
  blue: Pick[];
  sum: number;
  oddEven: string;
  bigSmall: string;
}

function toCombo(
  redNums: number[],
  blueNums: number[],
  redProfile: ZoneProfile,
  blueProfile: ZoneProfile,
  i: number
): Combo {
  const [odd] = oddEvenRatio(redNums);
  const oddEven = redProfile.pick === 1 ? `${odd}:0` : `${odd}:${redNums.length - odd}`;
  const [big, small] = bigSmallRatio(redNums, redProfile.max);
  return {
    red: picksOf(redProfile, i, redNums),
    blue: picksOf(blueProfile, i, blueNums),
    sum: redNums.reduce((a, b) => a + b, 0),
    oddEven,
    bigSmall: `${big}:${small}`,
  };
}

/** 展示与回测走完全相同的生成过程；seed=1 表示该周期的固定主推荐。 */
function buildCombos(
  cfg: GameConfig,
  draws: Draw[],
  redProfile: ZoneProfile,
  blueProfile: ZoneProfile,
  i: number,
  count: number,
  id: StrategyId,
  seed: number
): Combo[] {
  const batch = recommendationBatch(cfg, draws, i, id, count, { red: redProfile, blue: blueProfile }, seed - 1);
  return batch.red.map((r, t) => toCombo(r, batch.blue[t], redProfile, blueProfile, i));
}

/* ---------------- 回测 ---------------- */

/** 一期的一批号码 */
interface Batch {
  red: number[][];
  blue: number[][];
}

/**
 * 取某一期的一批号码。三种方案共用同一段代码，只差参数：
 *  - best / second：红蓝各自铺开（同一批各注互相避让）
 *  - random：不铺开 → 每注独立均匀随机（机选基准）
 * 随机数流对同一期是同一个种子，因此不同方案之间、以及与机选之间都是配对可比的。
 */
export function recommendationBatch(
  cfg: GameConfig,
  draws: Draw[],
  i: number,
  id: StrategyId,
  tickets: number,
  profiles: { red: ZoneProfile; blue: ZoneProfile },
  salt = 0,
): Batch {
  const previous = draws[i - 1];
  const rand = mulberry32(recommendationSeed(cfg.key, previous?.code ?? "empty", previous?.date ?? "", salt));
  return buildCoverBatch(profiles, i,
    { red: coverParams(cfg.key, "red", id), blue: coverParams(cfg.key, "blue", id) },
    tickets, rand, id === "random" ? undefined : shapeScorer(draws, i), id === "random" ? 0 : SHAPE_STRENGTH);
}

export interface BacktestResult {
  strategy: StrategyId;
  /** 每注平均命中个数（红区+蓝区，已按注数平均，因此可跨注数比较） */
  avgHits: number;
  avgRedHits: number;
  avgBlueHits: number;
  /** 该批全部注都没命中任何号码的期数占比 */
  zeroAllRate: number;
  /** 单期最佳单注命中（红+蓝） */
  bestHits: number;
  /** 单注随机选号的理论期望命中数 */
  expectation: number;
  /** 回测期数 */
  draws: number;
  /** 每期投注注数 */
  tickets: number;
  /** 批量覆盖指标：每期「至少一注…」的占比（覆盖优化相对机选的收益只体现在这里） */
  anyPrizeRate: number;
  redGe2Rate: number;
  redGe3Rate: number;
  blueAnyRate: number;
  /** 同注数下 N 注独立随机（＝机选）的解析基准 */
  batchExpectation: { anyPrize: number; redGe2: number; redGe3: number; blueAny: number };
}

/** 单注选号的理论期望命中数（红区 + 蓝区），任何选号方式都相同 */
function singleTicketExpectation(cfg: GameConfig): number {
  return (cfg.redCount * cfg.redCount) / cfg.redMax + (cfg.blueCount * cfg.blueCount) / cfg.blueMax;
}

/** N 注独立随机时各项覆盖指标的解析基准（1 − (1 − p)^N） */
function batchExpectations(
  cfg: GameConfig,
  tickets: number
): { anyPrize: number; redGe2: number; redGe3: number; blueAny: number } {
  return {
    anyPrize: batchAtLeastOne(singlePrizeProb(cfg), tickets),
    redGe2: batchAtLeastOne(singleRedGeProb(cfg, 2), tickets),
    redGe3: batchAtLeastOne(singleRedGeProb(cfg, 3), tickets),
    blueAny: batchAtLeastOne(singleBlueAnyProb(cfg), tickets),
  };
}

interface BatchWalk {
  n: number;
  anyPrize: Uint8Array;
  redGe2: Uint8Array;
  redGe3: Uint8Array;
  blueAny: Uint8Array;
  zeroAll: Uint8Array;
  /** 每期每注平均命中个数 */
  hits: Float64Array;
  avgRedHits: number;
  avgBlueHits: number;
  bestHits: number;
  avgDistinctRed: number;
  avgDistinctBlue: number;
}

/** 从第 from 期起逐期 walk-forward，统计单注命中与批量覆盖指标 */
function walkBatch(
  cfg: GameConfig,
  draws: Draw[],
  from: number,
  tickets: number,
  batchAt: (i: number) => Batch
): BatchWalk {
  const n = Math.max(draws.length - from, 0);
  const out: BatchWalk = {
    n,
    anyPrize: new Uint8Array(n),
    redGe2: new Uint8Array(n),
    redGe3: new Uint8Array(n),
    blueAny: new Uint8Array(n),
    zeroAll: new Uint8Array(n),
    hits: new Float64Array(n),
    avgRedHits: 0,
    avgBlueHits: 0,
    bestHits: 0,
    avgDistinctRed: 0,
    avgDistinctBlue: 0,
  };
  let sumRed = 0;
  let sumBlue = 0;
  let best = 0;
  let dRed = 0;
  let dBlue = 0;

  for (let k = 0; k < n; k++) {
    const i = from + k;
    const { red, blue } = batchAt(i);
    let ap = 0;
    let r2 = 0;
    let r3 = 0;
    let ba = 0;
    let hitAny = 0;
    let sumHits = 0;
    const usedRed = new Set<number>();
    const usedBlue = new Set<number>();
    for (let t = 0; t < tickets; t++) {
      const h = hitsOf(draws[i], red[t], blue[t]);
      if (judgePrize(cfg, h.red, h.blue) > 0) ap = 1;
      if (h.red >= 2) r2 = 1;
      if (h.red >= 3) r3 = 1;
      if (h.blue >= 1) ba = 1;
      if (h.total > 0) hitAny = 1;
      sumHits += h.total;
      sumRed += h.red;
      sumBlue += h.blue;
      if (h.total > best) best = h.total;
      for (const x of red[t]) usedRed.add(x);
      for (const x of blue[t]) usedBlue.add(x);
    }
    out.anyPrize[k] = ap;
    out.redGe2[k] = r2;
    out.redGe3[k] = r3;
    out.blueAny[k] = ba;
    out.zeroAll[k] = hitAny ? 0 : 1;
    out.hits[k] = sumHits / tickets;
    dRed += usedRed.size;
    dBlue += usedBlue.size;
  }

  out.avgRedHits = n ? sumRed / n / tickets : 0;
  out.avgBlueHits = n ? sumBlue / n / tickets : 0;
  out.bestHits = best;
  out.avgDistinctRed = n ? dRed / n : 0;
  out.avgDistinctBlue = n ? dBlue / n : 0;
  return out;
}

/** 回测单个方案：最近 B 期，每期只用该期之前的数据选号，统计实际命中 */
export function backtestStrategy(
  cfg: GameConfig,
  draws: Draw[],
  id: StrategyId,
  tickets = 1,
  B = BACKTEST_DRAWS
): BacktestResult {
  const profiles = {
    red: buildProfile(draws, "red", cfg.redMax),
    blue: buildProfile(draws, "blue", cfg.blueMax),
  };
  const start = Math.max(draws.length - B, 1);
  const w = walkBatch(cfg, draws, start, tickets, (i) => recommendationBatch(cfg, draws, i, id, tickets, profiles));

  return {
    strategy: id,
    avgHits: mean(w.hits),
    avgRedHits: w.avgRedHits,
    avgBlueHits: w.avgBlueHits,
    zeroAllRate: mean(w.zeroAll),
    bestHits: w.bestHits,
    expectation: singleTicketExpectation(cfg),
    draws: w.n,
    tickets,
    anyPrizeRate: mean(w.anyPrize),
    redGe2Rate: mean(w.redGe2),
    redGe3Rate: mean(w.redGe3),
    blueAnyRate: mean(w.blueAny),
    batchExpectation: batchExpectations(cfg, tickets),
  };
}

/** 一次性回测全部方案（用于方案对比表） */
export function backtestAll(cfg: GameConfig, draws: Draw[], tickets = 1, B = BACKTEST_DRAWS): BacktestResult[] {
  return STRATEGIES.map((s) => backtestStrategy(cfg, draws, s.id, tickets, B));
}

/* ---------------- 覆盖率对比（全量 walk-forward + 配对检验） ---------------- */

export type CoverageMetricKey = "anyPrize" | "blueAny" | "redGe2" | "redGe3";

export interface CoverageStrategyCell {
  rate: number;
  diff: number;
  ci95: [number, number];
  p: number;
  significant: boolean;
}

export interface CoverageMetricRow {
  key: CoverageMetricKey;
  label: string;
  hint: string;
  /** N 注独立随机的解析基准 */
  analytic: number;
  /** 实测机选（与各方案逐期配对） */
  random: number;
  /** 机选基准的 ±1.96SE 噪声带 */
  randomBand: [number, number];
  /** 各方案相对机选的配对结果 */
  byStrategy: { id: StrategyId; name: string; cell: CoverageStrategyCell }[];
}

export interface CoverageReport {
  game: GameKey;
  gameName: string;
  tickets: number;
  draws: number;
  fromDate: string;
  toDate: string;
  metrics: CoverageMetricRow[];
  redMax: number;
  blueMax: number;
  /** 每期平均覆盖多少个不同号码 */
  distinct: {
    id: StrategyId;
    name: string;
    red: number;
    blue: number;
  }[];
  /** 诚实性对照：每注平均命中（任何方案都应与人选机选无显著差异） */
  honesty: {
    expectation: number;
    byStrategy: { id: StrategyId; name: string; hits: number; randomHits: number; p: number }[];
  };
}

/**
 * 三种方案的全量 walk-forward 体检：每期只用该期之前的数据选号，
 * 与机选基准（同注数、同随机数流）逐期配对比较。
 *
 * 起点留出 200 期供窗口/遗漏统计，与 scripts/fit-coverage.mjs 的口径一致。
 */
export function compareCoverage(cfg: GameConfig, draws: Draw[], tickets: number, from = 200): CoverageReport {
  const profiles = {
    red: buildProfile(draws, "red", cfg.redMax),
    blue: buildProfile(draws, "blue", cfg.blueMax),
  };
  const ids = STRATEGIES.map((s) => s.id);
  const walks = new Map<StrategyId, BatchWalk>(
    ids.map((id) => [id, walkBatch(cfg, draws, from, tickets, (i) => recommendationBatch(cfg, draws, i, id, tickets, profiles))])
  );
  const randomWalk = walks.get("random")!;

  const defs: { key: CoverageMetricKey; label: string; hint: string }[] = [
    { key: "anyPrize", label: "至少中得基本奖级", hint: "按固定基础奖级口径统计，不含依赖奖池的双色球福运奖及临时派奖" },
    { key: "blueAny", label: `蓝区至少命中 1 个`, hint: `该批号码中至少一注命中${cfg.blueName}的期数占比` },
    { key: "redGe2", label: `红区至少命中 2 个`, hint: `该批号码中至少一注命中 2 个${cfg.redName}号码的期数占比` },
    { key: "redGe3", label: `红区至少命中 3 个`, hint: `该批号码中至少一注命中 3 个${cfg.redName}号码的期数占比` },
  ];

  const randomRate = (k: CoverageMetricKey) => mean(randomWalk[k]);
  const metrics: CoverageMetricRow[] = defs.map((d) => {
    const rRate = randomRate(d.key);
    const se = rateSe(rRate, randomWalk.n);
    return {
      ...d,
      random: rRate,
      analytic: batchExpectations(cfg, tickets)[d.key],
      randomBand: [rRate - 1.96 * se, rRate + 1.96 * se],
      byStrategy: STRATEGIES.filter((s) => s.id !== "random").map((s) => {
        const w = walks.get(s.id)!;
        const st = pairedDiff(w[d.key], randomWalk[d.key]);
        return {
          id: s.id,
          name: s.name,
          cell: { rate: mean(w[d.key]), diff: st.diff, ci95: st.ci95, p: st.p, significant: st.significant },
        };
      }),
    };
  });

  return {
    game: cfg.key,
    gameName: cfg.name,
    tickets,
    draws: randomWalk.n,
    fromDate: draws[from]?.date ?? "",
    toDate: draws.at(-1)?.date ?? "",
    metrics,
    redMax: cfg.redMax,
    blueMax: cfg.blueMax,
    distinct: STRATEGIES.map((s) => {
      const w = walks.get(s.id)!;
      return { id: s.id, name: s.name, red: w.avgDistinctRed, blue: w.avgDistinctBlue };
    }),
    honesty: {
      expectation: singleTicketExpectation(cfg),
      byStrategy: STRATEGIES.map((s) => {
        const w = walks.get(s.id)!;
        return {
          id: s.id,
          name: s.name,
          hits: mean(w.hits),
          randomHits: mean(randomWalk.hits),
          p: pairedDiff(w.hits, randomWalk.hits).p,
        };
      }),
    },
  };
}

/* ---------------- 主入口 ---------------- */

export interface StrategyResult {
  strategy: StrategyDef;
  combos: Combo[];
  analysis: {
    window: number;
    hotTop: { num: number; count: number }[];
    coldTop: { num: number; omission: number }[];
    /** 推荐组合和值参考区间（近 100 期均值 ± 1.2σ） */
    sumRange: [number, number];
    /** 近 30 期红区奇偶比分布（"3:2" → 期数） */
    oddEvenDist: [string, number][];
    backtest: BacktestResult;
  };
}

/** 运行某个方案，生成推荐组合 + 方案分析 */
export function runStrategy(
  cfg: GameConfig,
  draws: Draw[],
  id: StrategyId,
  combosCount = 5,
  seed = Math.floor(Math.random() * 2 ** 31)
): StrategyResult {
  const def = STRATEGIES.find((s) => s.id === id)!;
  const redProfile = buildProfile(draws, "red", cfg.redMax);
  const blueProfile = buildProfile(draws, "blue", cfg.blueMax);
  const i = draws.length;

  const combos = buildCombos(cfg, draws, redProfile, blueProfile, i, combosCount, id, seed);

  // 分析面板：近 30 期热号 / 当前遗漏最深（纯历史统计，与选号偏好无关）
  const recent = recentFreqAt(redProfile, i, WINDOW);
  const hotTop = [...recent]
    .map((count, num) => ({ num, count }))
    .slice(1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const omission = omissionAt(redProfile, i);
  const coldTop = [...omission]
    .map((o, num) => ({ num, omission: o }))
    .slice(1)
    .sort((a, b) => b.omission - a.omission)
    .slice(0, 5);

  // 近 30 期红区奇偶比分布
  const dist = new Map<string, number>();
  for (const d of draws.slice(-30)) {
    const [odd, even] = oddEvenRatio(d.red);
    const k = `${odd}:${even}`;
    dist.set(k, (dist.get(k) ?? 0) + 1);
  }
  const oddEvenDist = [...dist.entries()].sort((a, b) => b[1] - a[1]);

  const sums = draws.slice(-100).map(sumOf);
  const sumLo = Math.round(mean(sums) - 1.2 * stdDev(sums));
  const sumHi = Math.round(mean(sums) + 1.2 * stdDev(sums));

  return {
    strategy: def,
    combos,
    analysis: {
      window: WINDOW,
      hotTop,
      coldTop,
      sumRange: [sumLo, sumHi],
      oddEvenDist,
      backtest: backtestStrategy(cfg, draws, id, combosCount),
    },
  };
}

