/**
 * 排列五的策略引擎（数字型）
 *
 * 与组合型最大的不同：**这里没有覆盖优化可言**。
 * 排列五只有一个奖级（5 位全中），每位 0-9 独立均匀，因此任意一注中奖概率都是
 * 1/100000；买 N 注时，只要这 N 注互不相同，中奖概率就是 N/100000——选哪些号码
 * 完全等价。唯一真实的优化只是**别买重复注**（机选 N 注时约有 N²/2/1e5 的概率撞车，
 * 5 注时约 0.002%，被撞掉的那注等于白花钱）。
 *
 * 因此这里的三个方案如实分成：
 *  - 最优方案：均匀随机 + 强制去重（本玩法唯一真实优化）
 *  - 次优方案：按各位历史频率加权 + 去重（**不改变中奖概率**，只是选号口味）
 *  - 纯机选：均匀随机、允许重复（对照组）
 * 页面必须把「三者中奖概率相同」这一点写在明面上。
 */
import {
  digitSum,
  judgeDigitPrize,
  randomBatchProb,
  distinctBatchProb,
  type DigitDraw,
  type DigitGameConfig,
} from "./digit";
import { hashSeed, recommendationSeed } from "./coverage";
import { mean, pairedDiff } from "./stat";
import { mulberry32 } from "./stats";

export type DigitStrategyId = "best" | "second" | "random";

export interface DigitStrategyDef {
  id: DigitStrategyId;
  name: string;
  tagline: string;
  description: string;
}

export const DIGIT_STRATEGIES: DigitStrategyDef[] = [
  {
    id: "best",
    name: "最优方案",
    tagline: "均匀随机 + 强制去重",
    description:
      "排列五只有一个奖级（5 位全中），每位 0-9 独立均匀，因此任何一注的中奖概率都是 1/100000，选哪些号码完全等价。本玩法唯一真实的优化是**不让多注之间撞车**：机选 5 注约有 0.002% 的概率买到重复注，那一注就等于白花钱；本方案强制 N 注互不相同，因此中奖概率恰为 N/100000。它不提高单注概率，也猜不到号码。",
  },
  {
    id: "second",
    name: "次优方案",
    tagline: "按各位历史频率加权（不改变概率）",
    description:
      "同样保证 N 注互不重复，但选号时按每一位数字的历史出现频率加权（加平滑，避免冷号权重为 0），因此号码看起来更「贴合历史」。必须说清楚：开奖是独立随机事件，历史频率**不会**改变中奖概率——本方案与最优方案的中奖概率完全相同，区别只是号码构成。",
  },
  {
    id: "random",
    name: "纯机选（对照）",
    tagline: "均匀随机，允许重复",
    description:
      "完全均匀随机地生成 N 注，不保证互不重复。这是最常见的机选行为，也是对照组：它与另外两个方案的**中奖概率相同**（仅多出重复注带来的极小浪费）。",
  },
];

/** 一期的一批号码（每注 5 位数字） */
type DigitBatch = number[][];

/** 由计数得某位的数字权重（拉普拉斯平滑） */
function weightsFromCounts(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0) + counts.length;
  return counts.map((c) => (c + 1) / total);
}

/**
 * 某位的数字权重（按截止第 i 期的历史频率，加拉普拉斯平滑）。
 * 单次调用用；全量 walk-forward 里请用 walkDigit 的逐期递增计数（避免 O(n²) 重扫）。
 */
function positionWeights(draws: DigitDraw[], i: number, cfg: DigitGameConfig, position: number): number[] {
  const counts = new Array<number>(cfg.digitMax + 1).fill(0);
  for (let k = 0; k < i; k++) counts[draws[k].digits[position]]++;
  return weightsFromCounts(counts);
}

/** 按权重取一个数字（前缀和 + 均匀随机） */
function weightedDigit(weights: number[], rand: () => number): number {
  const r = rand();
  let acc = 0;
  for (let n = 0; n < weights.length; n++) {
    acc += weights[n];
    if (r <= acc) return n;
  }
  return weights.length - 1;
}

/**
 * 生成一批号码。best/random 走均匀抽样，second 走位置频率加权；
 * best/second 强制去重（重复则重抽，超过上限后改为顺序补齐，保证一定返回 N 注）。
 *
 * weightsIn：调用方预先算好的按位权重（walkDigit 的递增计数路径）；
 * 不传时（单次调用）内部按第 i 期现算。
 */
