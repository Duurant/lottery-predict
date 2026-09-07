/**
 * 多方案预测策略引擎
 *
 * 五种方案：热号追踪 / 冷号回补 / 冷热结合 / 遗漏回归 / 纯机选基准
 * 每种方案输出：推荐号码（带理由标签）+ 方案分析（热冷概况、形态参考、历史回测命中对比）
 *
 * 说明：彩票开奖为独立随机事件，本引擎的「评分」只是对历史统计的趣味化呈现，
 * 任何方案都无法提高中奖概率，回测命中率也与随机基准处在同一水平——页面须向用户明示。
 */
import type { Draw, GameConfig } from "./games";
import {
  bigSmallRatio,
  mean,
  mulberry32,
  oddEvenRatio,
  stdDev,
  sumOf,
  type Zone,
} from "./stats";

/* ---------------- 方案定义 ---------------- */

export type StrategyId = "hot" | "cold" | "mix" | "regress" | "random";

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
    id: "random",
    name: "纯机选基准",
    tagline: "均匀随机，作为对照组",
    description:
      "完全均匀随机选号，不掺任何统计偏好。它同时是对照组：其他方案的历史回测命中率应与它处于同一水平——这正是「开奖无法被预测」的直观体现。",
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
  /** 平均每期命中个数（红区+蓝区） */
  avgHits: number;
  avgRedHits: number;
  avgBlueHits: number;
  /** 命中个数为 0 的期数占比 */
  zeroRate: number;
  bestHits: number;
  /** 随机选号的理论期望命中数 */
  expectation: number;
  /** 回测期数 */
  draws: number;
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

function makeTags(picked: number[], scored: ScoredNum[], z: FastZone, i: number): Pick[] {
  const byNum = new Map(scored.map((s) => [s.num, s]));
  const omission = omissionAt(z, i);
  const avgGap = avgGapAt(z, i);
  const theoretical = z.max / z.pick;
  // 窗口内每号理论期望出现次数（如大乐透前区 30×5/35 ≈ 4.3 次）
  const expectedRecent = (WINDOW * z.pick) / z.max;
  return picked.map((n) => {
    const s = byNum.get(n)!;
    const gap = avgGap[n] > 0 ? avgGap[n] : theoretical;
    let tag: Pick["tag"] = "均衡";
    if (s.recent >= Math.max(3, expectedRecent * 1.4)) tag = "热";
    else if (omission[n] >= gap * 1.8) tag = "回补";
    else if (omission[n] >= gap * 1.2) tag = "偏冷";
    return { num: n, tag, recent: s.recent, omission: omission[n] };
  });
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
  let redScored: ScoredNum[] = [];
  for (let t = 0; t < 60; t++) {
    redScored = scoreZone(redZone, i, id, window, rand);
    redPicked = pickTopK(redScored, redZone.pick, rand);
    if (shapeOk(redPicked, sumLo, sumHi, redZone.pick)) break;
  }
  const blueScored = scoreZone(blueZone, i, id, window, rand);
  const bluePicked = pickTopK(blueScored, blueZone.pick, rand);

  const [odd] = oddEvenRatio(redPicked);
  const oddEven = redZone.pick === 1 ? `${odd}:0` : `${odd}:${redPicked.length - odd}`;
  const [big, small] = bigSmallRatio(redPicked, redZone.max);
  return {
    red: makeTags(redPicked, redScored, redZone, i),
    blue: makeTags(bluePicked, blueScored, blueZone, i),
    sum: redPicked.reduce((a, b) => a + b, 0),
    oddEven,
    bigSmall: `${big}:${small}`,
  };
}

/* ---------------- 回测 ---------------- */

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 回测单个方案：最近 B 期，每期只用该期之前的数据选号，统计实际命中 */
export function backtestStrategy(
  cfg: GameConfig,
  draws: Draw[],
  id: StrategyId,
  B = BACKTEST_DRAWS
): BacktestResult {
  const redZone = makeFastZone(draws, "red", cfg.redMax);
  const blueZone = makeFastZone(draws, "blue", cfg.blueMax);
  const start = Math.max(draws.length - B, 1);

  let sumHits = 0;
  let sumRed = 0;
  let sumBlue = 0;
  let zeros = 0;
  let best = 0;
  let n = 0;

  for (let i = start; i < draws.length; i++) {
    const rand = mulberry32(hashSeed(cfg.key, id, draws[i].code));
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
    const redHits = combo.red.filter((p) => draws[i].red.includes(p.num)).length;
    const blueHits = combo.blue.filter((p) => draws[i].blue.includes(p.num)).length;
    const hits = redHits + blueHits;
    sumRed += redHits;
    sumBlue += blueHits;
    sumHits += hits;
    if (hits === 0) zeros++;
    best = Math.max(best, hits);
    n++;
  }

  const expectation =
    (cfg.redCount * cfg.redCount) / cfg.redMax + (cfg.blueCount * cfg.blueCount) / cfg.blueMax;

  return {
    strategy: id,
    avgHits: n ? sumHits / n : 0,
    avgRedHits: n ? sumRed / n : 0,
    avgBlueHits: n ? sumBlue / n : 0,
    zeroRate: n ? zeros / n : 0,
    bestHits: best,
    expectation,
    draws: n,
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
  const combos: Combo[] = [];
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
      backtest: backtestStrategy(cfg, draws, id),
    },
  };
}

/** 一次性回测全部方案（用于方案对比表） */
export function backtestAll(cfg: GameConfig, draws: Draw[], B = BACKTEST_DRAWS): BacktestResult[] {
  return STRATEGIES.map((s) => backtestStrategy(cfg, draws, s.id, B));
}
