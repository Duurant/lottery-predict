/**
 * 多方案预测策略引擎
 *
 * 六种方案：热号追踪 / 冷号回补 / 冷热结合 / 遗漏回归 / 覆盖优化 / 纯机选基准
 * 每种方案输出：推荐号码（带理由标签）+ 方案分析（热冷概况、形态参考、历史回测命中对比）
 *
 * 说明：彩票开奖为独立随机事件，本引擎的「评分」只是对历史统计的趣味化呈现，
 * 任何方案都无法提高单注中奖概率，单注平均命中率也与随机基准处在同一水平——页面须向用户明示。
 *
 * 唯一的例外是「覆盖优化」：它不改变单注期望，而是通过减少同批各注之间的号码重叠，
 * 提高同价位下「至少中得某奖级」的概率。这是组合数学结论（详见 coverage.ts），
 * 不是预测能力，页面文案须把这一层说清楚。
 */
import type { Draw, GameConfig, GameKey } from "./games";
import {
  buildCoverSet,
  buildProfile,
  COVERAGE_PARAMS,
  hashSeed,
  RANDOM_PARAMS,
  type ZoneProfile,
} from "./coverage";
import { batchAtLeastOne, judgePrize, singleBlueAnyProb, singlePrizeProb, singleRedGeProb } from "./prize";
import { hitsOf, mean, pairedDiff, rateSe } from "./stat";
import {
  bigSmallRatio,
  mulberry32,
  oddEvenRatio,
  stdDev,
  sumOf,
  type Zone,
} from "./stats";

/* ---------------- 方案定义 ---------------- */

export type StrategyId = "hot" | "cold" | "mix" | "regress" | "cover" | "random";

export interface StrategyDef {
  id: StrategyId;
  name: string;
  tagline: string;
  description: string;
}

export const STRATEGIES: StrategyDef[] = [
  {
    id: "hot",
    name: "热号追踪",
    tagline: "跟随近期高频号码",
    description:
      "认为「热号短期内有延续惯性」：优先选取近 30 期出现频次最高的号码。适合相信强者恒强的玩家，选出的号码多为近期常客。",
  },
  {
    id: "cold",
    name: "冷号回补",
    tagline: "押注久未出现的号码",
    description:
      "认为「冷号久未出现、该轮到了」：优先选取当前遗漏期数最长的号码。适合相信雨露均沾的玩家，选出的号码多为长期缺席者。",
  },
  {
    id: "mix",
    name: "冷热结合",
    tagline: "热号 60% + 回补 40% 加权",
    description:
      "把「热号惯性」与「遗漏回补」按 6:4 加权合成评分：既保留近期高频号码，又照顾久未开出的号码，兼顾两端，是多数彩民常用的均衡思路。",
  },
  {
    id: "regress",
    name: "遗漏回归",
    tagline: "遗漏超过自身均值即入场",
    description:
      "对每个号码用「实际遗漏 − 自身历史平均间隔」打分：某号当前遗漏明显超过它自己的平均节奏时得分最高，寻找「偏离个人周期」的号码。",
  },
  {
    id: "cover",
    name: "覆盖优化",
    tagline: "红蓝分开铺开，同价覆盖更多号码",
    description:
      "不猜号码，而是分配号码：红区让同批各注尽量不重复，蓝区优先覆盖不同号码。开奖是均匀随机事件，单注命中期望与机选完全相同（见下方回测），但同样注数下「至少中得某奖级」的概率更高——收益来自减少各注之间的重复计数，属组合数学结论，不是预测能力。注数 ≥ 2 才有意义，且它不会让你中得更大的奖。",
  },
  {
    id: "random",
    name: "纯机选基准",
    tagline: "均匀随机，作为对照组",
    description:
      "完全均匀随机选号，不掺任何统计偏好。它同时是对照组：各方案的单注平均命中率应与它处于同一水平——这正是「开奖无法被预测」的直观体现；只有「覆盖优化」在批量覆盖口径上会与它有稳定差异。",
  },
];

/* ---------------- 快速号码画像 ---------------- */

interface FastZone {
  max: number;
  pick: number;
  /** 每个号码出现的期索引（升序），索引 1..max */
  hits: number[][];
  total: number;
}

function makeFastZone(draws: Draw[], zone: Zone, max: number): FastZone {
  const hits: number[][] = Array.from({ length: max + 1 }, () => []);
  for (let i = 0; i < draws.length; i++) {
    const nums = zone === "red" ? draws[i].red : draws[i].blue;
    for (const n of nums) hits[n].push(i);
  }
  return { max, pick: zone === "red" ? draws[0]?.red.length ?? 0 : draws[0]?.blue.length ?? 0, hits, total: draws.length };
}