function pickDigitBatch(
  cfg: DigitGameConfig,
  draws: DigitDraw[],
  i: number,
  id: DigitStrategyId,
  tickets: number,
  rand: () => number,
  weightsIn?: number[][]
): DigitBatch {
  const dedupe = id !== "random";
  const weights =
    weightsIn ??
    (id === "second"
      ? Array.from({ length: cfg.positions }, (_, p) => positionWeights(draws, i, cfg, p))
      : null);

  const out: DigitBatch = [];
  const seen = new Set<string>();
  const maxTries = tickets * 40;

  for (let t = 0; t < tickets; t++) {
    let ticket: number[] = [];
    for (let tries = 0; tries <= maxTries; tries++) {
      ticket = Array.from({ length: cfg.positions }, (_, p) =>
        weights ? weightedDigit(weights[p], rand) : Math.floor(rand() * (cfg.digitMax + 1))
      );
      const key = ticket.join("");
      if (!dedupe || !seen.has(key)) {
        seen.add(key);
        break;
      }
      // 重抽到上限仍未避开重复：按顺序改成相邻号码（保证有输出、不死循环）
      if (tries === maxTries) {
        ticket = ticket.map((n, p) => (n + tries + p) % (cfg.digitMax + 1));
        seen.add(ticket.join(""));
      }
    }
    out.push(ticket);
  }
  return out;
}

/** 一期的一批号码的评分结果 */
interface BatchScore {
  /** 是否有任意一注中奖（5 位全中） */
  win: 0 | 1;
  /** 该批去重后的注数 */
  distinct: number;
  /** 每注平均命中位数（理论值 5 × 1/10 = 0.5，与选号方式无关） */
  matchedPerTicket: number;
  /** 最佳单注命中位数 */
  bestMatched: number;
}

function scoreBatch(cfg: DigitGameConfig, batch: DigitBatch, drawn: number[]): BatchScore {
  const keys = new Set<string>();
  let win: 0 | 1 = 0;
  let matched = 0;
  let best = 0;
  for (const ticket of batch) {
    keys.add(ticket.join(""));
    if (judgeDigitPrize(cfg, ticket, drawn)) win = 1;
    let m = 0;
    for (let p = 0; p < cfg.positions; p++) if (ticket[p] === drawn[p]) m++;
    matched += m;
    if (m > best) best = m;
  }
  return { win, distinct: keys.size, matchedPerTicket: matched / batch.length, bestMatched: best };
}

export interface DigitBacktestResult {
  strategy: DigitStrategyId;
  /** 至少一注中奖的期数占比 */
  winRate: number;
  /** 每批平均去重注数（= 实际有效注数） */
  distinctRate: number;
  /** 每注平均命中位数（理论 0.5，与选号方式无关） */
  matchedPerTicket: number;
  /** 单期最佳单注命中位数 */
  bestMatched: number;
  /** 该注数下的解析概率：去重 N/100000 与机选 1−(1−p)^N */
  analytic: { distinct: number; random: number };
  draws: number;
  tickets: number;
}

export interface DigitWalk {
  n: number;
  win: Uint8Array;
  distinct: Float64Array;
  matched: Float64Array;
  bestMatched: number;
}

/** 从第 from 期起逐期 walk-forward：每期只用之前的数据选号 */
function walkDigit(
  cfg: DigitGameConfig,
  draws: DigitDraw[],
  from: number,
  id: DigitStrategyId,
  tickets: number
): DigitWalk {
  const n = Math.max(draws.length - from, 0);
  const out: DigitWalk = {
    n,
    win: new Uint8Array(n),
    distinct: new Float64Array(n),
    matched: new Float64Array(n),
    bestMatched: 0,
  };
  // second 方案需要「截止当期」的按位频率：逐期递增维护计数，
  // 与原实现的逐期前缀重扫在整数计数上完全等价，但把 O(n²) 降到 O(n)
  let counts: number[][] | null = null;
  if (id === "second") {
    counts = Array.from({ length: cfg.positions }, () => new Array<number>(cfg.digitMax + 1).fill(0));
    for (let k = 0; k < from; k++) {
      const d = draws[k].digits;
      for (let p = 0; p < cfg.positions; p++) counts[p][d[p]]++;
    }
  }
  for (let k = 0; k < n; k++) {
    const i = from + k;
    const rand = mulberry32(recommendationSeed(cfg.key, draws[i - 1]?.code ?? "empty", draws[i - 1]?.date ?? ""));
    const weights = counts ? counts.map(weightsFromCounts) : undefined;
    const batch = pickDigitBatch(cfg, draws, i, id, tickets, rand, weights);
    const s = scoreBatch(cfg, batch, draws[i].digits);
    out.win[k] = s.win;
    out.distinct[k] = s.distinct;
    out.matched[k] = s.matchedPerTicket;
    if (s.bestMatched > out.bestMatched) out.bestMatched = s.bestMatched;
    // 当期开奖后并入计数，供下一期使用
    if (counts) {
      const d = draws[i].digits;
      for (let p = 0; p < cfg.positions; p++) counts[p][d[p]]++;
    }
  }
  return out;
}

export function backtestDigit(
  cfg: DigitGameConfig,
  draws: DigitDraw[],
  id: DigitStrategyId,
  tickets = 5,
  B = 100
): DigitBacktestResult {
  const from = Math.max(draws.length - B, 200);
  const w = walkDigit(cfg, draws, from, id, tickets);
  return {
    strategy: id,
    winRate: mean(w.win),
    distinctRate: mean(w.distinct),
    matchedPerTicket: mean(w.matched),
    bestMatched: w.bestMatched,
    analytic: { distinct: distinctBatchProb(cfg, tickets), random: randomBatchProb(cfg, tickets) },
    draws: w.n,
    tickets,
  };
}

export function backtestDigitAll(
  cfg: DigitGameConfig,
  draws: DigitDraw[],
  tickets = 5,
  B = 100
): DigitBacktestResult[] {
  return DIGIT_STRATEGIES.map((s) => backtestDigit(cfg, draws, s.id, tickets, B));
}

/* ---------------- 全量对比（诚实性核心） ---------------- */

export interface DigitCompareRow {
  id: DigitStrategyId;
  name: string;
  winRate: number;
  /** 与随机期望（去重解析值 N/100000）的差 */
  diff: number;
  distinctRate: number;
  matchedPerTicket: number;
  /** 与该注数解析概率的配对检验 p 值 */
  p: number;
}

export interface DigitCompareReport {
  game: string;
  gameName: string;
  tickets: number;
  draws: number;
  fromDate: string;
  toDate: string;
  /** 解析概率：去重 N/100000 与机选 1−(1−p)^N */
  prob: { distinct: number; random: number };
  /** 单注命中位数的理论期望 */
  matchedExpectation: number;
  rows: DigitCompareRow[];
}

/**
 * 三种方案的全量 walk-forward 对比。
 * 目的不是「找出更好的方案」——而是把「三者中奖概率相同、差异只在是否重复注」
 * 这件事用实测数字摆在页面上。
 */
export function compareDigit(cfg: DigitGameConfig, draws: DigitDraw[], tickets: number, from = 200): DigitCompareReport {
  const walks = new Map<DigitStrategyId, DigitWalk>(
    DIGIT_STRATEGIES.map((s) => [s.id, walkDigit(cfg, draws, from, s.id, tickets)])
  );
  const distinctProb = distinctBatchProb(cfg, tickets);
  const rows: DigitCompareRow[] = DIGIT_STRATEGIES.map((s) => {
    const w = walks.get(s.id)!;
    // 与「绝对公平」的解析概率做配对检验：没有任何方案能显著高于它
    const expected = new Float64Array(w.n).fill(distinctProb);
    return {
      id: s.id,
      name: s.name,
      winRate: mean(w.win),
      diff: mean(w.win) - distinctProb,
      distinctRate: mean(w.distinct),
      matchedPerTicket: mean(w.matched),
      p: pairedDiff(w.win, expected).p,
    };
  });

  return {
    game: cfg.key,
    gameName: cfg.name,
    tickets,
    draws: walks.get("best")!.n,
    fromDate: draws[from]?.date ?? "",
    toDate: draws.at(-1)?.date ?? "",
    prob: { distinct: distinctProb, random: randomBatchProb(cfg, tickets) },
    matchedExpectation: cfg.positions / (cfg.digitMax + 1),
    rows,
  };
}

/* ---------------- 页面主入口 ---------------- */

export interface DigitStrategyResult {
  strategy: DigitStrategyDef;
  /** 每注 5 位数字 */
  tickets: number[][];
  analysis: {
    backtest: DigitBacktestResult;
    /** 各位历史频率（近 100 期），用于形态参考 */
    recentFreq: number[][];
    /** 近 100 期和值均值 */
    avgSum: number;
    /** 近 100 期含重复数字的期数占比 */
    repeatRate: number;
  };
}

/** 取号专用入口，不附带历史回测；与回测共用 pickDigitBatch。 */
export function digitRecommendation(cfg: DigitGameConfig, draws: DigitDraw[], count = 5, salt = 0): number[][] {
  const rand = mulberry32(recommendationSeed(cfg.key, draws.at(-1)?.code ?? "empty", draws.at(-1)?.date ?? "", salt));
  return pickDigitBatch(cfg, draws, draws.length, "best", count, rand);
}

export function runDigitStrategy(
  cfg: DigitGameConfig,
  draws: DigitDraw[],
  id: DigitStrategyId,
  tickets = 5,
  seed = Math.floor(Math.random() * 2 ** 31)
): DigitStrategyResult {
  const def = DIGIT_STRATEGIES.find((s) => s.id === id)!;
  const i = draws.length;
  const rand = mulberry32(recommendationSeed(cfg.key, draws.at(-1)?.code ?? "empty", draws.at(-1)?.date ?? "", seed - 1));
  const batch = pickDigitBatch(cfg, draws, i, id, tickets, rand);

  const recent = draws.slice(-100);
  const recentFreq = Array.from({ length: cfg.positions }, (_, p) => {
    const c = new Array<number>(cfg.digitMax + 1).fill(0);
    for (const d of recent) c[d.digits[p]]++;
    return c;
  });

  return {
    strategy: def,
    tickets: batch,
    analysis: {
      backtest: backtestDigit(cfg, draws, id, tickets),
      recentFreq,
      avgSum: recent.length ? mean(recent.map((d) => digitSum(d))) : 0,
      repeatRate: recent.length ? recent.filter((d) => new Set(d.digits).size < d.digits.length).length / recent.length : 0,
    },
  };
}