/** 小于 i 的最后一个命中索引（二分） */
function lastHitBefore(hits: number[], i: number): number {
  let lo = 0;
  let hi = hits.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (hits[mid] < i) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 截止索引 i（不含 i）时，每号遗漏期数 */
function omissionAt(z: FastZone, i: number): number[] {
  const out = new Array<number>(z.max + 1);
  for (let n = 1; n <= z.max; n++) {
    const k = lastHitBefore(z.hits[n], i);
    out[n] = k >= 0 ? i - 1 - z.hits[n][k] : i;
  }
  return out;
}

/** 截止索引 i 时，近 w 期每号出现次数 */
function recentFreqAt(z: FastZone, i: number, w: number): number[] {
  const out = new Array<number>(z.max + 1).fill(0);
  const from = Math.max(0, i - w);
  for (let n = 1; n <= z.max; n++) {
    let c = 0;
    for (const idx of z.hits[n]) if (idx >= from && idx < i) c++;
    out[n] = c;
  }
  return out;
}

/** 截止索引 i 时，每号历史平均间隔（-1 表示未出现或只出现一次） */
function avgGapAt(z: FastZone, i: number): number[] {
  const out = new Array<number>(z.max + 1).fill(-1);
  for (let n = 1; n <= z.max; n++) {
    const hs = z.hits[n].filter((x) => x < i);
    if (hs.length >= 2) {
      let s = 0;
      for (let k = 1; k < hs.length; k++) s += hs[k] - hs[k - 1];
      out[n] = s / (hs.length - 1);
    }
  }
  return out;
}

/* ---------------- 评分与选号 ---------------- */

interface ScoredNum {
  num: number;
  score: number;
  recent: number;
  omission: number;
}

/** 按方案给某区所有号码打分 */
function scoreZone(z: FastZone, i: number, id: StrategyId, window: number, rand: () => number): ScoredNum[] {
  const recent = recentFreqAt(z, i, window);
  const omission = omissionAt(z, i);
  const avgGap = avgGapAt(z, i);
  const theoretical = z.max / z.pick;

  const maxFreq = Math.max(...recent.slice(1)) || 1;
  const out: ScoredNum[] = [];
  for (let n = 1; n <= z.max; n++) {
    let score = 0;
    switch (id) {
      case "hot":
        score = recent[n];
        break;
      case "cold":
        score = omission[n];
        break;
      case "mix": {
        const hotNorm = recent[n] / maxFreq;
        const dueNorm = Math.min(omission[n] / theoretical, 2) / 2;
        score = 0.6 * hotNorm + 0.4 * dueNorm;
        break;
      }
      case "regress": {
        const gap = avgGap[n] > 0 ? avgGap[n] : theoretical;
        score = omission[n] - gap;
        break;
      }
      case "random":
        score = rand();
        break;
    }
    out.push({ num: n, score, recent: recent[n], omission: omission[n] });
  }
  return out;
}

/** 按分数加权随机抽取 k 个号（不放回）：分数高的号更可能入选，但保留多样性 */
function pickTopK(scored: ScoredNum[], k: number, rand: () => number): number[] {
  const pool = scored.map((s) => ({ num: s.num, w: Math.max(s.score, 0) }));
  // 平移保证权重为正（regress 等方案可能给负分）
  const min = Math.min(...pool.map((p) => p.w));
  const shift = min < 0 ? -min : 0;
  for (const p of pool) p.w += shift + 0.05;

  const picked: number[] = [];
  for (let n = 0; n < k && pool.length > 0; n++) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rand() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j].w;
      if (r <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(pool[idx].num);
    pool.splice(idx, 1);
  }
  return picked.sort((a, b) => a - b);
}

/* ---------------- 推荐组合与理由 ---------------- */

export interface Pick {
  num: number;
  /** 理由标签：热 / 回补 / 偏冷 / 均衡 */
  tag: "热" | "回补" | "偏冷" | "均衡";
  /** 近 window 期出现次数 */
  recent: number;
  /** 当前遗漏期数 */
  omission: number;
}

export interface Combo {
  red: Pick[];
  blue: Pick[];
  sum: number;
  oddEven: string;
  bigSmall: string;
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

const WINDOW = 30;
const BACKTEST_DRAWS = 100;

function makeTags(picked: number[], z: FastZone, i: number): Pick[] {
  const recent = recentFreqAt(z, i, WINDOW);
  const omission = omissionAt(z, i);
  const avgGap = avgGapAt(z, i);
  const theoretical = z.max / z.pick;
  // 窗口内每号理论期望出现次数（如大乐透前区 30×5/35 ≈ 4.3 次）
  const expectedRecent = (WINDOW * z.pick) / z.max;
  return picked.map((n) => {
    const gap = avgGap[n] > 0 ? avgGap[n] : theoretical;
    let tag: Pick["tag"] = "均衡";
    if (recent[n] >= Math.max(3, expectedRecent * 1.4)) tag = "热";
    else if (omission[n] >= gap * 1.8) tag = "回补";
    else if (omission[n] >= gap * 1.2) tag = "偏冷";
    return { num: n, tag, recent: recent[n], omission: omission[n] };
  });
}

/** 把选定的一注号码组装成展示用组合（附理由标签与形态统计） */
function toCombo(
  redPicked: number[],
  bluePicked: number[],
  redZone: FastZone,
  blueZone: FastZone,
  i: number
): Combo {
  const [odd] = oddEvenRatio(redPicked);
  const oddEven = redZone.pick === 1 ? `${odd}:0` : `${odd}:${redPicked.length - odd}`;
  const [big, small] = bigSmallRatio(redPicked, redZone.max);
  return {
    red: makeTags(redPicked, redZone, i),
    blue: makeTags(bluePicked, blueZone, i),
    sum: redPicked.reduce((a, b) => a + b, 0),
    oddEven,
    bigSmall: `${big}:${small}`,
  };
}

/** 软性形态约束：和值区间 + 红区不全奇/不全偶，最多尝试 60 次 */
function shapeOk(red: number[], sumLo: number, sumHi: number, pick: number): boolean {
  const sum = red.reduce((a, b) => a + b, 0);
  if (sum < sumLo || sum > sumHi) return false;
  if (pick >= 5) {
    const [odd, even] = oddEvenRatio(red);
    if (odd === 0 || even === 0) return false; // 不允许全奇/全偶
  }
  return true;
}

function buildCombo(
  redZone: FastZone,
  blueZone: FastZone,
  i: number,
  id: StrategyId,
  window: number,
  rand: () => number,
  sumLo: number,
  sumHi: number
): Combo {
  let redPicked: number[] = [];
  for (let t = 0; t < 60; t++) {
    const scored = scoreZone(redZone, i, id, window, rand);
    redPicked = pickTopK(scored, redZone.pick, rand);
    if (shapeOk(redPicked, sumLo, sumHi, redZone.pick)) break;
  }
  const blueScored = scoreZone(blueZone, i, id, window, rand);
  const bluePicked = pickTopK(blueScored, blueZone.pick, rand);

  return toCombo(redPicked, bluePicked, redZone, blueZone, i);
}

/**
 * 覆盖优化的一批选号：红区、蓝区各自联合选号（同一批各注互相避让），
 * 而不是每注独立挑选。参数来自 COVERAGE_PARAMS（由 npm run fit 拟合）。
 */
function buildCoverCombos(
  cfg: GameConfig,
  draws: Draw[],
  redZone: FastZone,
  blueZone: FastZone,
  profiles: { red: ZoneProfile; blue: ZoneProfile },
  i: number,
  count: number,
  seed: number
): Combo[] {
  const params = COVERAGE_PARAMS[cfg.key];
  const sums = draws.slice(-100).map(sumOf);
  const m = mean(sums);
  const sd = stdDev(sums);
  const sumLo = Math.round(m - 1.2 * sd);
  const sumHi = Math.round(m + 1.2 * sd);

  // 形态约束（和值区间、不全奇/全偶）在铺开选号上是软性的：整批重试，
  // 最多 60 次；仍不满足则放弃约束直接输出，保证页面永远有结果、不死循环。
  for (let attempt = 0; attempt <= 60; attempt++) {
    const relaxed = attempt === 60;
    const rand = mulberry32(hashSeed(cfg.key, "cover", seed, attempt));
    const redSet = buildCoverSet(profiles.red, i, params.red, count, rand);
    const blueSet = buildCoverSet(profiles.blue, i, params.blue, count, rand);
    if (!relaxed && !redSet.every((r) => shapeOk(r, sumLo, sumHi, redZone.pick))) continue;
    return redSet.map((r, t) => toCombo(r, blueSet[t], redZone, blueZone, i));
  }
  return [];
}

/* ---------------- 回测 ---------------- */

/** 一期的一批号码 */
interface Batch {
  red: number[][];
  blue: number[][];
}

/**
 * 取某一期的一批号码：
 *  - cover：整批联合铺开（同一批各注互相避让）
 *  - 其余方案：N 注各自独立选号（这正是机选基准的口径：注数越多，越可能出现重复投注）
 */
function pickBatch(
  cfg: GameConfig,
  draws: Draw[],
  i: number,
  id: StrategyId,
  tickets: number,
  redZone: FastZone,
  blueZone: FastZone,
  profiles: { red: ZoneProfile; blue: ZoneProfile }
): Batch {
  if (id === "cover") {
    const params = COVERAGE_PARAMS[cfg.key];
    const rand = mulberry32(hashSeed(cfg.key, "batch", draws[i].code));
    return {
      red: buildCoverSet(profiles.red, i, params.red, tickets, rand),
      blue: buildCoverSet(profiles.blue, i, params.blue, tickets, rand),
    };
  }
  const red: number[][] = [];
  const blue: number[][] = [];
  for (let t = 0; t < tickets; t++) {
    const rand = mulberry32(hashSeed(cfg.key, id, draws[i].code, t));
    const combo = buildCombo(
      redZone,
      blueZone,
      i,
      id,
      WINDOW,
      rand,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY // 回测不做形态约束，纯看方案本身
    );
    red.push(combo.red.map((p) => p.num));
    blue.push(combo.blue.map((p) => p.num));
  }
  return { red, blue };
}

/**
 * 机选基准的一批号码（N 注独立均匀随机）。与 cover 刻意使用同一随机数流
 * （同种子、同调用次数），因此两者的逐期差值可以做配对检验。
 */
function pickRandomBatch(
  cfg: GameConfig,
  draws: Draw[],
  i: number,
  tickets: number,
  profiles: { red: ZoneProfile; blue: ZoneProfile }
): Batch {
  const rand = mulberry32(hashSeed(cfg.key, "batch", draws[i].code));
  return {
    red: buildCoverSet(profiles.red, i, RANDOM_PARAMS, tickets, rand),
    blue: buildCoverSet(profiles.blue, i, RANDOM_PARAMS, tickets, rand),
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
  const redZone = makeFastZone(draws, "red", cfg.redMax);
  const blueZone = makeFastZone(draws, "blue", cfg.blueMax);
  const profiles = {
    red: buildProfile(draws, "red", cfg.redMax),
    blue: buildProfile(draws, "blue", cfg.blueMax),
  };
  const start = Math.max(draws.length - B, 1);

  const w = walkBatch(cfg, draws, start, tickets, (i) =>
    pickBatch(cfg, draws, i, id, tickets, redZone, blueZone, profiles)
  );

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

/* ---------------- 覆盖优化 vs 纯机选（全量 walk-forward + 配对检验） ---------------- */

export type CoverageMetricKey = "anyPrize" | "blueAny" | "redGe2" | "redGe3";

export interface CoverageMetricRow {
  key: CoverageMetricKey;
  label: string;
  /** 该指标的含义说明 */
  hint: string;
  cover: number;
  random: number;
  /** N 注独立随机的解析基准（与实测机选对照，用于自校验） */
  analytic: number;
  diff: number;
  ci95: [number, number];
  p: number;
  significant: boolean;
  /** 机选基准的 ±1.96SE 噪声带 */
  randomBand: [number, number];
}

export interface CoverageReport {
  game: GameKey;
  gameName: string;
  tickets: number;
  draws: number;
  fromDate: string;
  toDate: string;
  metrics: CoverageMetricRow[];
  distinct: {
    coverRed: number;
    randomRed: number;
    coverBlue: number;
    randomBlue: number;
    redMax: number;
    blueMax: number;
  };
  honesty: {
    coverHits: number;
    randomHits: number;
    expectation: number;
    p: number;
  };
}

/**
 * 覆盖优化的全量 walk-forward 体检：每期只用该期之前的数据选号，
 * 与机选基准（同注数、同随机数流）逐期配对比较。
 *
 * 起点留出 200 期供窗口/遗漏统计，与 scripts/fit-coverage.mjs 的口径一致
 * （该脚本在全部历史上做过训练/验证切分，本函数是同一测量的页面侧实现）。
 */
export function compareCoverage(
  cfg: GameConfig,
  draws: Draw[],
  tickets: number,
  from = 200
): CoverageReport {
  const profiles = {
    red: buildProfile(draws, "red", cfg.redMax),
    blue: buildProfile(draws, "blue", cfg.blueMax),
  };
  const cover = walkBatch(cfg, draws, from, tickets, (i) =>
    pickBatch(cfg, draws, i, "cover", tickets, makeFastZone(draws, "red", cfg.redMax), makeFastZone(draws, "blue", cfg.blueMax), profiles)
  );
  const random = walkBatch(cfg, draws, from, tickets, (i) => pickRandomBatch(cfg, draws, i, tickets, profiles));

  const defs: { key: CoverageMetricKey; label: string; hint: string }[] = [
    { key: "anyPrize", label: "至少中得某奖级", hint: "该批号码中任意一注中得任意奖级的期数占比" },
    { key: "blueAny", label: "蓝区至少命中 1 个", hint: `该批号码中至少一注命中${cfg.blueName}的期数占比` },
    { key: "redGe2", label: `红区至少命中 2 个`, hint: `该批号码中至少一注命中 2 个${cfg.redName}号码的期数占比` },
    { key: "redGe3", label: "红区至少命中 3 个", hint: `该批号码中至少一注命中 3 个${cfg.redName}号码的期数占比` },
  ];

  const metrics: CoverageMetricRow[] = defs.map((d) => {
    const a = cover[d.key];
    const b = random[d.key];
    const st = pairedDiff(a, b);
    const randomRate = mean(b);
    const se = rateSe(randomRate, random.n);
    return {
      ...d,
      cover: mean(a),
      random: randomRate,
      analytic: batchExpectations(cfg, tickets)[d.key],
      diff: st.diff,
      ci95: st.ci95,
      p: st.p,
      significant: st.significant,
      randomBand: [randomRate - 1.96 * se, randomRate + 1.96 * se],
    };
  });

  const honesty = pairedDiff(cover.hits, random.hits);

  return {
    game: cfg.key,
    gameName: cfg.name,
    tickets,
    draws: cover.n,
    fromDate: draws[from]?.date ?? "",
    toDate: draws.at(-1)?.date ?? "",
    metrics,
    distinct: {
      coverRed: cover.avgDistinctRed,
      randomRed: random.avgDistinctRed,
      coverBlue: cover.avgDistinctBlue,
      randomBlue: random.avgDistinctBlue,
      redMax: cfg.redMax,
      blueMax: cfg.blueMax,
    },
    honesty: {
      coverHits: mean(cover.hits),
      randomHits: mean(random.hits),
      expectation: singleTicketExpectation(cfg),
      p: honesty.p,
    },
  };
}

/* ---------------- 主入口 ---------------- */

/** 运行某个方案，生成推荐组合 + 方案分析 */
export function runStrategy(
  cfg: GameConfig,
  draws: Draw[],
  id: StrategyId,
  combosCount = 5,
  seed = Math.floor(Math.random() * 2 ** 31)
): StrategyResult {
  const def = STRATEGIES.find((s) => s.id === id)!;
  const redZone = makeFastZone(draws, "red", cfg.redMax);
  const blueZone = makeFastZone(draws, "blue", cfg.blueMax);
  const i = draws.length;

  // 和值参考区间：近 100 期和值均值 ± 1.2σ
  const sums = draws.slice(-100).map(sumOf);
  const m = mean(sums);
  const sd = stdDev(sums);
  const sumLo = Math.round(m - 1.2 * sd);
  const sumHi = Math.round(m + 1.2 * sd);

  // 生成组合（去重）
  let combos: Combo[] = [];
  if (id === "cover") {
    // 覆盖优化：整批联合选号（各注互相避让），并叠加形态约束
    const profiles = {
      red: buildProfile(draws, "red", cfg.redMax),
      blue: buildProfile(draws, "blue", cfg.blueMax),
    };
    combos = buildCoverCombos(cfg, draws, redZone, blueZone, profiles, i, combosCount, seed);
  } else {
    const seen = new Set<string>();
    let guard = 0;
    while (combos.length < combosCount && guard < combosCount * 30) {
      guard++;
      const rand = mulberry32(hashSeed(cfg.key, id, seed, guard));
      const c = buildCombo(redZone, blueZone, i, id, WINDOW, rand, sumLo, sumHi);
      const key = c.red.map((p) => p.num).join(",") + "|" + c.blue.map((p) => p.num).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push(c);
    }
  }

  // 分析面板数据
  const recent = recentFreqAt(redZone, i, WINDOW);
  const hotTop = [...recent]
    .map((count, num) => ({ num, count }))
    .slice(1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const omission = omissionAt(redZone, i);
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

/** 一次性回测全部方案（用于方案对比表） */
export function backtestAll(cfg: GameConfig, draws: Draw[], tickets = 1, B = BACKTEST_DRAWS): BacktestResult[] {
  return STRATEGIES.map((s) => backtestStrategy(cfg, draws, s.id, tickets, B));
}
